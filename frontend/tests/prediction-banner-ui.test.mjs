import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
async function bundle(contents, plugins = []) {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-prediction-test-'));
  try {
    const outfile = join(directory, 'test.cjs');
    await build({ stdin: { contents, resolveDir: root, loader: 'jsx' }, outfile,
      bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', logLevel: 'silent',
      define: { 'import.meta.env.VITE_API_URL': '"http://offline.test"' }, plugins });
    return createRequire(import.meta.url)(outfile);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

// The hook runs against a tiny deterministic React scheduling boundary; fetch,
// visibility and timers are fakes, so no server or browser is needed.
function hookRuntime() {
  let slots = [], cursor = 0, effects = [], props, result, hook;
  const runtime = {
    useState(initial) { return runtime.useReducer((value, action) => typeof action === 'function' ? action(value) : action, typeof initial === 'function' ? initial() : initial); },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useReducer(reducer, initial) {
      const i = cursor++;
      slots[i] ??= { value: initial };
      return [slots[i].value, action => { slots[i].value = reducer(slots[i].value, action); runtime.render(props); }];
    },
    useCallback(fn, deps) { return runtime.useMemo(() => fn, deps); },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((value, j) => value !== slots[i].deps[j])) slots[i] = { value: fn(), deps };
      return slots[i].value;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !deps || deps.some((value, j) => value !== slots[i].deps?.[j])) {
        const previous = slots[i];
        slots[i] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
    render(nextProps) {
      props = nextProps; cursor = 0; result = hook(props);
      const pending = effects; effects = []; pending.forEach(fn => fn());
      return result;
    },
    mount(fn, initial) { hook = fn; return runtime.render(initial); },
    unmount() { slots.forEach(slot => slot.cleanup?.()); slots = []; },
    get result() { return result; },
  };
  return runtime;
}
const fakeReact = { name: 'hook-runtime', setup(builder) {
  builder.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'test-hooks' }));
  builder.onLoad({ filter: /.*/, namespace: 'test-hooks' }, () => ({ resolveDir: root, contents:
    `export { default } from ${JSON.stringify(join(root, 'node_modules/react/index.js'))};
     export * from ${JSON.stringify(join(root, 'node_modules/react/index.js'))};
     export const useState = (...a) => globalThis.predictionHooks.useState(...a);
     export const useRef = (...a) => globalThis.predictionHooks.useRef(...a);
     export const useReducer = (...a) => globalThis.predictionHooks.useReducer(...a);
     export const useEffect = (...a) => globalThis.predictionHooks.useEffect(...a);
     export const useCallback = (...a) => globalThis.predictionHooks.useCallback(...a);
     export const useMemo = (...a) => globalThis.predictionHooks.useMemo(...a);` }));
} };

test('polling runs every 30 seconds only while visible, ignores failures, and stops on logout/unmount', async t => {
  assert.ok(existsSync(join(root, 'src/components/usePredictionBanner.js')), 'polling hook must exist');
  const { default: hook } = await bundle(`export { default } from './src/components/usePredictionBanner.js';`, [fakeReact]);
  const runtime = hookRuntime();
  globalThis.predictionHooks = runtime;
  const intervals = new Map(); let id = 0, requests = [], response = { latestUpdatedAt: '2026-10-01T00:00:00Z' };
  t.mock.method(globalThis, 'setInterval', (fn, ms) => { assert.equal(ms, 30000); intervals.set(++id, fn); return id; });
  t.mock.method(globalThis, 'clearInterval', key => intervals.delete(key));
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    if (response instanceof Error) throw response;
    return { json: async () => response };
  });
  globalThis.document = { visibilityState: 'visible' };
  t.after(() => { runtime.unmount(); delete globalThis.predictionHooks; delete globalThis.document; });
  const props = { token: 'test-token', enabled: true, tickers: ['aapl'] };
  runtime.mount(hook, props);
  const tick = async () => { await Promise.all([...intervals.values()].map(fn => fn())); };
  await tick(); assert.equal(requests.length, 0, 'no polling until baseline');
  await runtime.result.setBaseline([]);
  assert.equal(requests[0].url, 'http://offline.test/api/ai/predictions/latest');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer test-token');
  globalThis.document.visibilityState = 'hidden';
  await tick(); assert.equal(requests.length, 1);
  globalThis.document.visibilityState = 'visible';
  response = new Error('offline'); await tick(); assert.equal(runtime.result.visible, false);
  response = { count: 2, symbols: ['AAPL', 'MSFT'], latestUpdatedAt: '2026-10-02T00:00:00Z' };
  await tick(); assert.equal(runtime.result.visible, true); assert.deepEqual(runtime.result.symbols, ['AAPL']);
  assert.match(requests.at(-1).url, /since=2026-10-01T00%3A00%3A00Z/);
  runtime.result.dismiss(); await tick(); assert.equal(runtime.result.visible, false);
  runtime.render({ ...props, token: null });
  assert.equal(intervals.size, 0); assert.equal(runtime.result.visible, false);
  runtime.render(props); assert.equal(intervals.size, 1);
  runtime.render({ ...props, enabled: false }); assert.equal(intervals.size, 0);
  runtime.render(props); runtime.unmount(); assert.equal(intervals.size, 0);
});

