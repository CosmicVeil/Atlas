import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { marketNewsStatus, parseWarningsResponse } from '../src/pages/marketNewsState.js';

const card = { id: '1', symbol: 'AAPL' };
const base = { loaded: true, error: '', available: true, negative: [], positive: [] };

test('parse keeps lists and the available flag from the backend', () => {
  assert.deepEqual(parseWarningsResponse({ negative: [card], positive: [], available: true }),
    { negative: [card], positive: [], available: true });
  assert.equal(parseWarningsResponse({ negative: [], positive: [], available: false }).available, false);
});

test('parse treats a missing flag as available and bad lists as empty', () => {
  assert.deepEqual(parseWarningsResponse({ negative: null }), { negative: [], positive: [], available: true });
});

test('parse turns error responses and empty bodies into an error', () => {
  assert.deepEqual(parseWarningsResponse({ error: 'Request failed (500)' }), { error: 'Request failed (500)' });
  assert.ok(parseWarningsResponse(null).error);
});

test('status separates loading, offline, empty and ready', () => {
  assert.equal(marketNewsStatus({ ...base, loaded: false }), 'loading');
  assert.equal(marketNewsStatus({ ...base, available: false }), 'unavailable');
  assert.equal(marketNewsStatus(base), 'empty');
  assert.equal(marketNewsStatus({ ...base, positive: [card] }), 'ready');
});

test('a failed request shows error only when there is nothing earlier to show', () => {
  assert.equal(marketNewsStatus({ ...base, error: 'down' }), 'error');
  assert.equal(marketNewsStatus({ ...base, error: 'down', negative: [card] }), 'ready');
});

test('Market News fetches without requiring a login token', async () => {
  const source = await readFile(new URL('../src/pages/MarketNews.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /if \(!token\) return/);
});
