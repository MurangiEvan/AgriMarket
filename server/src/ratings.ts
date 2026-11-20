import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import type { Database } from './db/client.js';
import { ratings, users } from './db/schema.js';
import { HttpError } from './http.js';

// A business shows an average only once it has this many visible ratings, so one review cannot
// make or break it.
export const MIN_RATINGS_TO_SHOW = 3;
export const RATING_EDIT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// A buyer can rate once the seller has answered (responded) or closed the enquiry.
export function assertEnquiryRateable(status: string) {
  if (status !== 'responded' && status !== 'closed') {
    throw new HttpError(409, 'NOT_YET_RATEABLE', 'You can rate the supplier once they have responded to your enquiry.');
  }
}

export function assertRatingEditable(createdAt: Date, now = new Date()) {
  if (now.getTime() - createdAt.getTime() > RATING_EDIT_WINDOW_MS) {
    throw new HttpError(409, 'EDIT_WINDOW_CLOSED', 'Ratings can only be changed within 30 days.');
  }
}

// A new or changed comment waits for an administrator; an empty comment needs no review.
export function commentStatusFor(comment: string): 'none' | 'pending' {
  return comment.trim() ? 'pending' : 'none';
}

export type RatingSummary = { ratingCount: number; ratingAverage: number | null };

export function publicSummary(count: number, average: number | null): RatingSummary {
  return {
    ratingCount: count,
    ratingAverage: count >= MIN_RATINGS_TO_SHOW && average !== null ? Math.round(average * 10) / 10 : null,
  };
}

// Visible ratings per business, for listing cards and listing pages.
export async function ratingSummaries(db: Database, businessIds: string[]): Promise<Map<string, RatingSummary>> {
  const unique = [...new Set(businessIds)];
  if (!unique.length) return new Map();
  const rows = await db
    .select({
      businessId: ratings.businessId,
      count: sql<number>`count(*)::int`,
      average: sql<number | null>`avg(${ratings.stars})::float`,
    })
    .from(ratings)
    .where(and(inArray(ratings.businessId, unique), eq(ratings.hidden, false)))
    .groupBy(ratings.businessId);
  const byBusiness = new Map(rows.map((row) => [row.businessId, publicSummary(row.count, row.average)]));
  return new Map(unique.map((id) => [id, byBusiness.get(id) ?? publicSummary(0, null)]));
}

// Approved comments shown on a listing page. Buyers are described by their organisation type only.
export async function approvedComments(db: Database, businessId: string, limit = 5) {
  return db
    .select({
      id: ratings.id,
      stars: ratings.stars,
      comment: ratings.comment,
      buyerType: users.organisationType,
      createdAt: ratings.createdAt,
    })
    .from(ratings)
    .innerJoin(users, eq(ratings.buyerId, users.id))
    .where(and(eq(ratings.businessId, businessId), eq(ratings.hidden, false), eq(ratings.commentStatus, 'approved')))
    .orderBy(desc(ratings.createdAt))
    .limit(limit);
}
