import { z } from 'zod';

import { BUYER_ORGANISATION_TYPES } from './db/schema.js';
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

export const enquiryStatusSchema = z.object({ status: z.enum(['read', 'responded', 'closed']) }).strict();

export const verificationDecisionSchema = z
  .object({
    decision: z.enum(['approved', 'rejected']),
    sellerFeedback: z.string().trim().max(1000).nullable().default(null),
    internalReason: z.string().trim().max(2000).nullable().default(null),
    // Set when the admin has checked the seller's AgriSETA support claim.
    confirmAgriseta: z.boolean().default(false),
  })
  .strict();

export const buyerProfileSchema = z
  .object({
    organisationName: z.string().trim().min(2, 'Enter the name of the organisation you buy for.').max(120),
    organisationType: z.enum(BUYER_ORGANISATION_TYPES, { message: 'Choose what kind of organisation you buy for.' }),
  })
  .strict();

export const listingModerationSchema = z
  .object({ status: z.enum(['published', 'rejected', 'archived']), reason: z.string().trim().max(1000).default('') })
  .strict();