test('late polling results after unmount are ignored and baseline failure falls back to loaded stock time', async t => {
  assert.ok(existsSync(join(root, 'src/components/usePredictionBanner.js')), 'polling hook must exist');
  const { default: hook } = await bundle(`export { default } from './src/components/usePredictionBanner.js';`, [fakeReact]);
  const runtime = hookRuntime(); globalThis.predictionHooks = runtime;
  let tick, resolve;
  globalThis.document = { visibilityState: 'visible' };
  t.mock.method(globalThis, 'setInterval', fn => { tick = fn; return 1; });
  t.mock.method(globalThis, 'clearInterval', () => {});
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });
  t.after(() => { delete globalThis.predictionHooks; delete globalThis.document; });
  runtime.mount(hook, { token: 'test', enabled: true, tickers: null });
  await runtime.result.setBaseline([{ predictionUpdatedAt: '2026-10-01T00:00:00Z' }]);
  fetch.mock.mockImplementation(() => new Promise(done => { resolve = done; }));
  const pending = tick();
  runtime.unmount();
  resolve({ json: async () => ({ count: 1, symbols: ['AAPL'], latestUpdatedAt: '2026-10-02T00:00:00Z' }) });
  await pending;
  assert.equal(runtime.result.visible, false);
});

test('banner renders an accessible inline prompt, ticker limit and working reload/dismiss controls', async () => {
  assert.ok(existsSync(join(root, 'src/components/PredictionBanner.jsx')), 'banner component must exist');
  const component = await bundle(`
    import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server';
    import Banner from './src/components/PredictionBanner.jsx';
    export const render = props => renderToStaticMarkup(<Banner {...props}/>);
    export const tree = props => Banner(props);
  `);
  const html = component.render({ symbols: ['AAPL'], reloading: false });
  assert.match(html, /role="status"/); assert.match(html, /aria-live="polite"/);
  assert.match(html, /New prediction came in. Reload\?/); assert.match(html, /AAPL/);
  assert.match(html, /aria-label="Dismiss"/);
  assert.doesNotMatch(component.render({ symbols: ['AAA', 'BBB', 'CCC', 'DDD'] }), /AAA|BBB|CCC|DDD/);
  let reloads = 0, dismisses = 0;
  const tree = component.tree({ symbols: [], onReload: () => reloads++, onDismiss: () => dismisses++ });
  function walk(node) {
    if (!node || typeof node !== 'object') return [];
    return [node, ...[node.props?.children].flat(Infinity).flatMap(walk)];
  }
  const nodes = walk(tree);
  nodes.find(n => n.props?.onClick && n.props['aria-label'] !== 'Dismiss').props.onClick();
  nodes.find(n => n.props?.['aria-label'] === 'Dismiss').props.onClick();
  assert.equal(reloads, 1); assert.equal(dismisses, 1);
  assert.match(component.render({ symbols: [], reloading: true }), /disabled/);
});

function walk(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(walk)];
}
const textOf = node => [node?.props?.children].flat(Infinity).filter(x => typeof x === 'string').join('');
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const pageContexts = { name: 'offline-page-contexts', setup(builder) {
  builder.onResolve({ filter: /context\/(AuthContext|CurrencyContext)$/ }, args => ({ path: args.path, namespace: 'context-test' }));
  builder.onLoad({ filter: /.*/, namespace: 'context-test' }, () => ({ contents: `
    export const useAuth = () => ({ token: 'test-token' });
    export const useCurrency = () => ({ currency: 'USD', convertAndFormat: n => '$' + n, getCurrencySymbol: () => '$', EXCHANGE_RATES: { USD: { rate: 1 } } });
  ` }));
  builder.onResolve({ filter: /^react-router-dom$/ }, () => ({ path: 'router', namespace: 'router-test' }));
  builder.onLoad({ filter: /.*/, namespace: 'router-test' }, () => ({ contents: `
    const params = new URLSearchParams(); export const useSearchParams = () => [params]; export const useNavigate = () => () => {};
  ` }));
} };

