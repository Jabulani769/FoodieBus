import { prisma } from '../../shared/db/prisma.js';
import { AppError } from '../../shared/errors/AppError.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  CreateBookingInput,
  CreateBusInput,
  CreateRouteInput,
  CreateTripInput,
  UpdateBusInput,
  UpdateOperatorProfileInput,
  UpdateRouteInput,
  UpdateTripInput,
} from './bus.schema.js';
import type { BookingStatus, TripStatus } from '../../generated/prisma/enums.js';

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export class BusService {
  // ---- Operator profiles ----

  async listOperators(page: number, limit: number): Promise<PaginatedResult<unknown>> {
    const where = { isActive: true };
    const [items, total] = await Promise.all([
      prisma.operatorProfile.findMany({
        where,
        include: { user: { select: { fullName: true } } },
        orderBy: { businessName: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.operatorProfile.count({ where }),
    ]);
    return { items, page, limit, total };
  }

  async getOperatorById(id: string): Promise<unknown> {
    const operator = await prisma.operatorProfile.findUnique({
      where: { id },
      include: { user: { select: { fullName: true } } },
    });
    if (!operator || !operator.isActive) throw AppError.notFound('Operator not found');
    return operator;
  }

  async getOperatorByUserId(userId: string): Promise<unknown> {
    const operator = await prisma.operatorProfile.findUnique({ where: { userId } });
    if (!operator) throw AppError.notFound('Operator profile not found');
    return operator;
  }

  async updateOperatorProfile(
    userId: string,
    data: UpdateOperatorProfileInput,
  ): Promise<{ id: string }> {
    const operator = await prisma.operatorProfile.findUnique({ where: { userId } });
    if (!operator) throw AppError.notFound('Operator profile not found');

    await prisma.operatorProfile.update({ where: { id: operator.id }, data });
    return { id: operator.id };
  }

  // ---- Buses ----

  async listOperatorBuses(operatorId: string): Promise<{ items: unknown[] }> {
    const operator = await prisma.operatorProfile.findUnique({ where: { id: operatorId } });
    if (!operator) throw AppError.notFound('Operator not found');

    const items = await prisma.bus.findMany({
      where: { operatorId },
      orderBy: { createdAt: 'asc' },
    });
    return { items };
  }

  async createBus(operatorId: string, data: CreateBusInput): Promise<{ id: string }> {
    try {
      const bus = await prisma.bus.create({
        data: { operatorId, ...data },
      });
      return { id: bus.id };
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw AppError.conflict('A bus with this plate number already exists');
      }
      throw err;
    }
  }

  async updateBus(
    busId: string,
    operatorId: string,
    data: UpdateBusInput,
  ): Promise<{ id: string }> {
    const bus = await prisma.bus.findUnique({ where: { id: busId } });
    if (!bus) throw AppError.notFound('Bus not found');
    if (bus.operatorId !== operatorId) {
      throw AppError.forbidden('You can only update your own buses');
    }

    try {
      await prisma.bus.update({ where: { id: busId }, data });
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw AppError.conflict('A bus with this plate number already exists');
      }
      throw err;
    }
    return { id: busId };
  }

  async deleteBus(busId: string): Promise<void> {
    const bus = await prisma.bus.findUnique({ where: { id: busId } });
    if (!bus) throw AppError.notFound('Bus not found');

    const tripCount = await prisma.trip.count({ where: { busId } });
    if (tripCount > 0) {
      throw AppError.conflict('Cannot delete a bus that has trips scheduled');
    }

    await prisma.bus.delete({ where: { id: busId } });
  }

  // ---- Routes ----

  async listRoutes(): Promise<{ items: unknown[] }> {
    const items = await prisma.route.findMany({
      where: { isActive: true },
      orderBy: { fromCity: 'asc' },
    });
    return { items };
  }

  async createRoute(data: CreateRouteInput): Promise<{ id: string }> {
    try {
      const route = await prisma.route.create({ data });
      return { id: route.id };
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw AppError.conflict('A route between these cities already exists');
      }
      throw err;
    }
  }

  async updateRoute(id: string, data: UpdateRouteInput): Promise<{ id: string }> {
    const existing = await prisma.route.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound('Route not found');

    try {
      await prisma.route.update({ where: { id }, data });
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw AppError.conflict('A route between these cities already exists');
      }
      throw err;
    }
    return { id };
  }

  async deleteRoute(id: string): Promise<void> {
    const existing = await prisma.route.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound('Route not found');

    const tripCount = await prisma.trip.count({ where: { routeId: id } });
    if (tripCount > 0) {
      throw AppError.conflict('Cannot delete a route that has trips scheduled');
    }

    await prisma.route.delete({ where: { id } });
  }

  // ---- Trips ----

  async searchTrips(
    fromCity: string | undefined,
    toCity: string | undefined,
    date: string | undefined,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<unknown>> {
    const where: Prisma.TripWhereInput = { status: { not: 'CANCELLED' } };

    if (fromCity || toCity) {
      where.route = {
        ...(fromCity ? { fromCity: { equals: fromCity, mode: 'insensitive' } } : {}),
        ...(toCity ? { toCity: { equals: toCity, mode: 'insensitive' } } : {}),
      };
    }

    if (date) {
      const dayStart = new Date(`${date}T00:00:00.000Z`);
      const dayEnd = new Date(`${date}T23:59:59.999Z`);
      where.departureTime = { gte: dayStart, lte: dayEnd };
    }

    const [items, total] = await Promise.all([
      prisma.trip.findMany({
        where,
        include: {
          operator: { select: { id: true, businessName: true } },
          route: true,
          bus: { select: { id: true, name: true, busType: true, capacity: true } },
          _count: {
            select: { bookings: { where: { status: { in: ['PENDING', 'CONFIRMED'] } } } },
          },
        },
        orderBy: { departureTime: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.trip.count({ where }),
    ]);
    return { items, page, limit, total };
  }

  async getTripById(id: string): Promise<unknown> {
    const trip = await prisma.trip.findUnique({
      where: { id },
      include: {
        operator: { select: { id: true, businessName: true } },
        route: true,
        bus: { select: { id: true, name: true, plateNumber: true, busType: true, capacity: true } },
        seats: { orderBy: { seatNumber: 'asc' } },
      },
    });
    if (!trip) throw AppError.notFound('Trip not found');
    return trip;
  }

  async createTrip(operatorId: string, data: CreateTripInput): Promise<{ id: string }> {
    const route = await prisma.route.findUnique({ where: { id: data.routeId } });
    if (!route) throw AppError.notFound('Route not found');

    const bus = await prisma.bus.findUnique({ where: { id: data.busId } });
    if (!bus) throw AppError.notFound('Bus not found');
    if (bus.operatorId !== operatorId) {
      throw AppError.forbidden('You can only schedule trips with your own buses');
    }

    const departure = new Date(data.departureTime);
    const arrival = new Date(data.arrivalTime);
    if (arrival <= departure) {
      throw AppError.validation('arrivalTime must be after departureTime');
    }

    const trip = await prisma.$transaction(async (tx) => {
      const created = await tx.trip.create({
        data: {
          operatorId,
          routeId: data.routeId,
          busId: data.busId,
          departureTime: departure,
          arrivalTime: arrival,
          price: data.price,
        },
      });

      const seats = Array.from({ length: bus.capacity }, (_, i) => ({
        tripId: created.id,
        seatNumber: String(i + 1),
      }));
      await tx.seatInventory.createMany({ data: seats });

      return created;
    });

    return { id: trip.id };
  }

  async updateTrip(
    tripId: string,
    operatorId: string,
    data: UpdateTripInput,
  ): Promise<{ id: string }> {
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw AppError.notFound('Trip not found');
    if (trip.operatorId !== operatorId) {
      throw AppError.forbidden('You can only update your own trips');
    }

    const payload: Prisma.TripUpdateInput = {};
    if (data.departureTime) payload.departureTime = new Date(data.departureTime);
    if (data.arrivalTime) payload.arrivalTime = new Date(data.arrivalTime);
    if (data.price !== undefined) payload.price = data.price;

    if (
      payload.departureTime &&
      payload.arrivalTime &&
      payload.arrivalTime <= payload.departureTime
    ) {
      throw AppError.validation('arrivalTime must be after departureTime');
    }

    await prisma.trip.update({ where: { id: tripId }, data: payload });
    return { id: tripId };
  }

  async updateTripStatus(
    tripId: string,
    operatorId: string,
    status: TripStatus,
  ): Promise<{ id: string }> {
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw AppError.notFound('Trip not found');
    if (trip.operatorId !== operatorId) {
      throw AppError.forbidden('You can only update your own trips');
    }

    await prisma.trip.update({ where: { id: tripId }, data: { status } });
    return { id: tripId };
  }

  async deleteTrip(tripId: string): Promise<void> {
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw AppError.notFound('Trip not found');

    const bookingCount = await prisma.booking.count({ where: { tripId } });
    if (bookingCount > 0) {
      throw AppError.conflict('Cannot delete a trip that has bookings');
    }

    await prisma.trip.delete({ where: { id: tripId } });
  }

  // ---- Bookings ----

  async createBooking(
    tripId: string,
    seatNumber: string,
    passengerId: string,
    data: CreateBookingInput,
  ): Promise<{ id: string }> {
    return prisma.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({ where: { id: tripId } });
      if (!trip) throw AppError.notFound('Trip not found');
      if (trip.status === 'CANCELLED') {
        throw AppError.conflict('This trip has been cancelled');
      }

      const seat = await tx.$queryRaw<{ id: string; status: string }[]>`
        SELECT id, status FROM "SeatInventory"
        WHERE "tripId" = ${tripId} AND "seatNumber" = ${seatNumber}
        FOR UPDATE
      `;
      const locked = seat[0];
      if (!locked) {
        throw AppError.notFound('Seat not found on this trip');
      }
      if (locked.status !== 'AVAILABLE') {
        throw new AppError('SEAT_UNAVAILABLE', 'This seat has already been taken');
      }

      const booking = await tx.booking.create({
        data: {
          tripId,
          seatId: locked.id,
          passengerId,
          passengerName: data.passengerName,
          passengerPhone: data.passengerPhone,
          status: 'PENDING',
          totalAmount: trip.price,
        },
      });

      await tx.seatInventory.update({
        where: { id: locked.id },
        data: { status: 'HELD' },
      });

      return { id: booking.id };
    });
  }

  async listBookingsByPassenger(passengerId: string): Promise<{ items: unknown[] }> {
    const items = await prisma.booking.findMany({
      where: { passengerId },
      include: {
        trip: {
          include: {
            route: true,
            operator: { select: { id: true, businessName: true } },
            bus: { select: { id: true, name: true, busType: true } },
          },
        },
        seat: { select: { seatNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { items };
  }

  async cancelBooking(bookingId: string, userId: string): Promise<{ id: string }> {
    return prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!booking) throw AppError.notFound('Booking not found');
      if (booking.passengerId !== userId) {
        throw AppError.forbidden('You can only cancel your own bookings');
      }
      if (booking.status === 'CANCELLED' || booking.status === 'EXPIRED') {
        throw AppError.conflict('Booking has already been cancelled or expired');
      }

      await tx.booking.update({
        where: { id: bookingId },
        data: { status: 'CANCELLED' },
      });
      await tx.seatInventory.update({
        where: { id: booking.seatId },
        data: { status: 'AVAILABLE' },
      });

      return { id: bookingId };
    });
  }

  // Used by the Payments module to confirm a booking after a successful webhook.
  async confirmBooking(bookingId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!booking) throw AppError.notFound('Booking not found');
      if (booking.status !== 'PENDING') {
        throw AppError.conflict(`Booking is already ${booking.status.toLowerCase()}`);
      }

      await tx.booking.update({
        where: { id: bookingId },
        data: { status: 'CONFIRMED' as BookingStatus },
      });
      await tx.seatInventory.update({
        where: { id: booking.seatId },
        data: { status: 'BOOKED' },
      });
    });
  }

  private isUniqueViolation(err: unknown): boolean {
    return err instanceof Error && 'code' in err && (err as { code?: string }).code === 'P2002';
  }
}

export const busService = new BusService();
