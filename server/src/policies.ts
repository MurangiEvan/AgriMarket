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

export type ApplicationBusiness = {
  name: string;
  description: string;
  town: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  whatsappPhone: string | null;
};

// A seller application must be complete before it reaches the admin. Returns the plain-language
// list of what is still missing from the business profile (empty when it is complete).
export function missingApplicationDetails(business: ApplicationBusiness): string[] {
  const missing: string[] = [];
  if (business.name.trim().length < 2) missing.push('business name');
  if (business.description.trim().length < 10) missing.push('a business description (at least 10 characters)');
  if (!business.town?.trim()) missing.push('town or area');
  if (!business.contactEmail?.trim() && !business.contactPhone?.trim() && !business.whatsappPhone?.trim()) {
    missing.push('a contact email, mobile number or WhatsApp number');
  }
  return missing;
}

// A listing can be reported only while buyers can see it, and never by the business that owns it.
export function assertListingReportable(
  listing: { status: ListingState; verificationStatus: string; ownerId: string } | undefined,
  reporterId: string,
) {
  if (!listing || listing.status !== 'published' || listing.verificationStatus !== 'approved') {
    throw new HttpError(404, 'NOT_FOUND', 'The listing was not found or is no longer live.');
  }
  if (listing.ownerId === reporterId) {
    throw new HttpError(409, 'OWN_LISTING', 'You cannot report your own listing.');
  }
}

// A visible rating can be reported (usually by the seller it is about), but not by the buyer who wrote it.
export function assertRatingReportable(rating: { hidden: boolean; buyerId: string } | undefined, reporterId: string) {
  if (!rating || rating.hidden) throw new HttpError(404, 'NOT_FOUND', 'The rating was not found.');
  if (rating.buyerId === reporterId) throw new HttpError(409, 'OWN_RATING', 'You cannot report your own rating. You can change it instead.');
}

// A drone listing needs both SACAA numbers on the business before it can be sent for review.
export function assertDroneLicenceOnFile(business: { sacaaRplNumber: string | null; sacaaRocNumber: string | null }) {
  if (!business.sacaaRplNumber || !business.sacaaRocNumber) {
    throw new HttpError(
      409,
      'DRONE_LICENCE_REQUIRED',
      'Drone services need your SACAA Remote Pilot Licence (RPL) and Remote Operating Certificate (ROC) numbers. Add them before sending a drone listing.',
    );
  }
}

// Publishing a drone listing needs an administrator to have checked the licence: either already on
// record for the business, or confirmed with this decision.
export function assertDroneLicenceConfirmed(hasDroneListing: boolean, alreadyVerified: boolean, confirmedNow: boolean) {
  if (hasDroneListing && !alreadyVerified && !confirmedNow) {
    throw new HttpError(409, 'DRONE_LICENCE_NOT_CONFIRMED', 'Check the seller’s SACAA licence and tick "I checked the SACAA licence" before publishing a drone listing.');
  }
}

// One account can buy and sell, but a seller cannot send an enquiry to their own business.
export function assertNotOwnListing(ownerId: string, buyerId: string) {
  if (ownerId === buyerId) {
    throw new HttpError(409, 'OWN_LISTING', 'This is your own listing. You can enquire with other suppliers, not with yourself.');
  }
}

// Only a buyer account can switch to selling; sellers can already buy, and admins stay separate.
export function assertCanBecomeSeller(role: 'buyer' | 'seller' | 'admin') {
  if (role === 'seller') throw new HttpError(409, 'ALREADY_SELLER', 'Your account can already sell.');
  if (role === 'admin') throw new HttpError(403, 'FORBIDDEN', 'Administrator accounts cannot sell.');
}