async function pageHarness(t, page) {
  const { default: Page } = await bundle(`export { default } from './src/pages/${page}.jsx';`, [fakeReact, pageContexts]);
  const runtime = hookRuntime(); globalThis.predictionHooks = runtime;
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  globalThis.document = { visibilityState: 'visible' };
  const intervals = new Map(); let id = 0;
  t.mock.method(globalThis, 'setInterval', fn => { intervals.set(++id, fn); return id; });
  t.mock.method(globalThis, 'clearInterval', key => intervals.delete(key));
  const stock = { ticker: 'AAPL', name: 'Apple', price: 120, recommendation: 'buy', confidence: 88,
    riskLevel: 'low', potentialReturn: 25, source: 'news', predictionUpdatedAt: '2026-10-01T00:00:00Z', keyPoints: ['Growth'] };
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    if (url.includes('/top-1000') || url.endsWith('/portfolio-recommend')) {
      const analysisRequests = requests.filter(request => request.url.includes('/top-1000')
        || request.url.endsWith('/portfolio-recommend') || request.url.endsWith('/predictions/latest'));
      assert.ok(analysisRequests.at(-2)?.url.endsWith('/predictions/latest'), 'capture baseline before analysis request');
    }
    let data;
    if (url.includes('/predictions/latest')) data = url.includes('since=')
      ? { latestUpdatedAt: '2026-10-02T00:00:00Z', count: 2, symbols: ['AAPL', 'MSFT'] }
      : { latestUpdatedAt: '2026-10-01T00:00:00Z' };
    else if (url.includes('/top-1000')) data = { recommended: [stock], worst: [], lastUpdated: '2026-10-01T00:00:00Z' };
    else if (url.endsWith('/analyze')) data = { ...stock, companyName: 'Apple', currentPrice: 120, pros: [], cons: [], riskFactors: [] };
    else if (url.endsWith('/portfolio-recommend')) data = { overallAssessment: 'Existing recommendations', recommendations: [] };
    else if (url.includes('/holdings')) data = { holdings: [{ id: 1, symbol: 'AAPL', shares: 1, buy_price: 100, current_price: 120, amount_invested: 100, current_value: 120, gain_loss: 20, gain_loss_pct: 20 }], summary: { total_invested: 100, total_value: 120, total_gain_loss: 20, total_gain_loss_pct: 20 } };
    else if (url.includes('/news/')) data = { negative: [], positive: [] };
    else if (url.includes('/portfolios')) data = [{ id: 1, name: 'Test Portfolio', holdings_count: 1 }];
    else throw new Error('Unexpected offline request: ' + url);
    return { ok: true, json: async () => data };
  });
  t.after(() => { runtime.unmount(); delete globalThis.predictionHooks; delete globalThis.localStorage; delete globalThis.document; });
  runtime.mount(Page, {}); await flush();
  return { runtime, requests, tick: async () => { await Promise.all([...intervals.values()].map(fn => fn())); await flush(); } };
}

test('AI page shows news badges and reloads both list and active search in place', async t => {
  const { runtime, requests, tick } = await pageHarness(t, 'AIAnalysisScreen');
  const card = walk(runtime.result).find(node => node.type?.name === 'StockCard');
  assert.ok(walk(card.type(card.props)).some(node => textOf(node) === 'NEWS'), 'news card badge');
  // Submit the real search form and retain the result during banner reload.
  const input = walk(runtime.result).find(node => node.props?.placeholder?.includes('AAPL'));
  assert.ok(input, 'stock search input'); input.props.onChange({ target: { value: 'AAPL' } });
  const form = walk(runtime.result).find(node => node.type === 'form' && walk(node).some(n => n.props?.placeholder?.includes('AAPL')));
  await form.props.onSubmit({ preventDefault() {} }); await flush();
  assert.ok(walk(runtime.result).some(node => textOf(node) === 'NEWS'), 'search result news badge');
  await tick();
  const banner = walk(runtime.result).find(node => node.type?.name === 'PredictionBanner');
  assert.ok(banner, 'new predictions appear below page header');
  const beforeLists = requests.filter(r => r.url.endsWith('/top-1000')).length;
  const beforeSearch = requests.filter(r => r.url.endsWith('/analyze')).length;
  await banner.props.onReload(); await flush();
  assert.equal(requests.filter(r => r.url.endsWith('/top-1000')).length, beforeLists + 1);
  assert.equal(requests.filter(r => r.url.endsWith('/analyze')).length, beforeSearch + 1);
  assert.equal(walk(runtime.result).filter(node => node.type?.name === 'PredictionBanner').length, 0);
});

