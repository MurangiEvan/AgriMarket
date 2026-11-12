import assert from 'node:assert/strict';
import test from 'node:test';

import { loadEnvironment } from './config.js';

const validProduction = {
  NODE_ENV: 'production',
  PORT: '4000',
  DATABASE_URL: 'postgresql://user:password@database.example.test/agrimarket',
  SESSION_SECRET: 'production-session-secret-with-more-than-thirty-two-characters',
  COOKIE_SECURE: 'true',
  CORS_ORIGINS: 'https://agrimarket.example.test',
  CLIENT_ORIGIN: 'https://agrimarket.example.test',
  UPLOAD_STORAGE_DRIVER: 'disabled',
  BREVO_API_KEY: 'test-brevo-key',
  MAIL_FROM_EMAIL: 'no-reply@agrimarket.example.test',
};

test('on Render the client origin and CORS allowlist default to the service URL', () => {
  const { CLIENT_ORIGIN: _client, CORS_ORIGINS: _cors, ...withoutOrigins } = validProduction;
  const environment = loadEnvironment({ ...withoutOrigins, RENDER_EXTERNAL_URL: 'https://agrimarket.onrender.com' });
  assert.equal(environment.CLIENT_ORIGIN, 'https://agrimarket.onrender.com');
  assert.equal(environment.CORS_ORIGINS, 'https://agrimarket.onrender.com');
  assert.equal(loadEnvironment({ ...validProduction, RENDER_EXTERNAL_URL: 'https://agrimarket.onrender.com' }).CLIENT_ORIGIN, 'https://agrimarket.example.test');
});

test('admin website origins are added to the CORS allowlist and must be HTTPS in production', () => {
  const { CLIENT_ORIGIN: _client, CORS_ORIGINS: _cors, ...withoutOrigins } = validProduction;
  const onRender = { ...withoutOrigins, RENDER_EXTERNAL_URL: 'https://agrimarket.onrender.com' };
  const environment = loadEnvironment({ ...onRender, ADMIN_ORIGINS: 'https://agrimarket-admin.vercel.app/' });
  assert.equal(environment.CORS_ORIGINS, 'https://agrimarket.onrender.com,https://agrimarket-admin.vercel.app');
  assert.equal(environment.CLIENT_ORIGIN, 'https://agrimarket.onrender.com');
  assert.throws(() => loadEnvironment({ ...onRender, ADMIN_ORIGINS: 'http://agrimarket-admin.vercel.app' }));
  assert.throws(() => loadEnvironment({ ...onRender, ADMIN_ORIGINS: 'https://localhost:3000' }));
  assert.equal(loadEnvironment({ ...onRender }).CORS_ORIGINS, 'https://agrimarket.onrender.com');
});

test('Brevo email requires a sender and is mandatory in production', () => {
  assert.equal(loadEnvironment(validProduction).MAIL_FROM_NAME, 'AgriMarket');
  assert.throws(() => loadEnvironment({ ...validProduction, BREVO_API_KEY: undefined }));
  assert.throws(() => loadEnvironment({ ...validProduction, MAIL_FROM_EMAIL: undefined }));
  assert.doesNotThrow(() => loadEnvironment({ ...validProduction, NODE_ENV: 'development', BREVO_API_KEY: undefined, MAIL_FROM_EMAIL: undefined }));
});

test('production environment requires secure cookies and an explicit matching CORS origin', () => {
  assert.equal(loadEnvironment(validProduction).COOKIE_SECURE, true);
  assert.throws(() => loadEnvironment({ ...validProduction, COOKIE_SECURE: 'false' }));
  assert.throws(() => loadEnvironment({ ...validProduction, CORS_ORIGINS: '*' }));
  assert.throws(() => loadEnvironment({ ...validProduction, CORS_ORIGINS: 'http://agrimarket.example.test' }));
  assert.throws(() => loadEnvironment({ ...validProduction, CORS_ORIGINS: 'https://agrimarket.example.test/path' }));
  assert.throws(() => loadEnvironment({ ...validProduction, CORS_ORIGINS: 'https://another.example.test' }));
});

test('Cloudinary storage requires all server credentials', () => {
  const cloudinaryEnvironment = {
    ...validProduction,
    UPLOAD_STORAGE_DRIVER: 'cloudinary',
    CLOUDINARY_CLOUD_NAME: 'agrimarket-test',
    CLOUDINARY_API_KEY: 'test-api-key',
    CLOUDINARY_API_SECRET: 'test-api-secret',
  };
  assert.equal(loadEnvironment(cloudinaryEnvironment).UPLOAD_STORAGE_DRIVER, 'cloudinary');
  assert.throws(() => loadEnvironment({ ...cloudinaryEnvironment, CLOUDINARY_API_SECRET: undefined }));
});