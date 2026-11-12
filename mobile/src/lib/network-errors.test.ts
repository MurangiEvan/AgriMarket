import assert from 'node:assert/strict';
import test from 'node:test';

import { isLocalDevelopmentApi, unreachableMessage } from './network-errors';

test('only a computer on the local network counts as a development API', () => {
  assert.equal(isLocalDevelopmentApi('http://192.168.1.10:4000/api/v1'), true);
  assert.equal(isLocalDevelopmentApi('http://localhost:4000/api/v1'), true);
  assert.equal(isLocalDevelopmentApi('http://10.0.0.5:4000/api/v1'), true);
  assert.equal(isLocalDevelopmentApi('https://agrimarket-f059.onrender.com/api/v1'), false);
  assert.equal(isLocalDevelopmentApi('not a url'), false);
});

test('the released app never tells users to check the computer Wi-Fi', () => {
  const live = 'https://agrimarket-f059.onrender.com/api/v1';
  assert.doesNotMatch(unreachableMessage(true, live), /Wi-Fi|computer/);
  assert.match(unreachableMessage(true, live), /upload was interrupted/);
  assert.doesNotMatch(unreachableMessage(false, live), /Wi-Fi|computer/);
  assert.match(unreachableMessage(false, 'http://192.168.1.10:4000/api/v1'), /same Wi-Fi/);
});
