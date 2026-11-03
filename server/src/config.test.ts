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
};

test('production environment requires secure cookies and an explicit matching CORS origin', () => {
  assert.equal(loadEnvironment(validProduction).COOKIE_SECURE, true);
  assert.throws(() => loadEnvironment({ ...validProduction, COOKIE_SECURE: 'false' }));
  assert.throws(() => loadEnvironment({ ...validProduction, CORS_ORIGINS: '*' }));
  assert.throws(() => loadEnvironment({ ...validProduction, CORS_ORIGINS: 'http://agrimarket.example.test' }));
  assert.throws(() => loadEnvironment({ ...validProduction, CORS_ORIGINS: 'https://agrimarket.example.test/path' }));
  assert.throws(() => loadEnvironment({ ...validProduction, CORS_ORIGINS: 'https://another.example.test' }));
});