test('portfolio banner filters tickers, appears in modal and page, and reloads existing analysis', async t => {
  const { runtime, requests, tick } = await pageHarness(t, 'Portfolio');
  const portfolio = walk(runtime.result).find(node => node.key === '1' && node.props.onClick);
  assert.ok(portfolio); portfolio.props.onClick(); await flush();
  const button = walk(runtime.result).find(node => node.props?.onClick && textOf(node).includes('AI Analysis'));
  button.props.onClick(); await flush(); await tick();
  let banner = walk(runtime.result).find(node => node.type?.name === 'PredictionBanner');
  assert.ok(banner, 'portfolio modal shows banner');
  assert.deepEqual(banner.props.symbols, ['AAPL']);
  const modal = walk(runtime.result).find(node => node.props?.className?.includes('fixed inset-0') && walk(node).some(n => n.type?.name === 'PredictionBanner'));
  assert.ok(modal, 'banner is inside modal');
  assert.ok(walk(modal).some(node => node.props?.className?.split(' ').includes('mb-6')
    && [node.props.children].flat().includes(banner)), 'modal banner has bottom spacing');
  modal.props.onClick();
  banner = walk(runtime.result).find(node => node.type?.name === 'PredictionBanner');
  assert.ok(banner, 'banner remains visible on page after closing modal');
  const actionRow = walk(runtime.result).find(node => {
    const children = [node.props?.children].flat(Infinity);
    return children.some(child => textOf(child).includes('AI Analysis'))
      && children.some(child => textOf(child).includes('Add Stock'));
  });
  assert.ok(actionRow, 'portfolio action buttons remain together');
  assert.ok(!walk(actionRow).includes(banner), 'banner occupies its own row without squeezing action buttons');
  const count = requests.filter(r => r.url.endsWith('/portfolio-recommend')).length;
  await banner.props.onReload(); await flush();
  assert.equal(requests.filter(r => r.url.endsWith('/portfolio-recommend')).length, count + 1);
  assert.equal(walk(runtime.result).filter(node => node.type?.name === 'PredictionBanner').length, 0);
  assert.ok(requests.filter(r => r.url.includes('/predictions/latest')).every(r => !r.options.body && !r.url.includes('AAPL')));
});


test('hook preserves predictions arriving between the data response and baseline installation', async t => {
  const { default: hook } = await bundle(`export { default } from './src/components/usePredictionBanner.js';`, [fakeReact]);
  const runtime = hookRuntime(); globalThis.predictionHooks = runtime;
  globalThis.document = { visibilityState: 'visible' };
  let tick;
  const before = '2026-10-01T00:00:00Z', after = '2026-10-02T00:00:00Z';
  let latest = before;
  const requests = [];
  t.mock.method(globalThis, 'setInterval', fn => { tick = fn; return 1; });
  t.mock.method(globalThis, 'clearInterval', () => {});
  t.mock.method(globalThis, 'fetch', async url => {
    requests.push(url);
    return { json: async () => url.includes('since=')
      ? { latestUpdatedAt: latest, count: 1, symbols: ['AAPL'] }
      : { latestUpdatedAt: latest } };
  });
  t.after(() => { runtime.unmount(); delete globalThis.predictionHooks; delete globalThis.document; });
  runtime.mount(hook, { token: 'test', enabled: true });
  const baseline = await runtime.result.captureBaseline();
  // Data returned without the new prediction; it arrives before baseline installation.
  latest = after;
  await runtime.result.setBaseline([], baseline);
  await tick();
  assert.match(requests.at(-1), /since=2026-10-01T00%3A00%3A00Z/);
  assert.equal(requests.length, 2, 'installing the baseline must not fetch a newer timestamp');
  assert.equal(runtime.result.visible, true);
  assert.deepEqual(runtime.result.symbols, ['AAPL']);
});
