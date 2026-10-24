import assert from 'node:assert/strict';
import test from 'node:test';
import { changedValues, toPayloadValue, usesDropdown } from '../src/components/profile/profileForm.js';

const fields = [
  { key: 'email', type: 'email' },
  { key: 'risk_tolerance', type: 'select', options: [{ value: 'moderate' }, { value: 'aggressive' }] },
  { key: 'top_n', type: 'number', min: 1, max: 50 },
];
const saved = { email: 'm@m', risk_tolerance: 'moderate', top_n: 10 };

test('only changed fields are sent, so untouched legacy values are not re-validated', () => {
  assert.deepEqual(changedValues(fields, saved, { ...saved }), {});
  assert.deepEqual(changedValues(fields, saved, { ...saved, risk_tolerance: 'aggressive' }), { risk_tolerance: 'aggressive' });
});

test('number inputs typed as strings are compared and sent as numbers', () => {
  assert.deepEqual(changedValues(fields, saved, { ...saved, top_n: '10' }), {});
  assert.deepEqual(changedValues(fields, saved, { ...saved, top_n: '25' }), { top_n: 25 });
  assert.equal(toPayloadValue(fields[2], ''), '');
});

test('long option lists use a dropdown, short ones use chips', () => {
  assert.equal(usesDropdown(fields[1]), false);
  assert.equal(usesDropdown({ type: 'select', options: Array.from({ length: 9 }, (_, i) => ({ value: i })) }), true);
  assert.equal(usesDropdown(fields[0]), false);
});
