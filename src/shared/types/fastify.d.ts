import type { PrismaClient } from '../generated/prisma/client.js';
import type { Role } from '../generated/prisma/enums.js';
import type Redis from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    redis: Redis;
  }

  interface FastifyRequest {
    user?: {
      id: string;
      role: Role;
      email: string;
      phone: string;
    };
  }
}

declare module 'socket.io' {
  interface Socket {
    user?: {
      id: string;
      role: Role;
      email: string;
    };
  }
}
