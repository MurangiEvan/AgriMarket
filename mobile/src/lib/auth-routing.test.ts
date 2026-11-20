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

test('help and support opens for signed-out and signed-in users of every role', () => {
  assert.equal(getAuthRedirect('signedOut', null, 'help'), null);
  assert.equal(getAuthRedirect('signedIn', 'buyer', 'help'), null);
  assert.equal(getAuthRedirect('signedIn', 'seller', 'help'), null);
  assert.equal(getAuthRedirect('signedIn', 'admin', 'help'), null);
});

test('authenticated users are sent to their role home and cannot open role-restricted homes', () => {
  assert.equal(getAuthRedirect('signedIn', 'buyer', ''), '/market');
  assert.equal(getAuthRedirect('signedIn', 'seller', 'sign-in'), '/account');
  assert.equal(getAuthRedirect('signedIn', 'admin', 'admin'), null);
  assert.equal(getAuthRedirect('signedIn', 'buyer', 'admin'), '/market');
});

test('sellers can buy too, so they can open the Near me market; administrators cannot', () => {
  assert.equal(getAuthRedirect('signedIn', 'seller', 'market'), null);
  assert.equal(getAuthRedirect('signedIn', 'buyer', 'market'), null);
  assert.equal(getAuthRedirect('signedIn', 'admin', 'market'), '/admin');
});

test('the Privacy notice and Terms can be read before signing up and while signed in', () => {
  for (const route of ['privacy', 'terms']) {
    assert.equal(getAuthRedirect('signedOut', null, route), null);
    assert.equal(getAuthRedirect('signedIn', 'buyer', route), null);
    assert.equal(getAuthRedirect('signedIn', 'seller', route), null);
  }
});
