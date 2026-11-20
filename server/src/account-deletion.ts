import { randomBytes } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';

import type { Database } from './db/client.js';
import { businesses, listingImages, listings, notifications, passwordResetTokens, sessions, users, verificationSubmissions } from './db/schema.js';
import { anonymisedEmail } from './privacy.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export type AnonymisedAccount = {
  originalEmail: string;
  // Files to remove from storage once the transaction has committed.
  documentKeys: string[];
  imageKeys: string[];
};

// Wipes a user's personal information while keeping the rows other people rely on (an enquiry a
// seller received, an audit entry, a report) pointing at an anonymous, inactive account. Run inside
// the transaction that approves the deletion request so it is all-or-nothing.
export async function anonymiseAccount(transaction: Transaction, userId: string): Promise<AnonymisedAccount> {
  const [user] = await transaction.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error('The account to delete was not found.');

  const [business] = await transaction.select({ id: businesses.id }).from(businesses).where(eq(businesses.ownerId, userId)).limit(1);
  let documentKeys: string[] = [];
  let imageKeys: string[] = [];

  if (business) {
    const ownListings = await transaction.select({ id: listings.id }).from(listings).where(eq(listings.businessId, business.id));
    const listingIds = ownListings.map((listing) => listing.id);
    if (listingIds.length) {
      const images = await transaction
        .select({ storageKey: listingImages.storageKey })
        .from(listingImages)
        .where(inArray(listingImages.listingId, listingIds));
      imageKeys = images.map((image) => image.storageKey);
      await transaction.delete(listingImages).where(inArray(listingImages.listingId, listingIds));
      await transaction.update(listings).set({ status: 'archived', active: false, updatedAt: new Date() }).where(inArray(listings.id, listingIds));
    }

    const submissions = await transaction
      .select({ storageKeys: verificationSubmissions.storageKeys })
      .from(verificationSubmissions)
      .where(eq(verificationSubmissions.businessId, business.id));
    documentKeys = submissions.flatMap((submission) => submission.storageKeys);
    await transaction.update(verificationSubmissions).set({ storageKeys: [] }).where(eq(verificationSubmissions.businessId, business.id));

    await transaction
      .update(businesses)
      .set({
        name: 'Deleted business',
        description: '',
        address: null,
        town: null,
        latitude: null,
        longitude: null,
        contactEmail: null,
        contactPhone: null,
        whatsappPhone: null,
        agrisetaReference: null,
        agrisetaSupportClaimed: false,
        agrisetaSupported: false,
        // No longer verified, so it drops out of exports, counts and the public directory.
        verificationStatus: 'not_submitted',
        updatedAt: new Date(),
      })
      .where(eq(businesses.id, business.id));
  }

  await transaction.delete(sessions).where(eq(sessions.userId, userId));
  await transaction.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  await transaction.delete(notifications).where(eq(notifications.userId, userId));
  await transaction
    .update(users)
    .set({
      email: anonymisedEmail(userId),
      // Not a bcrypt hash, so no password can ever match it.
      passwordHash: `deleted:${randomBytes(24).toString('base64url')}`,
      isActive: false,
      emailVerifiedAt: null,
      locationLabel: null,
      locationLatitude: null,
      locationLongitude: null,
      organisationName: null,
      organisationType: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return { originalEmail: user.email, documentKeys, imageKeys };
}
