import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const userRole = pgEnum('user_role', ['buyer', 'seller', 'admin']);
export const businessVerificationStatus = pgEnum('business_verification_status', [
  'not_submitted',
  'pending',
  'approved',
  'rejected',
]);
export const listingStatus = pgEnum('listing_status', [
  'draft',
  'pending',
  'published',
  'rejected',
  'archived',
]);
export const listingType = pgEnum('listing_type', ['product', 'service']);
export const verificationSubmissionStatus = pgEnum('verification_submission_status', [
  'pending',
  'approved',
  'rejected',
]);
// The buyer groups named in the AgriMarket brief, plus restaurants and informal traders.
export const BUYER_ORGANISATION_TYPES = [
  'retailer',
  'hotel',
  'restaurant',
  'processor',
  'exporter',
  'municipality',
  'government_programme',
  'school',
  'commercial_farm',
  'informal_trader',
  'other',
] as const;
export const buyerOrganisationType = pgEnum('buyer_organisation_type', BUYER_ORGANISATION_TYPES);
export const enquiryStatus = pgEnum('enquiry_status', ['new', 'read', 'responded', 'closed']);
// What came of an enquiry, recorded by the seller when they close it (handbook: measure outcomes, not clicks).
export const ENQUIRY_OUTCOMES = ['deal_made', 'no_deal'] as const;
export const DEAL_VALUE_BANDS = ['under_5k', '5k_50k', '50k_250k', 'over_250k', 'prefer_not_to_say'] as const;
export const enquiryOutcome = pgEnum('enquiry_outcome', ENQUIRY_OUTCOMES);
export const dealValueBand = pgEnum('deal_value_band', DEAL_VALUE_BANDS);
export const southAfricanProvince = pgEnum('south_african_province', [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'Northern Cape',
  'North West',
  'Western Cape',
]);

const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).defaultNow().notNull();

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: userRole('role').notNull().default('buyer'),
    isActive: boolean('is_active').notNull().default(true),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    locationLabel: text('location_label'),
    locationLatitude: doublePrecision('location_latitude'),
    locationLongitude: doublePrecision('location_longitude'),
    // Buyers say which organisation they buy for, so sellers know who is enquiring.
    organisationName: text('organisation_name'),
    organisationType: buyerOrganisationType('organisation_type'),
    // When the user accepted the Privacy notice and Terms, and which version (see src/privacy.ts).
    privacyAcceptedAt: timestamp('privacy_accepted_at', { withTimezone: true }),
    privacyVersion: text('privacy_version'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('sessions_token_hash_unique').on(table.tokenHash), index('sessions_user_id_idx').on(table.userId)],
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('password_reset_tokens_token_hash_unique').on(table.tokenHash),
    index('password_reset_tokens_user_id_idx').on(table.userId),
  ],
);

export const businesses = pgTable(
  'businesses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    address: text('address'),
    province: southAfricanProvince('province').notNull(),
    town: text('town'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    contactEmail: text('contact_email'),
    contactPhone: text('contact_phone'),
    whatsappPhone: text('whatsapp_phone'),
    verificationStatus: businessVerificationStatus('verification_status').notNull().default('not_submitted'),
    // AgriSETA support: the seller states it on their application (with an optional programme or
    // learnership reference); only an administrator can confirm it, which shows the public badge.
    agrisetaSupportClaimed: boolean('agriseta_support_claimed').notNull().default(false),
    agrisetaReference: text('agriseta_reference'),
    agrisetaSupported: boolean('agriseta_supported').notNull().default(false),
    // Drone services need a SACAA Remote Pilot Licence (RPL) and Remote Operating Certificate (ROC).
    // The seller enters the numbers; an administrator checks the licence before any drone listing is
    // published. Changing a number clears the check.
    sacaaRplNumber: text('sacaa_rpl_number'),
    sacaaRocNumber: text('sacaa_roc_number'),
    droneLicenceVerified: boolean('drone_licence_verified').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('businesses_owner_id_unique').on(table.ownerId),
    index('businesses_name_search_idx').using('gin', sql`to_tsvector('simple', ${table.name})`),
    index('businesses_location_latitude_longitude_idx').on(table.latitude, table.longitude),
  ],
);

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
  },
  (table) => [uniqueIndex('categories_slug_unique').on(table.slug)],
);

export const produceTypes = pgTable(
  'produce_types',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    active: boolean('active').notNull().default(true),
  },
  (table) => [
    uniqueIndex('produce_types_category_name_unique').on(table.categoryId, table.name),
    index('produce_types_category_active_idx').on(table.categoryId, table.active),
  ],
);

export const listings = pgTable(
  'listings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    businessId: uuid('business_id').notNull().references(() => businesses.id, { onDelete: 'restrict' }),
    categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'restrict' }),
    produceTypeId: uuid('produce_type_id').notNull().references(() => produceTypes.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    description: text('description').notNull(),
    province: southAfricanProvince('province').notNull(),
    town: text('town'),
    type: listingType('type').notNull(),
    status: listingStatus('status').notNull().default('draft'),
    active: boolean('active').notNull().default(true),
    inStock: boolean('in_stock').notNull().default(true),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('listings_public_filter_idx').on(table.status, table.province, table.categoryId, table.createdAt),
    index('listings_produce_availability_idx').on(table.produceTypeId, table.status, table.active, table.inStock, table.expiresAt),
    index('listings_business_id_idx').on(table.businessId),
    index('listings_search_idx').using('gin', sql`to_tsvector('simple', ${table.title} || ' ' || ${table.description})`),
  ],
);

