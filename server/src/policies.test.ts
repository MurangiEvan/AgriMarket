import assert from 'node:assert/strict';
import test from 'node:test';

import { hashSessionToken, isRoleAllowed } from './middleware/auth.js';
import { anonymisedEmail, hasAcceptedCurrentPrivacy, PRIVACY_VERSION } from './privacy.js';
import { deletionDecisionSchema, droneLicenceSchema, registrationSchema, reportCreateSchema, verificationDecisionSchema } from './validation.js';
import { assertCanBecomeSeller, assertDroneLicenceConfirmed, assertDroneLicenceOnFile, assertListingReportable, assertNotOwnListing, canTransitionEnquiry, missingApplicationDetails, normalizeSouthAfricanPhone, assertPublishedForDiscovery } from './policies.js';

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

test('only live listings can be reported, and never by their own seller', () => {
  const seller = 'seller-1';
  const live = { status: 'published' as const, verificationStatus: 'approved', ownerId: seller };
  assert.doesNotThrow(() => assertListingReportable(live, 'buyer-1'));
  assert.throws(() => assertListingReportable(live, seller), /own listing/);
  assert.throws(() => assertListingReportable({ ...live, status: 'archived' }, 'buyer-1'), /not found/);
  assert.throws(() => assertListingReportable({ ...live, verificationStatus: 'pending' }, 'buyer-1'), /not found/);
  assert.throws(() => assertListingReportable(undefined, 'buyer-1'), /not found/);
});

test('a report needs a known reason and keeps details short', () => {
  const base = { targetType: 'listing', targetId: '6f7c2a2e-9d1b-4a35-8c34-1f0f5b1c2d3e', reason: 'scam_or_fraud' };
  assert.equal(reportCreateSchema.safeParse(base).success, true);
  assert.equal(reportCreateSchema.safeParse({ ...base, reason: 'dislike' }).success, false);
  assert.equal(reportCreateSchema.safeParse({ ...base, details: 'x'.repeat(1001) }).success, false);
  assert.equal(reportCreateSchema.safeParse({ ...base, reporterId: 'someone-else' }).success, false);
});

test('an account is only created once the Privacy notice and Terms are accepted', () => {
  const base = { email: 'buyer@example.test', password: 'long-password-123', role: 'buyer' };
  assert.equal(registrationSchema.safeParse({ ...base, acceptPrivacy: true }).success, true);
  assert.equal(registrationSchema.safeParse(base).success, false);
  assert.equal(registrationSchema.safeParse({ ...base, acceptPrivacy: false }).success, false);
});

test('a rejected deletion request must tell the user why', () => {
  assert.equal(deletionDecisionSchema.safeParse({ decision: 'approved' }).success, true);
  assert.equal(deletionDecisionSchema.safeParse({ decision: 'rejected' }).success, false);
  assert.equal(deletionDecisionSchema.safeParse({ decision: 'rejected', note: '   ' }).success, false);
  assert.equal(deletionDecisionSchema.safeParse({ decision: 'rejected', note: 'A fraud report about your listing is still open.' }).success, true);
});

test('privacy acceptance is tied to the current notice version, and deleted emails can never be real', () => {
  assert.equal(hasAcceptedCurrentPrivacy(PRIVACY_VERSION), true);
  assert.equal(hasAcceptedCurrentPrivacy('2020-01-01'), false);
  assert.equal(hasAcceptedCurrentPrivacy(null), false);
  assert.match(anonymisedEmail('abc'), /^deleted-abc@deleted\.agrimarket\.invalid$/);
});

test('a drone listing needs both SACAA numbers on file', () => {
  assert.doesNotThrow(() => assertDroneLicenceOnFile({ sacaaRplNumber: 'RPL-0123', sacaaRocNumber: 'ROC-0456' }));
  assert.throws(() => assertDroneLicenceOnFile({ sacaaRplNumber: 'RPL-0123', sacaaRocNumber: null }), /Remote Operating Certificate/);
  assert.throws(() => assertDroneLicenceOnFile({ sacaaRplNumber: null, sacaaRocNumber: null }), /Remote Pilot Licence/);
});

test('publishing a drone listing needs the licence checked, now or earlier', () => {
  assert.throws(() => assertDroneLicenceConfirmed(true, false, false), /SACAA licence/);
  assert.doesNotThrow(() => assertDroneLicenceConfirmed(true, false, true));
  assert.doesNotThrow(() => assertDroneLicenceConfirmed(true, true, false));
  assert.doesNotThrow(() => assertDroneLicenceConfirmed(false, false, false));
});

test('SACAA numbers are entered as printed, without symbols that could hide anything', () => {
  assert.equal(droneLicenceSchema.safeParse({ sacaaRplNumber: 'RPL/2026/0123', sacaaRocNumber: 'ROC-45' }).success, true);
  assert.equal(droneLicenceSchema.safeParse({ sacaaRplNumber: 'ab', sacaaRocNumber: 'ROC-45' }).success, false);
  assert.equal(droneLicenceSchema.safeParse({ sacaaRplNumber: '<script>', sacaaRocNumber: 'ROC-45' }).success, false);
  assert.equal(droneLicenceSchema.safeParse({ sacaaRplNumber: 'RPL-1', sacaaRocNumber: 'ROC-45', droneLicenceVerified: true }).success, false);
  assert.equal(verificationDecisionSchema.parse({ decision: 'approved' }).confirmDroneLicence, false);
});

test('sellers can buy from others, but not enquire with their own business', () => {
  assert.throws(() => assertNotOwnListing('seller-1', 'seller-1'), /your own listing/);
  assert.doesNotThrow(() => assertNotOwnListing('seller-1', 'seller-2'));
  assert.doesNotThrow(() => assertNotOwnListing('seller-1', 'buyer-1'));
});

test('only a buyer account can switch to selling', () => {
  assert.doesNotThrow(() => assertCanBecomeSeller('buyer'));
  assert.throws(() => assertCanBecomeSeller('seller'), /already sell/);
  assert.throws(() => assertCanBecomeSeller('admin'), /Administrator/);
});

test('buyer features accept buyers and sellers but never administrators', () => {
  assert.equal(isRoleAllowed('buyer', ['buyer', 'seller']), true);
  assert.equal(isRoleAllowed('seller', ['buyer', 'seller']), true);
  assert.equal(isRoleAllowed('admin', ['buyer', 'seller']), false);
});
