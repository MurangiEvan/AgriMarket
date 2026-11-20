import assert from 'node:assert/strict';
import test from 'node:test';

import { assertRatingReportable } from './policies.js';
import { assertEnquiryRateable, assertRatingEditable, commentStatusFor, MIN_RATINGS_TO_SHOW, publicSummary, RATING_EDIT_WINDOW_MS } from './ratings.js';
import { ratingSchema } from './validation.js';

test('a buyer can rate only after the seller has responded or closed the enquiry', () => {
  assert.throws(() => assertEnquiryRateable('new'), /once they have responded/);
  assert.throws(() => assertEnquiryRateable('read'), /once they have responded/);
  assert.doesNotThrow(() => assertEnquiryRateable('responded'));
  assert.doesNotThrow(() => assertEnquiryRateable('closed'));
});

test('ratings can be changed for 30 days only', () => {
  const now = new Date('2026-12-31T12:00:00Z');
  assert.doesNotThrow(() => assertRatingEditable(new Date(now.getTime() - RATING_EDIT_WINDOW_MS + 1000), now));
  assert.throws(() => assertRatingEditable(new Date(now.getTime() - RATING_EDIT_WINDOW_MS - 1000), now), /30 days/);
});

test('stars are whole numbers from 1 to 5 and comments stay short', () => {
  assert.equal(ratingSchema.safeParse({ stars: 5 }).success, true);
  assert.equal(ratingSchema.safeParse({ stars: 0 }).success, false);
  assert.equal(ratingSchema.safeParse({ stars: 6 }).success, false);
  assert.equal(ratingSchema.safeParse({ stars: 4.5 }).success, false);
  assert.equal(ratingSchema.safeParse({ stars: 4, comment: 'x'.repeat(501) }).success, false);
  assert.equal(ratingSchema.safeParse({ stars: 4, businessId: 'someone-else' }).success, false);
});

test('only written comments wait for an administrator', () => {
  assert.equal(commentStatusFor(''), 'none');
  assert.equal(commentStatusFor('   '), 'none');
  assert.equal(commentStatusFor('Fresh avocados, delivered on time.'), 'pending');
});

test('an average is public only from the minimum number of ratings, rounded to one decimal', () => {
  assert.deepEqual(publicSummary(MIN_RATINGS_TO_SHOW - 1, 5), { ratingCount: MIN_RATINGS_TO_SHOW - 1, ratingAverage: null });
  assert.deepEqual(publicSummary(MIN_RATINGS_TO_SHOW, 4.333), { ratingCount: MIN_RATINGS_TO_SHOW, ratingAverage: 4.3 });
  assert.deepEqual(publicSummary(0, null), { ratingCount: 0, ratingAverage: null });
});

test('a rating can be reported by others but not by the buyer who wrote it', () => {
  const rating = { hidden: false, buyerId: 'buyer-1' };
  assert.doesNotThrow(() => assertRatingReportable(rating, 'seller-1'));
  assert.throws(() => assertRatingReportable(rating, 'buyer-1'), /own rating/);
  assert.throws(() => assertRatingReportable({ ...rating, hidden: true }, 'seller-1'), /not found/);
  assert.throws(() => assertRatingReportable(undefined, 'seller-1'), /not found/);
});
