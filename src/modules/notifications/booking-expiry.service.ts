import { prisma } from '../../shared/db/prisma.js';
import { env } from '../../shared/config/env.js';
import { busService } from '../bus/bus.service.js';
import { notificationService } from './notification.service.js';

export async function expireStaleBookings(): Promise<number> {
  const cutoff = new Date(Date.now() - env.BOOKING_HOLD_MINUTES * 60 * 1000);
  const stale = await prisma.booking.findMany({
    where: {
      status: 'PENDING',
      createdAt: { lt: cutoff },
    },
    select: {
      id: true,
      passengerId: true,
      passengerName: true,
      trip: {
        select: {
          route: { select: { fromCity: true, toCity: true } },
          departureTime: true,
        },
      },
      seat: { select: { seatNumber: true } },
    },
  });

  let expired = 0;
  for (const booking of stale) {
    await busService.expireBooking(booking.id);
    expired += 1;
    await notificationService.notifyUser(
      booking.passengerId,
      'Booking expired',
      `Your booking ${booking.passengerName} for ${booking.trip.route.fromCity} → ${booking.trip.route.toCity} (seat ${booking.seat.seatNumber}, ${booking.trip.departureTime.toISOString()}) was not paid in time and has been cancelled. Please book again.`,
      { reference: booking.id, referenceType: 'booking' },
    );
  }

  return expired;
}
