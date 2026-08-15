import { readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/db/prisma.js';
import { createUser } from '../auth/auth.service.js';
import { env } from '../../shared/config/index.js';
import { getStorageProvider, resetStorageProvider } from '../../shared/storage/index.js';

const UPLOAD_DIR = resolve(env.STORAGE_UPLOAD_DIR);

describe('uploads module', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await rm(UPLOAD_DIR, { recursive: true, force: true });
  });

  beforeEach(async () => {
    resetStorageProvider();
    await prisma.rating.deleteMany();
    await prisma.webhookEvent.deleteMany();

    await prisma.reconciliationMismatch.deleteMany();

    await prisma.driverTripPayout.deleteMany();
    await prisma.notificationPreference.deleteMany();
    await prisma.otpCode.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.foodOrderItem.deleteMany();
    await prisma.foodOrder.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.seatInventory.deleteMany();
    await prisma.trip.deleteMany();
    await prisma.route.deleteMany();
    await prisma.bus.deleteMany();
    await prisma.operatorProfile.deleteMany();
    await prisma.vendorProfile.deleteMany();
    await prisma.foodCategory.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
  });

  async function createTestUser(overrides: Partial<Parameters<typeof createUser>[0]> = {}) {
    const email = `user-${Math.random().toString(36).slice(2)}@foodiebus.mw`;
    const phone = `+26599${String(Math.floor(1000000 + Math.random() * 9000000))}`;
    const user = await createUser({
      email,
      phone,
      password: 'password123',
      fullName: 'Test User',
      role: 'STUDENT',
      ...overrides,
    });
    return { ...user, email, phone };
  }

  async function loginAs(email: string, password: string) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { identifier: email, password },
    });
  }

  async function studentToken() {
    const user = await createTestUser();
    const login = await loginAs(user.email, 'password123');
    return login.json().accessToken as string;
  }

  function formDataFor(file: Buffer, mimetype: string, field = 'file') {
    const form = new FormData();
    form.append(field, new Blob([file], { type: mimetype }), 'image.jpg');
    return form;
  }

  it('uploads a PNG and returns a URL, storing the file on disk (mock)', async () => {
    const token = await studentToken();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/uploads?category=dishes',
      headers: { authorization: `Bearer ${token}` },
      payload: formDataFor(png, 'image/png'),
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.url).toMatch(/^http:\/\/[^/]+\/uploads\/dishes\/.+\.png$/);
    expect(body.key).toMatch(/^dishes\/[0-9a-f-]+\.png$/);

    const filePath = join(UPLOAD_DIR, body.key);
    const stored = await readFile(filePath);
    expect(stored).toEqual(png);
  });

  it('uploads a JPEG and a WEBP', async () => {
    const token = await studentToken();
    for (const [mimetype, magic] of [
      ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0])],
      ['image/webp', Buffer.from([0x52, 0x49, 0x46, 0x46])],
    ] as const) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/uploads',
        headers: { authorization: `Bearer ${token}` },
        payload: formDataFor(magic, mimetype),
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().url).toMatch(/\.(jpg|webp)$/);
    }
  });

  it('rejects an unsupported file type', async () => {
    const token = await studentToken();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/uploads',
      headers: { authorization: `Bearer ${token}` },
      payload: formDataFor(Buffer.from([1, 2, 3]), 'text/plain'),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a request with no file field', async () => {
    const token = await studentToken();
    const form = new FormData();
    form.append('foo', 'bar');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/uploads',
      headers: { authorization: `Bearer ${token}` },
      payload: form,
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an unauthenticated upload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/uploads',
      payload: formDataFor(Buffer.from([1, 2, 3]), 'image/png'),
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an invalid category query param', async () => {
    const token = await studentToken();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/uploads?category=../secret',
      headers: { authorization: `Bearer ${token}` },
      payload: formDataFor(Buffer.from([1, 2, 3]), 'image/png'),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a file larger than the configured limit', async () => {
    const token = await studentToken();
    const big = Buffer.alloc((env.STORAGE_MAX_SIZE_MB + 1) * 1024 * 1024, 7);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/uploads',
      headers: { authorization: `Bearer ${token}` },
      payload: formDataFor(big, 'image/png'),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('serves the uploaded file back through the static route (mock)', async () => {
    const token = await studentToken();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 8, 7]);
    const upload = await app.inject({
      method: 'POST',
      url: '/api/v1/uploads',
      headers: { authorization: `Bearer ${token}` },
      payload: formDataFor(png, 'image/png'),
    });
    expect(upload.statusCode).toBe(201);

    const url = upload.json().url;
    const path = new URL(url).pathname;
    const served = await app.inject({ method: 'GET', url: path });
    expect(served.statusCode).toBe(200);
    expect(served.rawPayload).toEqual(png);
  });

  it('writes an audit log entry on upload', async () => {
    const token = await studentToken();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/uploads?category=logos',
      headers: { authorization: `Bearer ${token}` },
      payload: formDataFor(Buffer.from([1, 2, 3]), 'image/png'),
    });
    expect(res.statusCode).toBe(201);
    const log = await prisma.auditLog.findFirst({ where: { action: 'upload.create' } });
    expect(log).not.toBeNull();
    expect(log?.entityId).toBe(res.json().key);
  });

  it('uses the configured storage provider singleton', () => {
    const provider = getStorageProvider();
    expect(provider.name).toBe('mock');
  });
});
