import assert from 'node:assert/strict';
import test from 'node:test';

import { getAuthRedirect } from './auth-routing';

test('a fresh signed-out launch redirects to sign in and leaves public auth routes accessible', () => {
  assert.equal(getAuthRedirect('signedOut', null, ''), '/sign-in');
  assert.equal(getAuthRedirect('signedOut', null, 'market'), '/sign-in');
  assert.equal(getAuthRedirect('signedOut', null, 'sign-in'), null);
  assert.equal(getAuthRedirect('signedOut', null, 'sign-up'), null);
  assert.equal(getAuthRedirect('loading', null, 'market'), null);
  assert.equal(getAuthRedirect('signedOut', null, 'forgot-password'), null);
});

test('the emailed reset link opens whether or not the device is signed in', () => {
  assert.equal(getAuthRedirect('signedOut', null, 'reset-password'), null);
  assert.equal(getAuthRedirect('signedIn', 'seller', 'reset-password'), null);
});

test('authenticated users are sent to their role home and cannot open role-restricted homes', () => {
  assert.equal(getAuthRedirect('signedIn', 'buyer', ''), '/market');
  assert.equal(getAuthRedirect('signedIn', 'seller', 'sign-in'), '/account');
  assert.equal(getAuthRedirect('signedIn', 'admin', 'admin'), null);
  assert.equal(getAuthRedirect('signedIn', 'seller', 'market'), '/account');
  assert.equal(getAuthRedirect('signedIn', 'buyer', 'admin'), '/market');
});
