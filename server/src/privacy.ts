// Bump this date whenever the Privacy notice or Terms change in a way users must agree to again.
// Users who accepted an older version are asked to accept the new one after they sign in.
export const PRIVACY_VERSION = '2026-11-19';

export function hasAcceptedCurrentPrivacy(acceptedVersion: string | null | undefined): boolean {
  return acceptedVersion === PRIVACY_VERSION;
}

// What an account looks like after it is deleted: no name, email, password or location remains,
// but rows other users rely on (an enquiry a seller received, an audit entry) still point at it.
export function anonymisedEmail(userId: string): string {
  return `deleted-${userId}@deleted.agrimarket.invalid`;
}
