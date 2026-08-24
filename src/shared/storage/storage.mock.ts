import { mkdir, stat, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { env } from '../config/env.js';
import type { StorageProvider } from './storage.types.js';

export class MockStorageProvider implements StorageProvider {
  readonly name = 'mock';

  private get root(): string {
    return resolve(env.STORAGE_UPLOAD_DIR);
  }

  private filePath(key: string): string {
    return join(this.root, key);
  }

  async upload(params: {
    key: string;
    contentType: string;
    body: NodeJS.ReadableStream;
  }): Promise<{ url: string }> {
    const filePath = this.filePath(params.key);
    await mkdir(resolve(filePath, '..'), { recursive: true });
    await pipeline(params.body, createWriteStream(filePath));
    const base =
      env.PUBLIC_URL ?? process.env.RENDER_EXTERNAL_URL ?? `http://${env.HOST}:${env.PORT}`;
    return { url: `${base}/uploads/${params.key}` };
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.filePath(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.filePath(key));
      return true;
    } catch {
      return false;
    }
  }
}
