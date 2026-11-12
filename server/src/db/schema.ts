import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
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
export const enquiryStatus = pgEnum('enquiry_status', ['new', 'read', 'responded', 'closed']);
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