export const listingImages = pgTable(
  'listing_images',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    listingId: uuid('listing_id').notNull().references(() => listings.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),
    altText: text('alt_text').notNull(),
    mimeType: text('mime_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    width: integer('width'),
    height: integer('height'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [index('listing_images_listing_order_idx').on(table.listingId, table.sortOrder)],
);

export const verificationSubmissions = pgTable(
  'verification_submissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    businessId: uuid('business_id').notNull().references(() => businesses.id, { onDelete: 'restrict' }),
    submitterId: uuid('submitter_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    reviewerId: uuid('reviewer_id').references(() => users.id, { onDelete: 'set null' }),
    storageKeys: text('storage_keys').array().notNull(),
    status: verificationSubmissionStatus('status').notNull().default('pending'),
    sellerFeedback: text('seller_feedback'),
    internalReason: text('internal_reason'),
    submittedAt: createdAt(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  },
  (table) => [
    index('verification_queue_idx').on(table.status, table.submittedAt),
    uniqueIndex('verification_one_pending_per_business_unique')
      .on(table.businessId)
      .where(sql`${table.status} = 'pending'`),
  ],
);

export const enquiries = pgTable(
  'enquiries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    buyerId: uuid('buyer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    businessId: uuid('business_id').notNull().references(() => businesses.id, { onDelete: 'restrict' }),
    listingId: uuid('listing_id').notNull().references(() => listings.id, { onDelete: 'restrict' }),
    message: text('message').notNull(),
    status: enquiryStatus('status').notNull().default('new'),
    outcome: enquiryOutcome('outcome'),
    // A rough rand range only, never an exact amount; null unless a deal was made.
    outcomeValueBand: dealValueBand('outcome_value_band'),
    outcomeRecordedAt: timestamp('outcome_recorded_at', { withTimezone: true }),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('enquiries_buyer_idempotency_unique').on(table.buyerId, table.idempotencyKey),
    index('enquiries_business_status_created_idx').on(table.businessId, table.status, table.createdAt),
    index('enquiries_buyer_created_idx').on(table.buyerId, table.createdAt),
  ],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    metadata: jsonb('metadata').$type<Record<string, string | number | boolean | null>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [index('audit_logs_target_created_idx').on(table.targetType, table.targetId, table.createdAt)],
);
// In-app notifications, e.g. "Your business was approved". Written in the same transaction
// as the event that caused them; each user only ever reads their own.
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    // App route to open when the notification is tapped, e.g. /account or /enquiries.
    link: text('link'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index('notifications_user_created_idx').on(table.userId, table.createdAt)],
);

// Signed-in users can report a listing (scam, fake business...) for an administrator to review.
// Ratings can be reported too once public ratings exist. targetId is not a foreign key because
// it points at different tables depending on targetType.
export const REPORT_TARGET_TYPES = ['listing', 'rating'] as const;
export const REPORT_REASONS = ['scam_or_fraud', 'fake_business', 'wrong_information', 'offensive', 'other'] as const;
export const reportTargetType = pgEnum('report_target_type', REPORT_TARGET_TYPES);
export const reportReason = pgEnum('report_reason', REPORT_REASONS);
export const reportStatus = pgEnum('report_status', ['open', 'dismissed', 'actioned']);

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reporterId: uuid('reporter_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    targetType: reportTargetType('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    reason: reportReason('reason').notNull(),
    details: text('details').notNull().default(''),
    status: reportStatus('status').notNull().default('open'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    resolutionNote: text('resolution_note'),
    createdAt: createdAt(),
  },
  (table) => [
    // One open report per person per item, so nobody can flood the review queue.
    uniqueIndex('reports_reporter_target_open_unique')
      .on(table.reporterId, table.targetType, table.targetId)
      .where(sql`${table.status} = 'open'`),
    index('reports_status_created_idx').on(table.status, table.createdAt),
    index('reports_target_idx').on(table.targetType, table.targetId),
  ],
);

// POPIA: users ask for their account to be deleted and an administrator approves it, so open
// fraud reports or disputes can be checked first. Approval anonymises the account (see admin.ts).
export const deletionRequestStatus = pgEnum('deletion_request_status', ['pending', 'approved', 'rejected', 'cancelled']);

export const deletionRequests = pgTable(
  'deletion_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    reason: text('reason').notNull().default(''),
    status: deletionRequestStatus('status').notNull().default('pending'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    createdAt: createdAt(),
  },
  (table) => [
    // At most one pending request per user.
    uniqueIndex('deletion_requests_user_pending_unique').on(table.userId).where(sql`${table.status} = 'pending'`),
    index('deletion_requests_status_created_idx').on(table.status, table.createdAt),
  ],
);

// Public star ratings. A buyer rates the supplier once per enquiry the seller answered or closed.
// Stars count straight away; a written comment is only shown publicly after an administrator approves
// it. A rating an administrator hides (for example after a report) no longer counts anywhere.
export const ratingCommentStatus = pgEnum('rating_comment_status', ['none', 'pending', 'approved', 'hidden']);

export const ratings = pgTable(
  'ratings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    enquiryId: uuid('enquiry_id').notNull().references(() => enquiries.id, { onDelete: 'restrict' }),
    buyerId: uuid('buyer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    businessId: uuid('business_id').notNull().references(() => businesses.id, { onDelete: 'restrict' }),
    stars: smallint('stars').notNull(),
    comment: text('comment').notNull().default(''),
    commentStatus: ratingCommentStatus('comment_status').notNull().default('none'),
    hidden: boolean('hidden').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('ratings_enquiry_unique').on(table.enquiryId),
    index('ratings_business_idx').on(table.businessId, table.hidden),
    index('ratings_comment_status_idx').on(table.commentStatus, table.createdAt),
    check('ratings_stars_range', sql`${table.stars} between 1 and 5`),
  ],
);
