import { env } from '../config/env.js';
import { MockStorageProvider } from './storage.mock.js';
import { S3StorageProvider } from './storage.s3.js';
import type { StorageProvider } from './storage.types.js';

let instance: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (instance) return instance;
  instance = env.STORAGE_PROVIDER === 's3' ? new S3StorageProvider() : new MockStorageProvider();
  return instance;
}

export function resetStorageProvider(): void {
  instance = null;
}
