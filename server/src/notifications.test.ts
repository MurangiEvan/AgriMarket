import assert from 'node:assert/strict';
import test from 'node:test';

import { enquiryNotification, listingNotification, summarize, verificationNotification } from './notifications.js';

const owner = '6f7c2a2e-9d1b-4a35-8c34-1f0f5b1c2d3e';

test('verification results tell the seller the outcome and link to their profile', () => {
  const approved = verificationNotification(owner, 'Thabo Tomatoes', 'approved', null);
  assert.equal(approved.type, 'verification.approved');
  assert.equal(approved.title, 'Thabo Tomatoes is verified');
  assert.equal(approved.link, '/account');
  assert.equal(approved.userId, owner);

  const rejected = verificationNotification(owner, 'Thabo Tomatoes', 'rejected', 'Upload a clearer CIPC certificate.');
  assert.equal(rejected.type, 'verification.rejected');
  assert.match(rejected.body ?? '', /Upload a clearer CIPC certificate\./);
});

test('photo moderation notifies on publish and reject, but not on archive', () => {
  assert.equal(listingNotification(owner, 'Tomatoes', 'published', '')?.title, 'Your Tomatoes photo is live');
  assert.equal(listingNotification(owner, 'Tomatoes', 'rejected', '')?.type, 'listing.rejected');
  assert.match(listingNotification(owner, 'Tomatoes', 'rejected', 'Photo is blurry')?.body ?? '', /Photo is blurry/);
  assert.equal(listingNotification(owner, 'Tomatoes', 'archived', ''), null);
});

test('a new enquiry notifies the seller with the listing and a short preview of the message', () => {
  const notification = enquiryNotification(owner, 'Butternut', 'Hi, can you supply 20 boxes every Friday?');
  assert.equal(notification.title, 'New enquiry about Butternut');
  assert.equal(notification.link, '/enquiries');
  assert.equal(notification.body, 'Hi, can you supply 20 boxes every Friday?');
});

test('long text is collapsed and shortened for display', () => {
  assert.equal(summarize('  many   spaces \n here  '), 'many spaces here');
  const long = summarize('x'.repeat(400));
  assert.equal(long.length, 280);
  assert.ok(long.endsWith('…'));
});
