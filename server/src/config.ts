import 'dotenv/config';
import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  GOOGLE_MAPS_API_KEY: z.string().trim().min(1).optional(),
  CLOUDINARY_CLOUD_NAME: z.string().trim().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().trim().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().trim().min(1).optional(),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  CORS_ORIGINS: z.string().default('http://localhost:8081,http://localhost:19006'),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:8081'),
  UPLOAD_STORAGE_DRIVER: z.enum(['local', 'cloudinary', 'disabled']).default('local'),
  LOCAL_PRIVATE_UPLOAD_DIR: z.string().default('./var/private-uploads'),
  LOCAL_PUBLIC_IMAGE_DIR: z.string().default('./var/public-listing-images'),
  BREVO_API_KEY: z.string().trim().min(1).optional(),
  MAIL_FROM_EMAIL: z.email().optional(),
  MAIL_FROM_NAME: z.string().trim().min(1).max(70).default('AgriMarket'),
  PASSWORD_RESET_URL: z.url().optional(),
  WEB_APP_DIR: z.string().trim().min(1).optional(),
}).superRefine((environment, context) => {
  if (environment.BREVO_API_KEY && !environment.MAIL_FROM_EMAIL) {
    context.addIssue({ code: 'custom', path: ['MAIL_FROM_EMAIL'], message: 'Brevo email requires MAIL_FROM_EMAIL (a sender verified in Brevo).' });
  }


  if (
    environment.UPLOAD_STORAGE_DRIVER === 'cloudinary' &&
    (!environment.CLOUDINARY_CLOUD_NAME || !environment.CLOUDINARY_API_KEY || !environment.CLOUDINARY_API_SECRET)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['UPLOAD_STORAGE_DRIVER'],
      message: 'Cloudinary storage requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
    });
  }

  if (environment.NODE_ENV !== 'production') return;

  if (!environment.BREVO_API_KEY) {
    context.addIssue({ code: 'custom', path: ['BREVO_API_KEY'], message: 'Production requires BREVO_API_KEY so password reset emails can be sent.' });
  }

  if (!environment.COOKIE_SECURE) {
    context.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'Production cookies must be Secure.' });
  }

  const origins = environment.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean);
  const invalidOrigins = origins.some((origin) => {
    try {
      const parsed = new URL(origin);
      return parsed.origin !== origin || parsed.protocol !== 'https:' || parsed.hostname === 'localhost';
    } catch {
      return true;
    }
  });
  if (origins.includes('*') || invalidOrigins) {
    context.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: 'Production CORS must use exact HTTPS origins that are not local.' });
  }
  if (!origins.includes(environment.CLIENT_ORIGIN)) {
    context.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: 'CORS_ORIGINS must include CLIENT_ORIGIN.' });
  }
});

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  // On Render the web app and API share the service's public URL, so default the
  // client origin and CORS allowlist to it instead of requiring them to be typed in.
  const renderUrl = source.RENDER_EXTERNAL_URL?.replace(/\/$/, '');
  const clientOrigin = source.CLIENT_ORIGIN || renderUrl;
  return environmentSchema.parse({
    ...source,
    CLIENT_ORIGIN: clientOrigin,
    CORS_ORIGINS: source.CORS_ORIGINS || (renderUrl ? clientOrigin : undefined),
  });
}