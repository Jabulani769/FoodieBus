import type { Readable } from 'node:stream';

export interface StorageUploadParams {
  key: string;
  contentType: string;
  body: Readable;
}

export interface StorageProvider {
  readonly name: string;
  upload(params: StorageUploadParams): Promise<{ url: string }>;
  delete(key: string): Promise<void>;
}
