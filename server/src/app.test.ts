import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import type { Environment } from './config.js';
import { createApplication } from './app.js';

const environment: Environment = {
  NODE_ENV: 'test',
  PORT: 4000,
  DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:5432/agrimarket',
  SESSION_SECRET: 'test-session-secret-that-is-long-enough',
  COOKIE_SECURE: false,
  CORS_ORIGINS: 'http://localhost:8081',
  CLIENT_ORIGIN: 'http://localhost:8081',
  UPLOAD_STORAGE_DRIVER: 'disabled',
  LOCAL_PRIVATE_UPLOAD_DIR: './var/private-uploads',
  LOCAL_PUBLIC_IMAGE_DIR: './var/public-listing-images',
};

test('health endpoints do not reveal dependencies or secrets', async () => {
  const application = createApplication(environment);
  const server = application.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1/health`;

  try {
    const live = await fetch(`${baseUrl}/live`);
    assert.equal(live.status, 200);
    assert.deepEqual(await live.json(), { data: { status: 'live' } });

    const ready = await fetch(`${baseUrl}/ready`);
    assert.equal(ready.status, 503);
    const body = await ready.json() as { error: { message: string } };
    assert.equal(body.error.message, 'Service is not ready.');
    assert.equal(JSON.stringify(body).includes('unused'), false);

    const mutation = await fetch(`${baseUrl.replace('/health', '')}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'buyer@example.test', password: 'invalid' }),
    });
    assert.equal(mutation.status, 403);
  } finally {
    server.close();
    await once(server, 'close');
    await application.close();
  }
});