import assert from 'node:assert/strict';
import test from 'node:test';

const interactions = await import('../src/components/home/introInteractions.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const reduce = (scene, action, state = interactions.INITIAL_STATE?.[scene]) => {
  assert.equal(typeof interactions.reduceInteraction, 'function');
  return interactions.reduceInteraction(scene, state, action);
};

test('portfolio selection and hover are independent and ignore invalid rows', () => {
  const state = reduce('portfolio', { type: 'select', index: 0 });
  assert.equal(state.selected, 0);
  assert.equal(reduce('portfolio', { type: 'hover', index: 2 }, state).hovered, 2);
  assert.equal(reduce('portfolio', { type: 'select', index: 9 }, state), state);
  assert.equal(reduce('portfolio', { type: 'hover', index: null }, state).hovered, null);
});

test('timeframes select different candles and chart inspection clamps at its edges', () => {
  const state = reduce('stock-data', { type: 'timeframe', value: '1D' });
  assert.equal(state.timeframe, '1D');
  assert.equal(reduce('stock-data', { type: 'crosshair', value: -2 }, state).crosshair, 0);
  assert.equal(reduce('stock-data', { type: 'crosshair', value: 5 }, state).crosshair, 1);
  assert.equal(reduce('stock-data', { type: 'timeframe', value: 'invalid' }, state), state);
  assert.equal(new Set(Object.values(interactions.TIMEFRAMES).map(JSON.stringify)).size, 3);
});

test('AI ticker notes toggle and a pinned dot persists through hover', () => {
  let state = reduce('ai-analysis', { type: 'note', index: 0 });
  assert.equal(state.note, 0);
  assert.equal(reduce('ai-analysis', { type: 'note', index: 0 }, state).note, null);
  state = reduce('ai-analysis', { type: 'pin', index: 41 }, state);
  assert.equal(state.dot, 41);
  assert.equal(state.pinned, true);
  assert.equal(reduce('ai-analysis', { type: 'dot', index: 50 }, state).dot, 41);
  assert.equal(reduce('ai-analysis', { type: 'pin', index: 1000 }, state), state);
});

test('advisor questions each select a factual summary and two pros and cons', () => {
  assert.equal(typeof interactions.reduceInteraction, 'function');
  for (let index = 0; index < 3; index++) {
    assert.equal(reduce('advisor', { type: 'question', index }).question, index);
    const answer = interactions.QUESTIONS[index];
    assert.equal(answer.factors.filter(x => x.startsWith('Pro ·')).length, 2);
    assert.equal(answer.factors.filter(x => x.startsWith('Con ·')).length, 2);
    assert.doesNotMatch(JSON.stringify(answer), /\b(buy|sell|should invest)\b/i);
  }
  const state = interactions.INITIAL_STATE.advisor;
  assert.equal(reduce('advisor', { type: 'question', index: -1 }, state), state);
});

test('profile goal overrides toggle from the displayed scroll state; currency and risk persist', () => {
  let state = reduce('profile', { type: 'goal', index: 0, current: true });
  assert.equal(state.goals[0], false);
  state = reduce('profile', { type: 'goal', index: 0, current: true }, state);
  assert.equal(state.goals[0], true);
  state = reduce('profile', { type: 'risk', value: 200 }, state);
  assert.equal(state.risk, 100);
  assert.equal(reduce('profile', { type: 'risk', value: -1 }, state).risk, 0);
  assert.equal(reduce('profile', { type: 'risk', value: NaN }, state), state);
  state = reduce('profile', { type: 'currency', value: 'GBP' }, state);
  assert.equal(state.currency, 'GBP');
  assert.equal(reduce('profile', { type: 'currency', value: 'JPY' }, state), state);
  assert.equal(interactions.formatCurrency('USD'), '$128,450');
  assert.equal(interactions.formatCurrency('EUR'), '€118,174');
  assert.equal(interactions.formatCurrency('GBP'), '£100,191');
});

test('risk keyboard controls step, clamp, and leave unrelated keys alone', () => {
  assert.equal(typeof interactions.sliderKey, 'function');
  for (const [value, key, expected] of [[50,'ArrowRight',60], [50,'ArrowUp',60], [50,'ArrowLeft',40], [50,'ArrowDown',40], [95,'ArrowRight',100], [5,'ArrowLeft',0], [50,'Home',0], [50,'End',100], [50,'Tab',50]]) {
    assert.equal(interactions.sliderKey(value, key), expected);
  }
});

test('every bar selects its own explanation; invalid actions preserve state', () => {
  for (let index = 0; index < 6; index++) assert.equal(reduce('insights', { type: 'bar', index }).bar, index);
  const state = interactions.INITIAL_STATE.insights;
  assert.equal(reduce('insights', { type: 'bar', index: 6 }, state), state);
  assert.equal(reduce('insights', { type: 'unknown' }, state), state);
});

test('dot hit testing covers all 1000 deterministic samples and clamps edges', () => {
  assert.equal(typeof interactions.dotAt, 'function');
  const seen = new Set();
  for (let row = 0; row < 25; row++) for (let col = 0; col < 40; col++) {
    const dot = interactions.dotAt((col + 0.5) / 40, (row + 0.5) / 25);
    assert.equal(dot.index, row * 40 + col);
    assert.equal(interactions.dotAt((col + 0.5) / 40, (row + 0.5) / 25).ticker, dot.ticker);
    seen.add(dot.index);
  }
  assert.equal(seen.size, 1000);
  assert.equal(interactions.dotAt(-1, -1).index, 0);
  assert.equal(interactions.dotAt(1, 1).index, 999);
});

test('pointer tilt remains within four degrees', () => {
  assert.equal(typeof interactions.getTilt, 'function');
  assert.deepEqual(interactions.getTilt(0.5, 0.5), { rotateX: 0, rotateY: 0 });
  for (const x of [-10, 0, 0.5, 1, 10]) for (const y of [-10, 0, 0.5, 1, 10]) {
    const tilt = interactions.getTilt(x, y);
    assert.ok(Math.abs(tilt.rotateX) <= 4 && Math.abs(tilt.rotateY) <= 4);
  }
});


test('control progress updates defer render-time notifications, coalesce, rewind and clean up', async () => {
  const { subscribeIntroStep } = await import('../src/components/home/useIntroStep.js');
  let value = 0.35;
  let listener;
  const pending = new Set();
  const updates = [];
  const t = { get: () => value, on: (name, callback) => {
    assert.equal(name, 'change');
    listener = callback;
    return () => { listener = undefined; };
  } };
  const schedule = callback => pending.add(callback);
  const cancel = callback => pending.delete(callback);
  const flush = () => { const callbacks = [...pending]; pending.clear(); callbacks.forEach(callback => callback()); };
  const cleanup = subscribeIntroStep(t, step => updates.push(step), { schedule, cancel });
  assert.deepEqual(updates, []);
  flush();
  assert.deepEqual(updates, [35]);
  // Motion can publish from useTransform while a parent is rendering.
  value = 0.36;
  listener(value);
  value = 0.72;
  listener(value);
  assert.deepEqual(updates, [35], 'must not update Controls during Scene render');
  assert.equal(pending.size, 1);
  flush();
  assert.deepEqual(updates, [35, 72]);
  value = 0.2;
  listener(value);
  flush();
  assert.deepEqual(updates, [35, 72, 20]);
  value = 0.9;
  listener(value);
  cleanup();
  assert.equal(listener, undefined);
  assert.equal(pending.size, 0);
  flush();
  assert.deepEqual(updates, [35, 72, 20]);
});
