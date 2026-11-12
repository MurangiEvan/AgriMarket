import assert from 'node:assert/strict';
import test from 'node:test';

import { hashSessionToken } from './middleware/auth.js';
import { registrationSchema } from './validation.js';
import { canTransitionEnquiry, missingApplicationDetails, normalizeSouthAfricanPhone, assertPublishedForDiscovery } from './policies.js';

test('public registration cannot assign the administrator role', () => {
  assert.equal(
    registrationSchema.safeParse({ email: 'admin@example.test', password: 'long-password-123', role: 'admin' }).success,
    false,
  );
});

test('only published listings for approved businesses pass discovery policy', () => {
  assert.doesNotThrow(() => assertPublishedForDiscovery({ status: 'published', verificationStatus: 'approved' }));
  assert.throws(() => assertPublishedForDiscovery({ status: 'pending', verificationStatus: 'approved' }));
  assert.throws(() => assertPublishedForDiscovery({ status: 'published', verificationStatus: 'pending' }));
});

test('enquiry statuses move forward without reopening closed enquiries', () => {
  assert.equal(canTransitionEnquiry('new', 'read'), true);
  assert.equal(canTransitionEnquiry('read', 'responded'), true);
  assert.equal(canTransitionEnquiry('responded', 'closed'), true);
  assert.equal(canTransitionEnquiry('closed', 'read'), false);
  assert.equal(canTransitionEnquiry('read', 'new'), false);
});

test('South African mobile numbers normalize to international format', () => {
  assert.equal(normalizeSouthAfricanPhone('082 123 4567'), '+27821234567');
  assert.equal(normalizeSouthAfricanPhone('+27821234567'), '+27821234567');
  assert.equal(normalizeSouthAfricanPhone('012 345 6789'), '+27123456789');
  assert.equal(normalizeSouthAfricanPhone(null), null);
  assert.throws(() => normalizeSouthAfricanPhone('12345'));
});

test('session hashes are keyed by the server secret', () => {
  const token = 'opaque-random-session-token';
  assert.equal(hashSessionToken(token, 'secret-one'), hashSessionToken(token, 'secret-one'));
  assert.notEqual(hashSessionToken(token, 'secret-one'), hashSessionToken(token, 'secret-two'));
});
test('a seller application needs a complete business profile before it reaches the admin', () => {
  const complete = { name: 'Thabo Tomatoes', description: 'Family farm growing tomatoes.', town: 'Tzaneen', contactEmail: null, contactPhone: '+27821234567', whatsappPhone: null };
  assert.deepEqual(missingApplicationDetails(complete), []);
  assert.deepEqual(missingApplicationDetails({ ...complete, description: 'Farm' }), ['a business description (at least 10 characters)']);
  assert.deepEqual(missingApplicationDetails({ ...complete, town: '  ' }), ['town or area']);
  assert.deepEqual(missingApplicationDetails({ ...complete, contactPhone: null }), ['a contact email, mobile number or WhatsApp number']);
  assert.deepEqual(missingApplicationDetails({ ...complete, contactPhone: null, whatsappPhone: '+27821234567' }), []);
});
