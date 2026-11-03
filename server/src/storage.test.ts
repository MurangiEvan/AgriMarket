import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';

import type { Environment } from './config.js';
import { createPrivateStorage, createPublicImageStorage } from './storage.js';

function testEnvironment(directory: string, nodeEnvironment: Environment['NODE_ENV'] = 'test'): Environment {
  return {
    NODE_ENV: nodeEnvironment,
    PORT: 4000,
    DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:5432/agrimarket',
    SESSION_SECRET: 'test-session-secret-that-is-long-enough',
    COOKIE_SECURE: false,
    CORS_ORIGINS: 'http://localhost:8081',
    CLIENT_ORIGIN: 'http://localhost:8081',
    UPLOAD_STORAGE_DRIVER: 'local',
    LOCAL_PRIVATE_UPLOAD_DIR: directory,
    LOCAL_PUBLIC_IMAGE_DIR: path.join(directory, 'public-images'),
  };
}

test('private local storage verifies PDF bytes and reads/removes private files', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'agrimarket-private-'));
  const storage = createPrivateStorage(testEnvironment(directory));
  const buffer = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
  try {
    const key = await storage.storeVerificationDocument({ buffer, size: buffer.length });
    assert.match(key, /^[0-9a-f-]{36}\.pdf$/);
    const saved = await storage.readPrivateObject(key);
    assert.equal(saved.mimeType, 'application/pdf');
    assert.deepEqual(saved.buffer, buffer);
    await storage.removePrivateObject(key);
    await assert.rejects(storage.readPrivateObject(key));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('private storage rejects a spoofed document type and local production storage', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'agrimarket-private-'));
  const storage = createPrivateStorage(testEnvironment(directory));
  await assert.rejects(storage.storeVerificationDocument({ buffer: Buffer.from('not a PDF'), size: 9 }));
  assert.throws(() => createPrivateStorage(testEnvironment(directory, 'production')));
  await rm(directory, { recursive: true, force: true });
});

test('listing photos are normalized to WebP with dimensions before public storage', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'agrimarket-images-'));
  const storage = createPublicImageStorage(testEnvironment(directory));
  const source = await sharp({ create: { width: 320, height: 180, channels: 3, background: '#74a36b' } }).png().toBuffer();
  try {
    const stored = await storage.storeListingImage({ buffer: source, size: source.length });
    assert.match(stored.storageKey, /^[0-9a-f-]{36}\.webp$/);
    assert.equal(stored.mimeType, 'image/webp');
    assert.equal(stored.width, 320);
    assert.equal(stored.height, 180);
    const result = await storage.readPublicImage(stored.storageKey);
    assert.equal(result.mimeType, 'image/webp');
    assert.ok(result.buffer.length < source.length + 100);
    await storage.removePublicImage(stored.storageKey);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});