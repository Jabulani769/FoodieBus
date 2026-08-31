import { prisma } from '../../shared/db/prisma.js';
import { AppError } from '../../shared/errors/AppError.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  CreateBookingInput,
  CreateBusInput,
  CreateDriverInput,
  CreateRouteInput,
  CreateTripInput,
  UpdateBusInput,
  UpdateDriverInput,
  UpdateOperatorProfileInput,
  UpdateRouteInput,
  UpdateTripInput,
} from './bus.schema.js';
import type { BookingStatus, TripStatus, Role } from '../../generated/prisma/enums.js';
import { notificationService } from '../notifications/notification.service.js';
import { couponService } from '../coupons/coupon.service.js';
import { emitTripStatus, emitTripLocation } from '../../realtime/index.js';
import { createUser } from '../auth/auth.service.js';
import { ratingService } from '../ratings/rating.service.js';
import { writeAuditLog } from '../../shared/audit/audit.js';
import { env } from '../../shared/config/env.js';
import { redis } from '../../shared/redis/index.js';

function statusToPhrase(status: TripStatus): string {
  return status.toLowerCase().replace('_', ' ');
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export class BusService {
  // ---- Operator profiles ----

  async listOperators(
    page: number,
    limit: number,
    opts: { includeInactive?: boolean } = {},
  ): Promise<PaginatedResult<unknown>> {
    const where = opts.includeInactive ? {} : { isActive: true };
    const [items, total] = await Promise.all([
      prisma.operatorProfile.findMany({
        where,
        include: { user: { select: { fullName: true, email: true } } },
        orderBy: { businessName: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.operatorProfile.count({ where }),
    ]);
    return { items, page, limit, total };
  }

  async getOperatorById(id: string, opts: { includeInactive?: boolean } = {}): Promise<unknown> {
    const operator = await prisma.operatorProfile.findUnique({
      where: { id },
      include: { user: { select: { fullName: true, email: true } } },
    });
    if (!operator || (!opts.includeInactive && !operator.isActive))
      throw AppError.notFound('Operator not found');
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
      include: { stops: { orderBy: { order: 'asc' } } },
      orderBy: { fromCity: 'asc' },
    });
    return { items };
  }

  /**
   * Replace the stops of a route (admin only). Stop 0 is the origin (fromCity),
   * the last stop is the destination (toCity). Each stop's segmentPrice is the
   * fare for the leg from the previous stop to this stop, so the origin stop
   * must carry a segment price of 0. A route with no stops keeps the legacy
   * single-segment behaviour driven by trip.price.
   */
  async setRouteStops(
    routeId: string,
    stops: Array<{ city: string; departureOffsetMinutes: number; segmentPrice: number }>,
  ): Promise<{ id: string }> {
    const route = await prisma.route.findUnique({ where: { id: routeId } });
    if (!route) throw AppError.notFound('Route not found');
    if (stops.length < 2) {
      throw AppError.validation('At least an origin and a destination stop are required');
    }
    const first = stops[0]!;
    if (first.city.trim().toLowerCase() !== route.fromCity.toLowerCase()) {
      throw AppError.validation('The first stop must be the route origin (fromCity)');
    }
    const last = stops[stops.length - 1]!;
    if (last.city.trim().toLowerCase() !== route.toCity.toLowerCase()) {
      throw AppError.validation('The last stop must be the route destination (toCity)');
    }
    if (first.segmentPrice !== 0) {
      throw AppError.validation('The origin stop must have a segment price of 0');
    }
    for (let i = 1; i < stops.length; i += 1) {
      const prev = stops[i - 1]!;
      const curr = stops[i]!;
      if (curr.departureOffsetMinutes <= prev.departureOffsetMinutes) {
        throw AppError.validation('Stop departure offsets must be strictly increasing');
      }
      if (curr.segmentPrice < 0) {
        throw AppError.validation('Segment prices must be non-negative');
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.routeStop.deleteMany({ where: { routeId } });
      await tx.routeStop.createMany({
        data: stops.map((s, i) => ({
          routeId,
          order: i,
          city: s.city.trim(),
          departureOffsetMinutes: Math.round(s.departureOffsetMinutes),
          segmentPrice: s.segmentPrice,
        })),
      });
    });
    return { id: routeId };
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
        AND: [
          ...(fromCity
            ? [
                {
                  OR: [
                    { fromCity: { equals: fromCity, mode: 'insensitive' } },
                    { stops: { some: { city: { equals: fromCity, mode: 'insensitive' } } } },
                  ],
                } satisfies Prisma.RouteWhereInput,
              ]
            : []),
          ...(toCity
            ? [
                {
                  OR: [
                    { toCity: { equals: toCity, mode: 'insensitive' } },
                    { stops: { some: { city: { equals: toCity, mode: 'insensitive' } } } },
                  ],
                } satisfies Prisma.RouteWhereInput,
              ]
            : []),
        ],
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
          route: { include: { stops: { orderBy: { order: 'asc' } } } },
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
        route: { include: { stops: { orderBy: { order: 'asc' } } } },
        bus: { select: { id: true, name: true, plateNumber: true, busType: true, capacity: true } },
        seats: { orderBy: { seatNumber: 'asc' } },
      },
    });
    if (!trip) throw AppError.notFound('Trip not found');

    const rating = await ratingService.getRatingSummary('TRIP', id);
    return { ...trip, rating };
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
    actor: { id: string; role: Role },
    status: TripStatus,
  ): Promise<{ id: string }> {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        route: { select: { fromCity: true, toCity: true } },
      },
    });
    if (!trip) throw AppError.notFound('Trip not found');

    if (actor.role === 'OPERATOR') {
      const owned = await prisma.trip.findFirst({
        where: { id: tripId, operator: { userId: actor.id } },
      });
      if (!owned) {
        throw AppError.forbidden('You can only update the status of your own trips');
      }
    } else if (actor.role === 'DRIVER') {
      const assigned = await prisma.trip.findFirst({
        where: { id: tripId, driver: { userId: actor.id } },
      });
      if (!assigned) {
        throw AppError.forbidden('You can only update the status of your assigned trips');
      }
    } else {
      throw AppError.forbidden('You can only update the status of your own trips');
    }

    this.assertTransition(trip.status, status);

    const route = `${trip.route.fromCity} → ${trip.route.toCity}`;
    const departureTime = trip.departureTime.toISOString();

    await prisma.trip.update({ where: { id: tripId }, data: { status } });

    if (status === 'CANCELLED') {
      await this.cancelTripBookings(tripId);
    }

    if (status === 'COMPLETED') {
      await this.createDriverPayout(tripId);
    }

    await this.notifyTripPassengers(
      tripId,
      this.statusMessage(status, route, departureTime),
      tripId,
    );

    emitTripStatus({ tripId, status, route, departureTime });
    return { id: tripId };
  }

  private assertTransition(current: TripStatus, next: TripStatus): void {
    const allowed: Record<TripStatus, TripStatus[]> = {
      SCHEDULED: ['BOARDING', 'CANCELLED'],
      BOARDING: ['IN_TRANSIT', 'CANCELLED'],
      IN_TRANSIT: ['COMPLETED', 'CANCELLED'],
      COMPLETED: [],
      CANCELLED: [],
    };
    if (current === next) {
      throw AppError.conflict(`Trip is already ${statusToPhrase(next)}`);
    }
    if (!allowed[current].includes(next)) {
      throw AppError.conflict(
        `Invalid trip status transition from ${statusToPhrase(current)} to ${statusToPhrase(next)}`,
      );
    }
  }

  private statusMessage(status: TripStatus, route: string, departureTime: string): string {
    if (status === 'BOARDING') {
      return `Your trip ${route} departing ${departureTime} is now boarding at the terminal.`;
    }
    if (status === 'IN_TRANSIT') {
      return `Your trip ${route} departing ${departureTime} has departed.`;
    }
    if (status === 'COMPLETED') {
      return `Your trip ${route} departing ${departureTime} has completed.`;
    }
    if (status === 'CANCELLED') {
      return `Your trip ${route} departing ${departureTime} has been cancelled.`;
    }
    return '';
  }

  private async notifyTripPassengers(
    tripId: string,
    message: string,
    reference: string,
  ): Promise<void> {
    const bookings = await prisma.booking.findMany({
      where: { tripId },
      select: { passengerId: true },
    });
    const ids = [...new Set(bookings.map((b) => b.passengerId))];
    await Promise.all(
      ids.map((id) =>
        notificationService.notifyUser(id, 'Trip update', message, {
          reference,
          referenceType: 'trip',
        }),
      ),
    );
  }

  private async cancelTripBookings(tripId: string): Promise<void> {
    const bookings = await prisma.$transaction(async (tx) => {
      const bookingRows = await tx.booking.findMany({
        where: { tripId, status: { in: ['PENDING', 'CONFIRMED'] } },
        select: { id: true, seatId: true, status: true, passengerId: true },
      });
      for (const booking of bookingRows) {
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: 'CANCELLED' },
        });
        await tx.seatInventory.update({
          where: { id: booking.seatId },
          data: { status: 'AVAILABLE' },
        });
      }
      return bookingRows;
    });

    for (const booking of bookings) {
      if (booking.status !== 'CONFIRMED') continue;
      const paid = await prisma.payment.findFirst({
        where: { bookingId: booking.id, status: 'PAID' },
        select: { id: true, amount: true },
      });
      if (!paid) continue;

      const pending = await prisma.refund.findFirst({
        where: { paymentId: paid.id, status: { in: ['REQUESTED', 'APPROVED'] } },
        select: { id: true },
      });
      if (pending) continue;

      try {
        await prisma.refund.create({
          data: {
            paymentId: paid.id,
            amount: Number(paid.amount),
            reason: 'Auto-refund: trip was cancelled by the operator',
            requestedById: booking.passengerId,
          },
        });
      } catch (err) {
        if (this.isUniqueViolation(err)) continue;
        throw err;
      }

      await notificationService.notifyUser(
        booking.passengerId,
        'Refund requested',
        'Your trip was cancelled. A refund for your paid booking has been requested and will be processed shortly.',
        { reference: booking.id, referenceType: 'booking' },
      );
    }

    for (const booking of bookings) {
      await this.invalidateBookingRatings(booking.id);
    }
  }

  private async invalidateBookingRatings(bookingId: string): Promise<void> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { passengerId: true, trip: { select: { id: true, operatorId: true } } },
    });
    if (!booking) return;

    await prisma.rating.deleteMany({
      where: {
        userId: booking.passengerId,
        OR: [
          { entityType: 'TRIP', entityId: booking.trip.id },
          { entityType: 'OPERATOR', entityId: booking.trip.operatorId },
        ],
      },
    });
  }

  // ---- Driver assignment & passenger check-in ----

  async assignDriver(
    tripId: string,
    driverId: string,
    operatorId: string,
  ): Promise<{ id: string }> {
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw AppError.notFound('Trip not found');
    if (trip.operatorId !== operatorId) {
      throw AppError.forbidden('You can only assign drivers to your own trips');
    }

    const driver = await prisma.driverProfile.findUnique({ where: { id: driverId } });
    if (!driver) throw AppError.notFound('Driver not found');
    if (driver.operatorId !== operatorId) {
      throw AppError.forbidden('You can only assign your own drivers');
    }

    await prisma.trip.update({ where: { id: tripId }, data: { driverId } });
    return { id: tripId };
  }

  async checkInPassenger(tripId: string, bookingId: string, actorId: string): Promise<unknown> {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { driver: { select: { userId: true } } },
    });
    if (!trip) throw AppError.notFound('Trip not found');

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { seat: true },
    });
    if (!booking) throw AppError.notFound('Booking not found');
    if (booking.tripId !== tripId) {
      throw AppError.validation('Booking does not belong to this trip');
    }
    if (booking.status !== 'CONFIRMED') {
      throw AppError.conflict(
        `Only confirmed bookings can be checked in (current: ${booking.status})`,
      );
    }

    const isAssignedDriver = trip.driver?.userId === actorId;
    const isOperator = await prisma.trip.findFirst({
      where: { id: tripId, operator: { userId: actorId } },
    });
    if (!isAssignedDriver && !isOperator) {
      throw AppError.forbidden('Only the trip operator or assigned driver can check in passengers');
    }

    await prisma.booking.update({
      where: { id: bookingId },
      data: { checkedInAt: new Date() },
    });
    return { id: bookingId, checkedInAt: new Date(), passengerName: booking.passengerName };
  }

  async getManifest(tripId: string, actorId: string): Promise<unknown> {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        route: { select: { fromCity: true, toCity: true } },
        driver: { select: { id: true, userId: true, user: { select: { fullName: true } } } },
      },
    });
    if (!trip) throw AppError.notFound('Trip not found');

    const isAssignedDriver = trip.driver?.userId === actorId;
    const isOperator = await prisma.trip.findFirst({
      where: { id: tripId, operator: { userId: actorId } },
    });
    if (!isAssignedDriver && !isOperator) {
      throw AppError.forbidden('Only the trip operator or assigned driver can view the manifest');
    }

    const bookings = await prisma.booking.findMany({
      where: { tripId },
      select: {
        id: true,
        passengerName: true,
        passengerPhone: true,
        status: true,
        checkedInAt: true,
        seat: { select: { seatNumber: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      tripId,
      route: `${trip.route.fromCity} → ${trip.route.toCity}`,
      driver: trip.driver?.user.fullName ?? null,
      totalConfirmed: bookings.filter((b) => b.status === 'CONFIRMED').length,
      checkedIn: bookings.filter((b) => b.checkedInAt !== null).length,
      passengers: bookings,
    };
  }

  // ---- Live location ----

  private static readonly LOCATION_TTL_SECONDS = 60 * 60 * 24;
  private static readonly LOCATION_STALE_MS = 15 * 60 * 1000;

  private locationKey(tripId: string): string {
    return `trip:location:${tripId}`;
  }

  async updateTripLocation(
    tripId: string,
    lat: number,
    lng: number,
    driverUserId: string,
  ): Promise<{ tripId: string; lat: number; lng: number; updatedAt: string }> {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { driver: { select: { userId: true } } },
    });
    if (!trip) throw AppError.notFound('Trip not found');
    if (trip.driver?.userId !== driverUserId) {
      throw AppError.forbidden('You can only update the location of your assigned trips');
    }
    if (trip.status !== 'IN_TRANSIT') {
      throw AppError.conflict(
        `Location updates are only allowed while the trip is in transit (current: ${statusToPhrase(trip.status)})`,
      );
    }

    const updatedAt = new Date().toISOString();
    await redis.hset(this.locationKey(tripId), {
      lat: String(lat),
      lng: String(lng),
      updatedAt,
    });
    await redis.expire(this.locationKey(tripId), BusService.LOCATION_TTL_SECONDS);

    emitTripLocation({ tripId, lat, lng, updatedAt });
    return { tripId, lat, lng, updatedAt };
  }

  async getTripLocation(
    tripId: string,
  ): Promise<{ tripId: string; lat?: number; lng?: number; updatedAt?: string; stale: boolean }> {
    const data = await redis.hgetall(this.locationKey(tripId));
    if (!data || Object.keys(data).length === 0) {
      return { tripId, stale: true };
    }
    const lat = Number(data.lat);
    const lng = Number(data.lng);
    const updatedAt = data.updatedAt;
    if (Number.isNaN(lat) || Number.isNaN(lng) || !updatedAt) {
      return { tripId, stale: true };
    }
    const stale = Date.now() - new Date(updatedAt).getTime() > BusService.LOCATION_STALE_MS;
    return { tripId, lat, lng, updatedAt, stale };
  }

  // ---- Driver management ----

  async createDriver(
    data: CreateDriverInput,
    operatorId: string,
    actorRole: Role,
  ): Promise<{ id: string; userId: string }> {
    const { id: userId } = await createUser(
      {
        email: data.email,
        phone: data.phone,
        password: data.password,
        fullName: data.fullName,
        role: 'DRIVER',
      },
      actorRole,
    );

    const driver = await prisma.driverProfile.create({
      data: {
        userId,
        operatorId,
        licenseNumber: data.licenseNumber,
        phone: data.phone,
      },
      select: { id: true, userId: true },
    });
    return driver;
  }

  async updateDriver(
    driverId: string,
    data: UpdateDriverInput,
    operatorId: string,
  ): Promise<unknown> {
    const driver = await prisma.driverProfile.findUnique({
      where: { id: driverId },
      include: { user: true },
    });
    if (!driver) throw AppError.notFound('Driver not found');
    if (driver.operatorId !== operatorId) {
      throw AppError.forbidden('You can only update your own drivers');
    }

    await prisma.$transaction([
      prisma.driverProfile.update({
        where: { id: driverId },
        data: {
          licenseNumber: data.licenseNumber,
          phone: data.phone,
        },
      }),
      prisma.user.update({
        where: { id: driver.userId },
        data: { fullName: data.fullName },
      }),
    ]);

    return this.getDriverDetail(driverId);
  }

  async deactivateDriver(driverId: string, operatorId: string): Promise<void> {
    const driver = await prisma.driverProfile.findUnique({ where: { id: driverId } });
    if (!driver) throw AppError.notFound('Driver not found');
    if (driver.operatorId !== operatorId) {
      throw AppError.forbidden('You can only deactivate your own drivers');
    }

    await prisma.driverProfile.update({
      where: { id: driverId },
      data: { isActive: false },
    });
  }

  private async getDriverDetail(driverId: string): Promise<unknown> {
    return prisma.driverProfile.findUnique({
      where: { id: driverId },
      include: { user: { select: { id: true, fullName: true, email: true, phone: true } } },
    });
  }

  private async createDriverPayout(tripId: string): Promise<void> {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, driverId: true },
    });
    if (!trip?.driverId) return;

    const setting = await prisma.platformSetting.findUnique({
      where: { key: 'driver_trip_fee' },
    });
    const fee = typeof setting?.value === 'number' ? setting.value : env.DRIVER_TRIP_FEE;
    if (fee <= 0) return;

    try {
      await prisma.driverTripPayout.create({
        data: { driverId: trip.driverId, tripId, amount: fee },
      });
      await writeAuditLog({
        action: 'driver_payout.create',
        entity: 'driver_payout',
        details: { tripId, driverId: trip.driverId, amount: fee },
      });
    } catch (err) {
      // One payout per (driver, trip) — a retry of a completed transition is idempotent.
      if (!this.isUniqueViolation(err)) throw err;
    }
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
      const trip = await tx.trip.findUnique({
        where: { id: tripId },
        include: { route: { include: { stops: { orderBy: { order: 'asc' } } } } },
      });
      if (!trip) throw AppError.notFound('Trip not found');
      if (trip.status === 'CANCELLED') {
        throw AppError.conflict('This trip has been cancelled');
      }

      const stops = trip.route.stops;
      let originStop: { id: string; order: number } | undefined;
      let destinationStop: { id: string; order: number } | undefined;
      if (data.originStopId || data.destinationStopId) {
        if (!data.originStopId || !data.destinationStopId) {
          throw AppError.validation('Both origin and destination stops are required');
        }
        originStop = stops.find((s) => s.id === data.originStopId);
        destinationStop = stops.find((s) => s.id === data.destinationStopId);
        if (!originStop || !destinationStop) {
          throw AppError.validation('Stops must belong to the trip route');
        }
        if (originStop.order >= destinationStop.order) {
          throw AppError.validation('Origin stop must come before the destination stop');
        }
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

      const fromOrder = originStop?.order ?? null;
      const toOrder = destinationStop?.order ?? null;
      const overlapping = await this.countOverlappingBookings(tx, locked.id, fromOrder, toOrder);
      if (overlapping > 0) {
        throw new AppError(
          'SEAT_UNAVAILABLE',
          'This seat is not available for the selected segment',
        );
      }

      let baseAmount: number;
      if (fromOrder !== null && toOrder !== null) {
        baseAmount = stops
          .filter((s) => s.order > fromOrder && s.order <= toOrder)
          .reduce((sum, s) => sum + Number(s.segmentPrice), 0);
      } else {
        baseAmount = Number(trip.price);
      }

      const bookingId = crypto.randomUUID();
      let couponCode: string | undefined;
      let discountAmount = 0;
      let finalAmount = baseAmount;
      if (data.couponCode) {
        const coupon = await couponService.redeemCoupon(
          tx,
          data.couponCode,
          passengerId,
          { contextType: 'booking', contextId: bookingId },
          { applicableTo: 'TRIP', amount: baseAmount },
        );
        couponCode = coupon.code;
        discountAmount = coupon.discountAmount;
        finalAmount = coupon.finalAmount;
      }

      const booking = await tx.booking.create({
        data: {
          id: bookingId,
          tripId,
          seatId: locked.id,
          passengerId,
          passengerName: data.passengerName,
          passengerPhone: data.passengerPhone,
          status: 'PENDING',
          totalAmount: finalAmount,
          couponCode,
          discountAmount,
          originStopId: originStop?.id ?? null,
          destinationStopId: destinationStop?.id ?? null,
          originStopOrder: originStop?.order ?? null,
          destinationStopOrder: destinationStop?.order ?? null,
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
        originStop: {
          select: {
            id: true,
            order: true,
            city: true,
            departureOffsetMinutes: true,
            segmentPrice: true,
          },
        },
        destinationStop: {
          select: {
            id: true,
            order: true,
            city: true,
            departureOffsetMinutes: true,
            segmentPrice: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { items };
  }

  async cancelBooking(bookingId: string, userId: string): Promise<{ id: string }> {
    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { trip: { select: { id: true, departureTime: true } } },
      });
      if (!booking) throw AppError.notFound('Booking not found');
      if (booking.passengerId !== userId) {
        throw AppError.forbidden('You can only cancel your own bookings');
      }
      if (booking.status === 'CANCELLED' || booking.status === 'EXPIRED') {
        throw AppError.conflict('Booking has already been cancelled or expired');
      }

      const paid = await tx.payment.findFirst({
        where: { bookingId, status: 'PAID' },
        select: { id: true, amount: true },
      });

      if (!paid) {
        await tx.booking.update({
          where: { id: bookingId },
          data: { status: 'CANCELLED' },
        });
        await this.releaseSeatIfFree(tx, booking.seatId, bookingId);
        return { passengerId: booking.passengerId, refund: null };
      }

      const policy = await this.getCancellationPolicy(tx);
      const hoursToDeparture =
        (new Date(booking.trip.departureTime).getTime() - Date.now()) / (60 * 60 * 1000);
      const withinWindow = hoursToDeparture < policy.cancelBeforeHours;
      const refundPercent = withinWindow ? policy.refundPercent : 100;
      const refundAmount = Number(paid.amount) * (refundPercent / 100);

      await tx.booking.update({
        where: { id: bookingId },
        data: { status: 'CANCELLED' },
      });
      await this.releaseSeatIfFree(tx, booking.seatId, bookingId);

      let refund: { id: string } | null = null;
      if (refundAmount > 0) {
        const existing = await tx.refund.findFirst({
          where: { paymentId: paid.id, status: { in: ['REQUESTED', 'APPROVED'] } },
          select: { id: true },
        });
        if (!existing) {
          refund = await tx.refund.create({
            data: {
              paymentId: paid.id,
              amount: Math.round(refundAmount * 100) / 100,
              reason: withinWindow
                ? `Passenger cancellation within ${policy.cancelBeforeHours}h window (${refundPercent}% refund)`
                : 'Passenger cancellation',
              requestedById: booking.passengerId,
            },
          });
        }
      }

      return { passengerId: booking.passengerId, refund };
    });

    const { passengerId, refund } = result;
    await this.invalidateBookingRatings(bookingId);

    if (refund) {
      await notificationService.notifyUser(
        passengerId,
        'Refund requested',
        'Your booking was cancelled. A refund for the applicable amount has been requested and will be processed shortly.',
        { reference: bookingId, referenceType: 'booking' },
      );
    } else {
      await notificationService.notifyUser(
        passengerId,
        'Booking cancelled',
        `Your booking ${bookingId} has been cancelled and the seat released.`,
        { reference: bookingId, referenceType: 'booking' },
      );
    }

    return { id: bookingId };
  }

  /**
   * Reschedule an unpaid booking to a different trip. Releases the old seat, holds the new
   * one, recomputes the total (new trip price + reschedule fee when inside the policy window)
   * and clears any applied coupon so the discount is not silently carried across trips.
   */
  async rescheduleBooking(
    bookingId: string,
    newTripId: string,
    newSeatNumber: string,
    userId: string,
  ): Promise<{ id: string }> {
    await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { trip: { select: { id: true, departureTime: true } } },
      });
      if (!booking) throw AppError.notFound('Booking not found');
      if (booking.passengerId !== userId) {
        throw AppError.forbidden('You can only reschedule your own bookings');
      }
      if (booking.status === 'CANCELLED' || booking.status === 'EXPIRED') {
        throw AppError.conflict('Booking has already been cancelled or expired');
      }
      if (booking.status !== 'PENDING') {
        throw AppError.conflict(
          'Only unpaid bookings can be rescheduled online. Paid bookings can be cancelled for a refund and rebooked.',
        );
      }
      if (booking.tripId === newTripId) {
        throw AppError.conflict('The booking is already on this trip');
      }

      const newTrip = await tx.trip.findUnique({
        where: { id: newTripId },
        include: { route: { include: { stops: { orderBy: { order: 'asc' } } } } },
      });
      if (!newTrip) throw AppError.notFound('New trip not found');
      if (newTrip.status === 'CANCELLED') {
        throw AppError.conflict('The new trip has been cancelled');
      }

      const newSeat = await tx.$queryRaw<{ id: string; status: string }[]>`
        SELECT id, status FROM "SeatInventory"
        WHERE "tripId" = ${newTripId} AND "seatNumber" = ${newSeatNumber}
        FOR UPDATE
      `;
      const locked = newSeat[0];
      if (!locked) {
        throw AppError.notFound('Seat not found on the new trip');
      }

      const newStops = newTrip.route.stops;
      let originStopId: string | null = null;
      let destinationStopId: string | null = null;
      let fromOrder: number | null = null;
      let toOrder: number | null = null;
      if (booking.originStopId || booking.destinationStopId) {
        const origin = newStops.find((s) => s.id === booking.originStopId);
        const destination = newStops.find((s) => s.id === booking.destinationStopId);
        if (origin && destination && origin.order < destination.order) {
          originStopId = origin.id;
          destinationStopId = destination.id;
          fromOrder = origin.order;
          toOrder = destination.order;
        }
      }

      const overlapping = await this.countOverlappingBookings(tx, locked.id, fromOrder, toOrder);
      if (overlapping > 0) {
        throw new AppError(
          'SEAT_UNAVAILABLE',
          'This seat is not available for the selected segment',
        );
      }

      const policy = await this.getCancellationPolicy(tx);
      const hoursToDeparture =
        (new Date(booking.trip.departureTime).getTime() - Date.now()) / (60 * 60 * 1000);
      const withinWindow = hoursToDeparture < policy.cancelBeforeHours;
      const fee = withinWindow ? policy.rescheduleFee : 0;
      const baseAmount =
        fromOrder !== null && toOrder !== null
          ? newStops
              .filter((s) => s.order > fromOrder && s.order <= toOrder)
              .reduce((sum, s) => sum + Number(s.segmentPrice), 0)
          : Number(newTrip.price);
      const totalAmount = baseAmount + fee;

      await tx.booking.update({
        where: { id: bookingId },
        data: {
          tripId: newTripId,
          seatId: locked.id,
          totalAmount,
          couponCode: null,
          discountAmount: 0,
          originStopId,
          destinationStopId,
          originStopOrder: fromOrder,
          destinationStopOrder: toOrder,
        },
      });
      await this.releaseSeatIfFree(tx, booking.seatId, bookingId);
      await tx.seatInventory.update({
        where: { id: locked.id },
        data: { status: 'HELD' },
      });
    });

    return { id: bookingId };
  }

  // Used by the Notifications expiry worker to release a booking whose payment was never completed.
  async expireBooking(bookingId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const result = await tx.booking.updateMany({
        where: { id: bookingId, status: 'PENDING' },
        data: { status: 'EXPIRED' as BookingStatus },
      });
      if (result.count === 0) return; // not pending — idempotent

      const booking = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!booking) return;
      await this.releaseSeatIfFree(tx, booking.seatId, bookingId);
    });
  }

  // Used by the Payments module to confirm a booking after a successful webhook.
  async confirmBooking(bookingId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const result = await tx.booking.updateMany({
        where: { id: bookingId, status: 'PENDING' },
        data: { status: 'CONFIRMED' as BookingStatus },
      });
      if (result.count === 0) {
        const booking = await tx.booking.findUnique({ where: { id: bookingId } });
        if (!booking) throw AppError.notFound('Booking not found');
        throw AppError.conflict(`Booking is already ${booking.status.toLowerCase()}`);
      }

      const booking = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!booking) throw AppError.notFound('Booking not found');
      await tx.seatInventory.update({
        where: { id: booking.seatId },
        data: { status: 'BOOKED' },
      });
    });
  }

  // Used by the Financial module to cancel a CONFIRMED booking when its payment is refunded.
  async forceCancelBooking(bookingId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!booking) return; // already gone — treat as idempotent
      if (booking.status !== 'CONFIRMED') return; // only cancel confirmed bookings

      await tx.booking.update({
        where: { id: bookingId },
        data: { status: 'CANCELLED' as BookingStatus },
      });
      await this.releaseSeatIfFree(tx, booking.seatId, bookingId);
    });
  }

  private async countOverlappingBookings(
    tx: Prisma.TransactionClient,
    seatId: string,
    fromOrder: number | null,
    toOrder: number | null,
  ): Promise<number> {
    if (fromOrder === null) {
      return tx.booking.count({
        where: { seatId, status: { in: ['PENDING', 'CONFIRMED'] } },
      });
    }
    const f = fromOrder;
    const t = toOrder as number;
    return tx.booking.count({
      where: {
        seatId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        AND: [
          { OR: [{ originStopOrder: null }, { originStopOrder: { lt: t } }] },
          { OR: [{ destinationStopOrder: null }, { destinationStopOrder: { gt: f } }] },
        ],
      },
    });
  }

  private async releaseSeatIfFree(
    tx: Prisma.TransactionClient,
    seatId: string,
    excludeBookingId?: string,
  ): Promise<void> {
    const active = await tx.booking.count({
      where: {
        seatId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      },
    });
    if (active === 0) {
      await tx.seatInventory.update({
        where: { id: seatId },
        data: { status: 'AVAILABLE' },
      });
    }
  }

  private isUniqueViolation(err: unknown): boolean {
    return err instanceof Error && 'code' in err && (err as { code?: string }).code === 'P2002';
  }

  private async getCancellationPolicy(
    client: Prisma.TransactionClient = prisma,
  ): Promise<{ cancelBeforeHours: number; refundPercent: number; rescheduleFee: number }> {
    const setting = await client.platformSetting.findUnique({
      where: { key: 'cancellation_policy' },
    });
    const value = setting?.value;
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      'cancelBeforeHours' in value &&
      'refundPercent' in value &&
      'rescheduleFee' in value
    ) {
      return {
        cancelBeforeHours: Number(value.cancelBeforeHours),
        refundPercent: Number(value.refundPercent),
        rescheduleFee: Number(value.rescheduleFee),
      };
    }
    return { cancelBeforeHours: 24, refundPercent: 50, rescheduleFee: 0 };
  }
}

export const busService = new BusService();
