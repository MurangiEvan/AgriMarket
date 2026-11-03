import 'dotenv/config';
import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  GOOGLE_MAPS_API_KEY: z.string().trim().min(1).optional(),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  CORS_ORIGINS: z.string().default('http://localhost:8081,http://localhost:19006'),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:8081'),
  UPLOAD_STORAGE_DRIVER: z.enum(['local', 'disabled']).default('local'),
  LOCAL_PRIVATE_UPLOAD_DIR: z.string().default('./var/private-uploads'),
  LOCAL_PUBLIC_IMAGE_DIR: z.string().default('./var/public-listing-images'),
}).superRefine((environment, context) => {
  if (environment.NODE_ENV !== 'production') return;

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
  return environmentSchema.parse(source);
}