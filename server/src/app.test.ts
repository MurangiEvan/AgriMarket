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
  MAIL_FROM_NAME: 'AgriMarket',
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
test('reporting a listing and reviewing reports both require sign-in', async () => {
  const application = createApplication(environment);
  const server = application.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const api = `http://127.0.0.1:${address.port}/api/v1`;

  try {
    const report = await fetch(`${api}/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-agrimarket-client': 'native' },
      body: JSON.stringify({ targetType: 'listing', targetId: '6f7c2a2e-9d1b-4a35-8c34-1f0f5b1c2d3e', reason: 'scam_or_fraud' }),
    });
    assert.equal(report.status, 401);

    const queue = await fetch(`${api}/admin/reports`);
    assert.equal(queue.status, 401);
  } finally {
    server.close();
    await once(server, 'close');
    await application.close();
  }
});

test('deletion requests and privacy acceptance require sign-in', async () => {
  const application = createApplication(environment);
  const server = application.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const api = `http://127.0.0.1:${address.port}/api/v1`;
  const native = { 'Content-Type': 'application/json', 'x-agrimarket-client': 'native' };

  try {
    assert.equal((await fetch(`${api}/account/deletion-request`)).status, 401);
    assert.equal((await fetch(`${api}/account/deletion-request`, { method: 'POST', headers: native, body: '{}' })).status, 401);
    assert.equal((await fetch(`${api}/auth/privacy/accept`, { method: 'POST', headers: native, body: '{}' })).status, 401);
    assert.equal((await fetch(`${api}/admin/deletion-requests`)).status, 401);
  } finally {
    server.close();
    await once(server, 'close');
    await application.close();
  }
});

test('rating a supplier and moderating comments require sign-in', async () => {
  const application = createApplication(environment);
  const server = application.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const api = `http://127.0.0.1:${address.port}/api/v1`;
  const native = { 'Content-Type': 'application/json', 'x-agrimarket-client': 'native' };
  const enquiryId = '6f7c2a2e-9d1b-4a35-8c34-1f0f5b1c2d3e';

  try {
    assert.equal((await fetch(`${api}/enquiries/${enquiryId}/rating`, { method: 'POST', headers: native, body: JSON.stringify({ stars: 5 }) })).status, 401);
    assert.equal((await fetch(`${api}/seller/enquiries/ratings`)).status, 401);
    assert.equal((await fetch(`${api}/admin/ratings`)).status, 401);
  } finally {
    server.close();
    await once(server, 'close');
    await application.close();
  }
});

test('switching to a seller account requires sign-in', async () => {
  const application = createApplication(environment);
  const server = application.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/become-seller`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-agrimarket-client': 'native' },
      body: '{}',
    });
    assert.equal(response.status, 401);
  } finally {
    server.close();
    await once(server, 'close');
    await application.close();
  }
});
