import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';
import type { StorageProvider } from './storage.types.js';

export class S3StorageProvider implements StorageProvider {
  readonly name = 's3';

  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor() {
    const credentials =
      env.STORAGE_S3_ACCESS_KEY_ID && env.STORAGE_S3_SECRET_ACCESS_KEY
        ? {
            accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID,
            secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY,
          }
        : undefined;

    this.client = new S3Client({
      region: env.STORAGE_S3_REGION,
      credentials,
      endpoint: env.STORAGE_S3_ENDPOINT,
      forcePathStyle: Boolean(env.STORAGE_S3_ENDPOINT),
    });
    this.bucket = env.STORAGE_S3_BUCKET ?? '';
    this.publicBaseUrl =
      env.STORAGE_S3_PUBLIC_BASE_URL ??
      `https://${this.bucket}.s3.${env.STORAGE_S3_REGION}.amazonaws.com`;
  }

  async upload(params: {
    key: string;
    contentType: string;
    body: NodeJS.ReadableStream;
  }): Promise<{ url: string }> {
    if (!this.bucket) {
      throw new Error('S3 storage requires STORAGE_S3_BUCKET');
    }
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.key,
        Body: params.body as unknown as Uint8Array,
        ContentType: params.contentType,
      }),
    );
    return { url: `${this.publicBaseUrl}/${params.key}` };
  }

  async delete(key: string): Promise<void> {
    if (!this.bucket) return;
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
