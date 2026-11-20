import { z } from 'zod';

import { BUYER_ORGANISATION_TYPES, DEAL_VALUE_BANDS, ENQUIRY_OUTCOMES, REPORT_REASONS, REPORT_TARGET_TYPES } from './db/schema.js';
import { RADIUS_OPTIONS_KM } from './market.js';

export const provinceSchema = z.enum([
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

export const registrationSchema = z
  .object({
    email: z.email().max(254),
    password: z.string().min(10).max(128),
    role: z.enum(['buyer', 'seller']),
    // POPIA consent: the account is only created once the user has accepted the Privacy notice and Terms.
    acceptPrivacy: z.literal(true, { message: 'Accept the Privacy notice and Terms to create an account.' }),
  })
  .strict();

export const loginSchema = z
  .object({ email: z.email().max(254), password: z.string().min(1).max(128) })
  .strict();

export const passwordResetRequestSchema = z.object({ email: z.email().max(254) }).strict();

export const passwordResetConfirmSchema = z
  .object({ token: z.string().min(32).max(128), password: z.string().min(10).max(128) })
  .strict();

export const refreshSchema = z.object({ refreshToken: z.string().min(32).max(128).optional() }).strict();

export const businessSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(3000).default(''),
    address: z.string().trim().max(250).nullable().default(null),
    province: provinceSchema,
    town: z.string().trim().max(100).nullable().default(null),
    contactEmail: z.union([z.email().max(254), z.literal('')]).nullable().default(null),
    contactPhone: z.string().max(30).nullable().default(null),
    whatsappPhone: z.string().max(30).nullable().default(null),
  })
  .strict();

const coordinateSchema = (minimum: number, maximum: number) =>
  z.coerce.number().finite().min(minimum).max(maximum);

export const marketProduceQuerySchema = z
  .object({
    categoryId: z.uuid(),
    radiusKm: z.coerce.number().int().refine((value) => RADIUS_OPTIONS_KM.some((option) => option === value)),
    lat: coordinateSchema(-90, 90),
    lng: coordinateSchema(-180, 180),
    q: z.string().trim().max(80).optional(),
  })
  .strict();

export const locationSearchQuerySchema = z.object({ q: z.string().trim().min(2).max(120) }).strict();

export const savedLocationSchema = z
  .object({
    label: z.string().trim().min(2).max(160),
    latitude: coordinateSchema(-90, 90),
    longitude: coordinateSchema(-180, 180),
  })
  .strict();

export const listingCreateSchema = z
  .object({
    categoryId: z.uuid(),
    produceTypeId: z.uuid(),
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(10).max(5000),
    province: provinceSchema,
    town: z.string().trim().max(100).nullable().default(null),
    type: z.enum(['product', 'service']),
    active: z.boolean().default(true),
    inStock: z.boolean().default(true),
    expiresAt: z.iso.datetime().transform((value) => new Date(value)).nullable().default(null),
  })
  .strict();

export const listingUpdateSchema = listingCreateSchema.partial().strict();

export const publicListingQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(100).optional(),
    category: z.string().trim().max(80).optional(),
    produceTypeId: z.uuid().optional(),
    province: provinceSchema.optional(),
    // Only show businesses an administrator has confirmed as AgriSETA-supported.
    agriseta: z.enum(['true']).optional(),
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const enquiryCreateSchema = z
  .object({ listingId: z.uuid(), message: z.string().trim().min(10).max(4000) })
  .strict();

// Closing an enquiry records what came of it: a deal (with an optional rough value range) or no deal.
export const enquiryStatusSchema = z
  .object({
    status: z.enum(['read', 'responded', 'closed']),
    outcome: z.enum(ENQUIRY_OUTCOMES).optional(),
    outcomeValueBand: z.enum(DEAL_VALUE_BANDS).optional(),
  })
  .strict()
  .refine((value) => value.status !== 'closed' || value.outcome !== undefined, {
    message: 'Say whether this enquiry led to a deal before closing it.',
    path: ['outcome'],
  })
  .refine((value) => value.status === 'closed' || value.outcome === undefined, {
    message: 'An outcome can only be recorded when the enquiry is closed.',
    path: ['outcome'],
  })
  .refine((value) => value.outcomeValueBand === undefined || value.outcome === 'deal_made', {
    message: 'A deal value can only be given when a deal was made.',
    path: ['outcomeValueBand'],
  });

export const verificationDecisionSchema = z
  .object({
    decision: z.enum(['approved', 'rejected']),
    sellerFeedback: z.string().trim().max(1000).nullable().default(null),
    internalReason: z.string().trim().max(2000).nullable().default(null),
    // Set when the admin has checked the seller's AgriSETA support claim.
    confirmAgriseta: z.boolean().default(false),
    // Set when the admin has checked the seller's SACAA drone licence (needed for drone services).
    confirmDroneLicence: z.boolean().default(false),
  })
  .strict();

export const buyerProfileSchema = z
  .object({
    organisationName: z.string().trim().min(2, 'Enter the name of the organisation you buy for.').max(120),
    organisationType: z.enum(BUYER_ORGANISATION_TYPES, { message: 'Choose what kind of organisation you buy for.' }),
  })
  .strict();

export const listingModerationSchema = z
  .object({
    status: z.enum(['published', 'rejected', 'archived']),
    reason: z.string().trim().max(1000).default(''),
    confirmDroneLicence: z.boolean().default(false),
  })
  .strict();
export const reportCreateSchema = z
  .object({
    targetType: z.enum(REPORT_TARGET_TYPES),
    targetId: z.uuid(),
    reason: z.enum(REPORT_REASONS, { message: 'Choose why you are reporting this.' }),
    details: z.string().trim().max(1000, 'Keep the details under 1000 characters.').default(''),
  })
  .strict();

export const reportListQuerySchema = z.object({
  status: z.enum(['open', 'dismissed', 'actioned']).default('open'),
});

export const reportDecisionSchema = z
  .object({
    action: z.enum(['dismiss', 'take_down']),
    note: z.string().trim().max(1000).default(''),
  })
  .strict();

export const deletionRequestSchema = z
  .object({ reason: z.string().trim().max(1000, 'Keep the reason under 1000 characters.').default('') })
  .strict();

export const deletionListQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).default('pending'),
});

export const deletionDecisionSchema = z
  .object({
    decision: z.enum(['approved', 'rejected']),
    note: z.string().trim().max(1000).default(''),
  })
  .strict()
  .refine((value) => value.decision === 'approved' || value.note.length > 0, {
    message: 'Explain to the user why their deletion request was not approved.',
    path: ['note'],
  });

export const ratingSchema = z
  .object({
    stars: z.number().int().min(1, 'Choose between 1 and 5 stars.').max(5, 'Choose between 1 and 5 stars.'),
    comment: z.string().trim().max(500, 'Keep your comment under 500 characters.').default(''),
  })
  .strict();

export const ratingModerationQuerySchema = z.object({
  commentStatus: z.enum(['pending', 'approved', 'hidden']).default('pending'),
});

export const ratingCommentDecisionSchema = z.object({ action: z.enum(['approve', 'hide']) }).strict();

// SACAA numbers: letters, digits, spaces, dots, slashes and dashes. AgriMarket does not guess the
// official format; an administrator checks each licence against the document the seller uploads.
const sacaaNumberSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9 ./-]{2,39}$/, 'Enter the number exactly as it appears on the SACAA document.');

export const droneLicenceSchema = z
  .object({ sacaaRplNumber: sacaaNumberSchema, sacaaRocNumber: sacaaNumberSchema })
  .strict();
