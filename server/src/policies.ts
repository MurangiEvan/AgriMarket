import type { enquiryStatus, listingStatus } from './db/schema.js';
import { HttpError } from './http.js';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

export type EnquiryState = (typeof enquiryStatus.enumValues)[number];
export type ListingState = (typeof listingStatus.enumValues)[number];

const enquiryTransitions: Record<EnquiryState, readonly EnquiryState[]> = {
  new: ['read', 'responded', 'closed'],
  read: ['responded', 'closed'],
  responded: ['closed'],
  closed: [],
};

export function canTransitionEnquiry(current: EnquiryState, next: EnquiryState): boolean {
  return current === next || enquiryTransitions[current].includes(next);
}

export function assertPublishedForDiscovery(listing: { status: ListingState; verificationStatus: string }) {
  if (listing.status !== 'published' || listing.verificationStatus !== 'approved') {
    throw new HttpError(404, 'NOT_FOUND', 'The requested listing was not found.');
  }
}

export function normalizeSouthAfricanPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = parsePhoneNumberFromString(value, 'ZA');
  if (parsed?.country === 'ZA' && parsed.isValid()) return parsed.number;
  throw new HttpError(400, 'INVALID_PHONE', 'Provide a valid South African mobile number.');
}