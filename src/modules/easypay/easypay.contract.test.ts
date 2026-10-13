import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/db/prisma.js';
import { createUser } from '../auth/auth.service.js';

describe('easypay mobile contract', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.rating.deleteMany();
    await prisma.deviceToken.deleteMany();
    await prisma.favorite.deleteMany();
    await prisma.couponUsage.deleteMany();
    await prisma.coupon.deleteMany();
    await prisma.webhookEvent.deleteMany();
    await prisma.reconciliationMismatch.deleteMany();
    await prisma.driverTripPayout.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.dishOption.deleteMany();
    await prisma.dishOptionGroup.deleteMany();
    await prisma.foodOrderItem.deleteMany();
    await prisma.foodOrder.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.seatInventory.deleteMany();
    await prisma.trip.deleteMany();
    await prisma.route.deleteMany();
    await prisma.bus.deleteMany();
    await prisma.operatorProfile.deleteMany();
    await prisma.dish.deleteMany();
    await prisma.vendorOperatingHours.deleteMany();
    await prisma.vendorProfile.deleteMany();
    await prisma.foodCategory.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.otpCode.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
  });

  async function tokenFor(role: string, email: string, phone: string) {
    await createUser(
      { email, phone, password: 'password123', fullName: role, role: role as never },
      'SUPER_ADMIN',
    );
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { identifier: email, password: 'password123' },
    });
    return (login.json() as { accessToken: string }).accessToken;
  }

  async function setupKitchenWithCustomDish() {
    const vu = await createUser(
      {
        email: 'v@t.mw',
        phone: '+265990000011',
        password: 'password123',
        fullName: 'V',
        role: 'VENDOR',
      },
      'SUPER_ADMIN',
    );
    const vendor = await prisma.vendorProfile.update({
      where: { userId: vu.id },
      data: {
        businessName: 'K1',
        latitude: -13.9626,
        longitude: 33.7741,
        deliveryRadiusKm: 5,
        deliveryTime: 20,
        isPaused: false,
      },
    });
    await prisma.vendorOperatingHours.upsert({
      where: { vendorId_dayOfWeek: { vendorId: vendor.id, dayOfWeek: new Date().getDay() } },
      create: {
        vendorId: vendor.id,
        dayOfWeek: new Date().getDay(),
        openTime: '00:00',
        closeTime: '23:59',
        isClosed: false,
      },
      update: { openTime: '00:00', closeTime: '23:59', isClosed: false },
    });
    const cat = await prisma.foodCategory.create({ data: { name: 'Burgers', slug: 'burgers' } });
    const dish = await prisma.dish.create({
      data: { vendorId: vendor.id, categoryId: cat.id, name: 'Deluxe', price: 5000 },
    });
    const group = await prisma.dishOptionGroup.create({
      data: {
        dishId: dish.id,
        name: 'Patty',
        type: 'SINGLE',
        isRequired: true,
        minSelect: 1,
        maxSelect: 1,
      },
    });
    const single = await prisma.dishOption.create({
      data: { groupId: group.id, label: 'Single', priceDelta: 0 },
    });
    const dbl = await prisma.dishOption.create({
      data: { groupId: group.id, label: 'Double', priceDelta: 2500 },
    });
    return { vendor, cat, dish, group, single, dbl };
  }

  it('§1 home selector + geo feed + grouped menu', async () => {
    const { vendor, cat } = await setupKitchenWithCustomDish();
    const cats = await app.inject({ method: 'GET', url: '/kitchens/categories' });
    expect(cats.statusCode).toBe(200);
    expect(cats.json()[0]).toMatchObject({ slug: 'burgers', sort_order: expect.any(Number) });

    const feed = await app.inject({
      method: 'GET',
      url: `/kitchens?lat=-13.9626&lng=33.7741&category=${cat.slug}`,
    });
    expect(feed.statusCode).toBe(200);
    const kitchens = feed.json() as Array<Record<string, unknown>>;
    expect(kitchens.length).toBe(1);
    expect(kitchens[0]).toMatchObject({
      id: vendor.id,
      status: 'OPEN',
      is_open: true,
      distance_km: 0,
    });

    const far = await app.inject({ method: 'GET', url: '/kitchens?lat=0&lng=0' });
    expect(far.statusCode).toBe(200);
    expect((far.json() as unknown[]).length).toBe(0); // hidden out-of-radius

    const bad = await app.inject({ method: 'GET', url: '/kitchens?lat=-13.9' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ status: 'error', error_code: 'VALIDATION_ERROR' });

    const grouped = await app.inject({ method: 'GET', url: `/kitchens/${vendor.id}/menu-grouped` });
    expect(grouped.statusCode).toBe(200);
    expect(grouped.json()).toMatchObject({ groups: expect.any(Array) });
  });

  it('§2 cards + badge + preview math', async () => {
    const { vendor, dish, group, dbl } = await setupKitchenWithCustomDish();
    const menu = await app.inject({ method: 'GET', url: `/kitchens/${vendor.id}/menu` });
    expect(menu.statusCode).toBe(200);
    const cards = menu.json() as Array<Record<string, unknown>>;
    expect(cards[0]).toMatchObject({ id: dish.id, base_price: 5000, locked: false, badge: null });
    const custom = (
      cards[0] as {
        customizations: Array<{ group_id: string; type: string; is_required: boolean }>;
      }
    ).customizations;
    expect(custom[0]).toMatchObject({ group_id: group.id, type: 'SINGLE', is_required: true });

    const student = await tokenFor('STUDENT', 's@t.mw', '+265990000022');
    const missing = await app.inject({
      method: 'POST',
      url: '/orders/food/preview',
      headers: { authorization: `Bearer ${student}` },
      payload: { kitchen_id: vendor.id, items: [{ item_id: dish.id, quantity: 1 }] },
    });
    expect(missing.statusCode).toBe(400);

    const ok = await app.inject({
      method: 'POST',
      url: '/orders/food/preview',
      headers: { authorization: `Bearer ${student}` },
      payload: {
        kitchen_id: vendor.id,
        items: [
          {
            item_id: dish.id,
            quantity: 2,
            selected_options: [{ group_id: group.id, option_ids: [dbl.id] }],
          },
        ],
      },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ total: 15000, is_open: true });

    await prisma.dish.update({ where: { id: dish.id }, data: { isAvailable: false } });
    const oos = await app.inject({ method: 'GET', url: `/kitchens/${vendor.id}/menu` });
    expect((oos.json() as Array<Record<string, unknown>>)[0]).toMatchObject({
      locked: true,
      badge: 'Unavailable Today',
    });
  });

  it('§3 create + tracking status casings', async () => {
    const { vendor, dish, group, single } = await setupKitchenWithCustomDish();
    const studentToken = await tokenFor('STUDENT', 's2@t.mw', '+265990000033');
    const student = await prisma.user.findFirstOrThrow({ where: { phone: '+265990000033' } });
    const op = await createUser(
      {
        email: 'op@t.mw',
        phone: '+265990000044',
        password: 'password123',
        fullName: 'Op',
        role: 'OPERATOR',
      },
      'SUPER_ADMIN',
    );
    const opProfile = await prisma.operatorProfile.findUniqueOrThrow({ where: { userId: op.id } });
    const route = await prisma.route.create({
      data: { fromCity: 'A', toCity: 'B', basePrice: 1000, operatorId: opProfile.id },
    });
    const bus = await prisma.bus.create({
      data: {
        operatorId: opProfile.id,
        name: 'C',
        plateNumber: `P-${Date.now()}`,
        capacity: 4,
        busType: 'STANDARD',
      },
    });
    const trip = await prisma.trip.create({
      data: {
        routeId: route.id,
        busId: bus.id,
        operatorId: opProfile.id,
        departureTime: new Date(Date.now() + 86400000),
        arrivalTime: new Date(Date.now() + 90000000),
        price: 1000,
        status: 'SCHEDULED',
      },
    });
    const seat = await prisma.seatInventory.create({
      data: { tripId: trip.id, seatNumber: 'A1', status: 'AVAILABLE' },
    });
    const booking = await prisma.booking.create({
      data: {
        tripId: trip.id,
        seatId: seat.id,
        passengerId: student.id,
        passengerName: 'S',
        passengerPhone: '+265990000033',
        status: 'CONFIRMED',
        totalAmount: 1000,
      },
    });

    const created = await app.inject({
      method: 'POST',
      url: '/orders/food',
      headers: { authorization: `Bearer ${studentToken}` },
      payload: {
        kitchen_id: vendor.id,
        booking_id: booking.id,
        items: [
          {
            item_id: dish.id,
            quantity: 1,
            selected_options: [{ group_id: group.id, option_ids: [single.id] }],
          },
        ],
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      status: 'pending',
      status_lower: 'pending',
      status_upper: 'PLACED',
    });
    const orderId = (created.json() as { order_id: string }).order_id;

    const track = await app.inject({
      method: 'GET',
      url: `/orders/food/${orderId}/tracking`,
      headers: { authorization: `Bearer ${studentToken}` },
    });
    expect(track.statusCode).toBe(200);
    expect(track.json()).toMatchObject({
      status: 'PLACED',
      status_upper: 'PLACED',
      status_lower: 'placed',
      tracker_message: 'Waiting for restaurant confirmation...',
    });
  });

  it('§4 status endpoint + busy lock envelope', async () => {
    const { vendor, dish, group, single } = await setupKitchenWithCustomDish();
    const st = await app.inject({ method: 'GET', url: `/kitchens/${vendor.id}/status` });
    expect(st.statusCode).toBe(200);
    expect(st.json()).toMatchObject({ id: vendor.id, is_open: true, status: 'OPEN' });

    await prisma.vendorProfile.update({ where: { id: vendor.id }, data: { isPaused: true } });
    const busy = await app.inject({ method: 'GET', url: `/kitchens/${vendor.id}/status` });
    expect(busy.json()).toMatchObject({ status: 'BUSY', is_open: false });

    const studentToken = await tokenFor('STUDENT', 's3@t.mw', '+265990000055');
    const student = await prisma.user.findFirstOrThrow({ where: { phone: '+265990000055' } });
    const op = await createUser(
      {
        email: 'op2@t.mw',
        phone: '+265990000066',
        password: 'password123',
        fullName: 'Op2',
        role: 'OPERATOR',
      },
      'SUPER_ADMIN',
    );
    const opProfile = await prisma.operatorProfile.findUniqueOrThrow({ where: { userId: op.id } });
    const route = await prisma.route.create({
      data: { fromCity: 'A', toCity: 'B', basePrice: 1000, operatorId: opProfile.id },
    });
    const bus = await prisma.bus.create({
      data: {
        operatorId: opProfile.id,
        name: 'C',
        plateNumber: `Q-${Date.now()}`,
        capacity: 4,
        busType: 'STANDARD',
      },
    });
    const trip = await prisma.trip.create({
      data: {
        routeId: route.id,
        busId: bus.id,
        operatorId: opProfile.id,
        departureTime: new Date(Date.now() + 86400000),
        arrivalTime: new Date(Date.now() + 90000000),
        price: 1000,
        status: 'SCHEDULED',
      },
    });
    const seat = await prisma.seatInventory.create({
      data: { tripId: trip.id, seatNumber: 'A1', status: 'AVAILABLE' },
    });
    const booking = await prisma.booking.create({
      data: {
        tripId: trip.id,
        seatId: seat.id,
        passengerId: student.id,
        passengerName: 'S',
        passengerPhone: '+265990000055',
        status: 'CONFIRMED',
        totalAmount: 1000,
      },
    });
    const locked = await app.inject({
      method: 'POST',
      url: '/orders/food',
      headers: { authorization: `Bearer ${studentToken}` },
      payload: {
        kitchen_id: vendor.id,
        booking_id: booking.id,
        items: [
          {
            item_id: dish.id,
            quantity: 1,
            selected_options: [{ group_id: group.id, option_ids: [single.id] }],
          },
        ],
      },
    });
    expect(locked.statusCode).toBe(409);
    expect(locked.json()).toMatchObject({ status: 'error', error_code: 'CONFLICT' });
  });

  it('§5 out-of-radius guard', async () => {
    const { vendor, dish, group, single } = await setupKitchenWithCustomDish();
    const studentToken = await tokenFor('STUDENT', 's4@t.mw', '+265990000077');
    const student = await prisma.user.findFirstOrThrow({ where: { phone: '+265990000077' } });
    const op = await createUser(
      {
        email: 'op3@t.mw',
        phone: '+265990000088',
        password: 'password123',
        fullName: 'Op3',
        role: 'OPERATOR',
      },
      'SUPER_ADMIN',
    );
    const opProfile = await prisma.operatorProfile.findUniqueOrThrow({ where: { userId: op.id } });
    const route = await prisma.route.create({
      data: { fromCity: 'A', toCity: 'B', basePrice: 1000, operatorId: opProfile.id },
    });
    const bus = await prisma.bus.create({
      data: {
        operatorId: opProfile.id,
        name: 'C',
        plateNumber: `R-${Date.now()}`,
        capacity: 4,
        busType: 'STANDARD',
      },
    });
    const trip = await prisma.trip.create({
      data: {
        routeId: route.id,
        busId: bus.id,
        operatorId: opProfile.id,
        departureTime: new Date(Date.now() + 86400000),
        arrivalTime: new Date(Date.now() + 90000000),
        price: 1000,
        status: 'SCHEDULED',
      },
    });
    const seat = await prisma.seatInventory.create({
      data: { tripId: trip.id, seatNumber: 'A1', status: 'AVAILABLE' },
    });
    const booking = await prisma.booking.create({
      data: {
        tripId: trip.id,
        seatId: seat.id,
        passengerId: student.id,
        passengerName: 'S',
        passengerPhone: '+265990000077',
        status: 'CONFIRMED',
        totalAmount: 1000,
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/orders/food',
      headers: { authorization: `Bearer ${studentToken}` },
      payload: {
        kitchen_id: vendor.id,
        booking_id: booking.id,
        delivery_lat: 0,
        delivery_lng: 0,
        items: [
          {
            item_id: dish.id,
            quantity: 1,
            selected_options: [{ group_id: group.id, option_ids: [single.id] }],
          },
        ],
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ status: 'error' });
  });
});
