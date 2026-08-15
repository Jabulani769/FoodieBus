import { Server } from 'socket.io';
import type { FastifyInstance } from 'fastify';
import { verifyAccessToken } from '../modules/auth/jwt.js';
import { logger } from '../shared/logger/index.js';

let io: Server | null = null;

export interface TripStatusEvent {
  tripId: string;
  status: string;
  route: string;
  departureTime: string;
}

export interface FoodOrderStatusEvent {
  orderId: string;
  status: string;
  vendorName: string;
}

export interface TripLocationEvent {
  tripId: string;
  lat: number;
  lng: number;
  updatedAt: string;
}

export function initRealtime(app: FastifyInstance): Server {
  if (io) return io;

  io = new Server(app.server, {
    cors: { origin: true, credentials: true },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    const payload = verifyAccessToken(token);
    if (!payload) {
      return next(new Error('Invalid or expired token'));
    }
    socket.user = {
      id: payload.sub,
      role: payload.role,
      email: payload.email,
    };
    next();
  });

  io.on('connection', (socket) => {
    logger.info({ socketId: socket.id, userId: socket.user?.id }, 'socket connected');

    if (socket.user) {
      void socket.join(`user:${socket.user.id}`);
    }

    socket.on('trip:join', (tripId: string) => {
      if (typeof tripId === 'string' && tripId) {
        void socket.join(`trip:${tripId}`);
      }
    });

    socket.on('trip:leave', (tripId: string) => {
      if (typeof tripId === 'string' && tripId) {
        void socket.leave(`trip:${tripId}`);
      }
    });

    socket.on('disconnect', () => {
      logger.info({ socketId: socket.id }, 'socket disconnected');
    });
  });

  return io;
}

export function getRealtime(): Server | null {
  return io;
}

export function emitTripStatus(event: TripStatusEvent): void {
  io?.to(`trip:${event.tripId}`).emit('trip:status', event);
}

export function emitFoodOrderStatus(passengerId: string, event: FoodOrderStatusEvent): void {
  io?.to(`user:${passengerId}`).emit('food:order-status', event);
}

export function emitTripLocation(event: TripLocationEvent): void {
  io?.to(`trip:${event.tripId}`).emit('trip:location', event);
}
