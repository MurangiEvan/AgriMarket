import type { Database } from './db/client.js';
import { notifications } from './db/schema.js';

export type NotificationType =
  | 'verification.approved'
  | 'verification.rejected'
  | 'listing.published'
  | 'listing.rejected'
  | 'enquiry.received';

type Writer = Pick<Database, 'insert'>;

export type NewNotification = {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string | null;
};

const MAX_BODY = 280;

// Notification text is shown in the app, so keep it short and never include private data
// such as verification documents or another user's contact details.
export function summarize(text: string, max = MAX_BODY) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

// Pass the transaction (tx) of the event that caused the notification, so both are saved
// together or not at all.
export async function notify(writer: Writer, notification: NewNotification) {
  await writer.insert(notifications).values({
    userId: notification.userId,
    type: notification.type,
    title: summarize(notification.title, 120),
    body: summarize(notification.body ?? ''),
    link: notification.link ?? null,
  });
}

export function verificationNotification(userId: string, businessName: string, decision: 'approved' | 'rejected', feedback: string | null): NewNotification {
  return decision === 'approved'
    ? {
        userId,
        type: 'verification.approved',
        title: `${businessName} is verified`,
        body: 'Your application was approved and the produce photo you sent with it is now live for buyers. You can add more photos from your profile.',
        link: '/account',
      }
    : {
        userId,
        type: 'verification.rejected',
        title: `${businessName} needs changes`,
        body: feedback ? `Administrator feedback: ${feedback}` : 'Your verification was not approved. Open your profile to see what to fix.',
        link: '/account',
      };
}

export function listingNotification(userId: string, title: string, status: 'published' | 'rejected' | 'archived', reason: string): NewNotification | null {
  if (status === 'published') {
    return { userId, type: 'listing.published', title: `Your ${title} photo is live`, body: 'Buyers can now see it in the directory and in Near me.', link: '/account' };
  }
  if (status === 'rejected') {
    return {
      userId,
      type: 'listing.rejected',
      title: `Your ${title} photo was not approved`,
      body: reason ? `Administrator feedback: ${reason}` : 'Try a clearer photo of the produce and send it again.',
      link: '/account',
    };
  }
  return null;
}

export function enquiryNotification(userId: string, listingTitle: string, message: string, buyerOrganisation?: string | null): NewNotification {
  return {
    userId,
    type: 'enquiry.received',
    title: buyerOrganisation ? `New enquiry from ${buyerOrganisation} about ${listingTitle}` : `New enquiry about ${listingTitle}`,
    body: message,
    link: '/enquiries',
  };
}
