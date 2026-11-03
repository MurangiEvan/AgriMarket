import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_RADIUS_KM, RADIUS_OPTIONS_KM, radiusOptionLabel } from './market';

test('the market radius choices and displayed labels match the supported range', () => {
  assert.deepEqual(RADIUS_OPTIONS_KM, [5, 10, 15, 20, 25, 30, 40, 50]);
  assert.equal(DEFAULT_RADIUS_KM, 10);
  assert.equal(radiusOptionLabel(5), '0–5 km');
  assert.equal(radiusOptionLabel(10), '10 km');
  assert.equal(radiusOptionLabel(50), '50 km');
});
