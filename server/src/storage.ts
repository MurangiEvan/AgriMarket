import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';

import type { Environment } from './config.js';
import { HttpError } from './http.js';

const allowedTypes = new Map([
  ['application/pdf', '.pdf'],
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
]);
const allowedImageTypes = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

export type PrivateStorage = {
  storeVerificationDocument(file: { buffer: Buffer; size: number }): Promise<string>;
  readPrivateObject(key: string): Promise<{ buffer: Buffer; mimeType: string }>;
  removePrivateObject(key: string): Promise<void>;
};

export type PublicImageStorage = {
  directory: string | null;
  storeListingImage(file: { buffer: Buffer; size: number }): Promise<{ storageKey: string; mimeType: string; byteSize: number; width: number; height: number }>;
  readPublicImage(key: string): Promise<{ buffer: Buffer; mimeType: string }>;
  removePublicImage(key: string): Promise<void>;
};

export function createPublicImageStorage(environment: Environment): PublicImageStorage {
  if (environment.UPLOAD_STORAGE_DRIVER === 'disabled') {
    const unavailable = async (): Promise<never> => {
      throw new HttpError(503, 'IMAGE_STORAGE_UNAVAILABLE', 'Listing photo uploads are not configured.');
    };
    return { directory: null, storeListingImage: unavailable, readPublicImage: unavailable, removePublicImage: async () => undefined };
  }

  if (environment.NODE_ENV === 'production') {
    throw new Error('Local listing image storage is not allowed in production. Configure object storage.');
  }

  const directory = path.resolve(environment.LOCAL_PUBLIC_IMAGE_DIR);
  return {
    directory,
    async storeListingImage(file) {
      if (file.size < 1 || file.size > 5 * 1024 * 1024) {
        throw new HttpError(400, 'INVALID_IMAGE_SIZE', 'Each listing image must be smaller than 5 MB.');
      }
      const detected = await fileTypeFromBuffer(file.buffer);
      const extension = detected ? allowedImageTypes.get(detected.mime) : undefined;
      if (!detected || !extension) {
        throw new HttpError(400, 'UNSUPPORTED_IMAGE_TYPE', 'Upload a JPEG, PNG, or WebP image.');
      }
      let optimized: Awaited<ReturnType<ReturnType<typeof sharp>['toBuffer']>>;
      try {
        optimized = await sharp(file.buffer, { limitInputPixels: 40_000_000 })
          .rotate()
          .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82, effort: 4 })
          .toBuffer({ resolveWithObject: true });
      } catch {
        throw new HttpError(400, 'INVALID_IMAGE', 'The selected image could not be decoded.');
      }
      await mkdir(directory, { recursive: true, mode: 0o755 });
      const storageKey = `${randomUUID()}.webp`;
      await writeFile(path.join(directory, storageKey), optimized.data, { flag: 'wx', mode: 0o644 });
      return {
        storageKey,
        mimeType: 'image/webp',
        byteSize: optimized.info.size,
        width: optimized.info.width,
        height: optimized.info.height,
      };
    },
    async readPublicImage(key) {
      if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key)) {
        throw new HttpError(404, 'IMAGE_NOT_FOUND', 'The requested image was not found.');
      }
      const mimeType = 'image/webp';
      try {
        return { buffer: await readFile(path.join(directory, key)), mimeType };
      } catch {
        throw new HttpError(404, 'IMAGE_NOT_FOUND', 'The requested image was not found.');
      }
    },
    async removePublicImage(key) {
      await rm(path.join(directory, path.basename(key)), { force: true });
    },
  };
}

export function createPrivateStorage(environment: Environment): PrivateStorage {
  if (environment.UPLOAD_STORAGE_DRIVER === 'disabled') {
    return {
      storeVerificationDocument: async () => {
        throw new HttpError(503, 'UPLOADS_UNAVAILABLE', 'Document uploads are not configured.');
      },
      readPrivateObject: async () => {
        throw new HttpError(503, 'UPLOADS_UNAVAILABLE', 'Document access is not configured.');
      },
      removePrivateObject: async () => undefined,
    };
  }

  if (environment.NODE_ENV === 'production') {
    throw new Error('Local verification storage is not allowed in production. Configure private object storage.');
  }

  const directory = path.resolve(environment.LOCAL_PRIVATE_UPLOAD_DIR);

  return {
    async storeVerificationDocument(file) {
      if (file.size < 1 || file.size > 10 * 1024 * 1024) {
        throw new HttpError(400, 'INVALID_FILE_SIZE', 'Each document must be smaller than 10 MB.');
      }

      const detected = await fileTypeFromBuffer(file.buffer);
      const extension = detected ? allowedTypes.get(detected.mime) : undefined;
      if (!detected || !extension) {
        throw new HttpError(400, 'UNSUPPORTED_FILE_TYPE', 'Upload a PDF, JPEG, or PNG document.');
      }

      await mkdir(directory, { recursive: true, mode: 0o700 });
      const key = `${randomUUID()}${extension}`;
      await writeFile(path.join(directory, key), file.buffer, { flag: 'wx', mode: 0o600 });
      return key;
    },

    async readPrivateObject(key) {
      if (!/^[0-9a-f-]{36}\.(pdf|jpg|png)$/.test(key)) {
        throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'The requested document was not found.');
      }
      const extension = path.extname(key);
      const mimeType = extension === '.pdf' ? 'application/pdf' : extension === '.png' ? 'image/png' : 'image/jpeg';
      try {
        return { buffer: await readFile(path.join(directory, key)), mimeType };
      } catch {
        throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'The requested document was not found.');
      }
    },

    async removePrivateObject(key) {
      await rm(path.join(directory, path.basename(key)), { force: true });
    },
  };
}