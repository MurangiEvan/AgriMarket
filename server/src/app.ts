import path from 'node:path';

import { parseCookie } from 'cookie';
import cors from 'cors';
import { and, asc, eq } from 'drizzle-orm';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

import type { Environment } from './config.js';
import { loadEnvironment } from './config.js';
import { createDatabase } from './db/client.js';
import { categories, produceTypes } from './db/schema.js';
import { errorHandler, HttpError } from './http.js';
import { createMailer, type Mailer } from './mailer.js';
import { isTrustedOrigin, requireTrustedOrigin } from './middleware/auth.js';
import { createAdminRouter } from './routes/admin.js';
import { createAuthRouter } from './routes/auth.js';
import { createBuyerRouter } from './routes/buyer.js';
import { createBuyerEnquiriesRouter, createSellerEnquiriesRouter } from './routes/enquiries.js';
import { createPublicImagesRouter } from './routes/images.js';
import { createListingsRouter } from './routes/listings.js';
import { createMarketRouter } from './routes/market.js';
import { createSellerRouter } from './routes/seller.js';
import { createPrivateStorage, createPublicImageStorage } from './storage.js';

export type Application = {
  app: Express;
  close: () => Promise<void>;
};

export function createApplication(
  environment: Environment = loadEnvironment(),
  mailer: Mailer = createMailer(environment),
): Application {
  const { db, pool } = createDatabase(environment.DATABASE_URL);
  const storage = createPrivateStorage(environment);
  const imageStorage = createPublicImageStorage(environment);
  const allowedOrigins = new Set(environment.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean));
  const allowLocalDevelopmentOrigins = environment.NODE_ENV !== 'production';
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', environment.NODE_ENV === 'production' ? 1 : false);
  const apiHelmet = helmet();
  // The exported Expo pages include small inline bootstrap scripts and preview picked photos via blob: URLs.
  const webHelmet = helmet({
    contentSecurityPolicy: {
      directives: {
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
      },
    },
  });
  app.use((request, response, next) => (request.path.startsWith('/api/') ? apiHelmet : webHelmet)(request, response, next));
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        callback(null, isTrustedOrigin(origin, allowedOrigins, allowLocalDevelopmentOrigins));
      },
    }),
  );
  app.use(express.json({ limit: '32kb' }));
  app.use((request, _response, next) => {
    request.cookies = parseCookie(request.headers.cookie ?? '');
    next();
  });
  app.use(requireTrustedOrigin(allowedOrigins, allowLocalDevelopmentOrigins));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, response) => {
      response.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many authentication attempts. Please wait and try again.',
          details: [],
        },
      });
    },
  });
  const passwordResetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, response) => {
      response.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many password reset attempts. Please wait and try again.',
          details: [],
        },
      });
    },
  });
  const enquiryLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
  const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
  const locationSearchLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });

  app.get('/api/v1/health/live', (_request, response) => response.json({ data: { status: 'live' } }));
  app.get('/api/v1/health/ready', async (_request, response) => {
    try {
      await pool.query('SELECT 1');
      response.json({ data: { status: 'ready' } });
    } catch {
      response.status(503).json({ error: { code: 'NOT_READY', message: 'Service is not ready.', details: [] } });
    }
  });

  app.use('/api/v1/auth/register', authLimiter);
  app.use('/api/v1/auth/login', authLimiter);
  app.use('/api/v1/auth/refresh', authLimiter);
  app.use('/api/v1/auth/password-reset', passwordResetLimiter);
  app.use('/api/v1/auth', createAuthRouter(db, environment.COOKIE_SECURE, environment.SESSION_SECRET, {
    mailer,
    resetUrl: environment.PASSWORD_RESET_URL ?? `${environment.CLIENT_ORIGIN}/reset-password`,
  }));
  app.get('/api/v1/categories', async (_request, response, next) => {
    try {
      const result = await db
        .selectDistinct({ id: categories.id, slug: categories.slug, name: categories.name })
        .from(categories)
        .innerJoin(produceTypes, eq(produceTypes.categoryId, categories.id))
        .where(and(eq(categories.isActive, true), eq(produceTypes.active, true)))
        .orderBy(asc(categories.name));
      response.json({ data: result });
    } catch (error) {
      next(error);
    }
  });
  app.use('/api/v1/listings', createListingsRouter(db));
  app.use('/api/v1/market', createMarketRouter(db, environment.SESSION_SECRET));
  app.use('/api/v1/buyer/location/search', locationSearchLimiter);
  app.use('/api/v1/buyer', createBuyerRouter(db, environment.SESSION_SECRET, environment.GOOGLE_MAPS_API_KEY));
  app.use('/api/v1/media/listings', createPublicImagesRouter(db, imageStorage));
  app.use('/api/v1/seller/verification', uploadLimiter);
  app.use('/api/v1/seller/listings/:listingId/images', uploadLimiter);
  app.use('/api/v1/seller', createSellerRouter(db, storage, imageStorage, environment.SESSION_SECRET, environment.GOOGLE_MAPS_API_KEY));
  app.use('/api/v1/enquiries', enquiryLimiter, createBuyerEnquiriesRouter(db, environment.SESSION_SECRET));
  app.use('/api/v1/seller/enquiries', createSellerEnquiriesRouter(db, environment.SESSION_SECRET));
  app.use('/api/v1/admin', createAdminRouter(db, storage, environment.SESSION_SECRET));

  if (environment.WEB_APP_DIR) {
    // Serve the exported Expo web app from the same origin as the API (single Render service).
    const webAppDir = path.resolve(environment.WEB_APP_DIR);
    app.use(
      express.static(webAppDir, {
        extensions: ['html'],
        setHeaders(response, filePath) {
          const hashedAsset = filePath.includes(`${path.sep}_expo${path.sep}`);
          response.setHeader('Cache-Control', hashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache');
        },
      }),
    );
    app.get(/^(?!\/api\/).*/, (_request, response) => {
      response.status(404).setHeader('Cache-Control', 'no-cache').sendFile(path.join(webAppDir, '+not-found.html'));
    });
  }

  app.use((_request, _response, next) => next(new HttpError(404, 'NOT_FOUND', 'The requested endpoint was not found.')));
  app.use(errorHandler);

  return { app, close: () => pool.end() };
}