import assert from 'node:assert/strict';
import test from 'node:test';

let logic;
try { logic = await import('../src/components/predictionBanner.js'); } catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}
const t0 = '2026-10-01T00:00:00Z';
const t1 = '2026-10-02T00:00:00Z';
const t2 = '2026-10-03T00:00:00Z';
function baseline() {
  assert.ok(logic, 'prediction banner logic must exist');
  return logic.reduceBanner(logic.INITIAL_BANNER_STATE, { type: 'baseline', since: t0 });
}
function poll(state, symbols = ['AAPL'], latestUpdatedAt = t1, tickers = null) {
  return logic.reduceBanner(state, { type: 'poll', response: { count: symbols.length, symbols, latestUpdatedAt }, tickers });
}

test('baseline selects newest valid timestamp and falls back when none exist', () => {
  baseline();
  assert.equal(logic.newestTimestamp([null, 'bad', t1, t0]), t1);
  assert.equal(logic.newestTimestamp([null, 'bad']), null);
  assert.equal(logic.baselineSince([{ predictionUpdatedAt: t0 }], t1, t2), t1);
  assert.equal(logic.baselineSince([], null, t0), t0);
});
test('poll displays new predictions and silently ignores empty or failed responses', () => {
  const state = baseline();
  for (const response of [null, { error: 'offline' }, { count: 0 }, { count: 1, symbols: null }, { count: 1, symbols: ['AAPL'], latestUpdatedAt: 'bad' }]) {
    assert.equal(logic.reduceBanner(state, { type: 'poll', response }).visible, false);
  }
  const next = poll(state);
  assert.equal(next.visible, true);
  assert.deepEqual(next.symbols, ['AAPL']);
  assert.equal(next.latestSeen, t1);
});
test('portfolio filtering is case insensitive and ignores other tickers', () => {
  assert.equal(poll(baseline(), ['MSFT'], t1, ['aapl']).visible, false);
  assert.deepEqual(poll(baseline(), ['AAPL', 'MSFT'], t1, ['aapl']).symbols, ['AAPL']);
  assert.deepEqual(logic.filterToTickers(['AAPL'], null), ['AAPL']);
});
test('dismiss advances timestamp so same prediction stays hidden and newer one reappears', () => {
  const dismissed = logic.reduceBanner(poll(baseline()), { type: 'dismiss' });
  assert.equal(dismissed.visible, false);
  assert.equal(dismissed.since, t1);
  assert.equal(poll(dismissed).visible, false);
  assert.equal(poll(dismissed, ['AAPL'], t2).visible, true);
});
test('reload and a fresh baseline reset banner state', () => {
  const shown = poll(baseline());
  const reloaded = logic.reduceBanner(shown, { type: 'reload' });
  assert.equal(reloaded.visible, false);
  assert.equal(reloaded.since, t1);
  const reset = logic.reduceBanner(shown, { type: 'baseline', since: t2 });
  assert.equal(reset.visible, false);
  assert.deepEqual(reset.symbols, []);
  assert.equal(reset.since, t2);
});
test('banner shows up to three tickers and the requested prompt', () => {
  baseline();
  assert.deepEqual(logic.bannerTickers(['A', 'B', 'C']), ['A', 'B', 'C']);
  assert.deepEqual(logic.bannerTickers(['A', 'B', 'C', 'D']), []);
  assert.equal(logic.BANNER_MESSAGE, 'New prediction came in. Reload?');
  assert.equal(logic.PREDICTION_POLL_INTERVAL_MS, 30000);
});
