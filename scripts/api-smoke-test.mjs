#!/usr/bin/env node
/**
 * API smoke test — verifies the backend endpoints the dashboards call,
 * end to end, using plain fetch (no app, no framework).
 *
 * Runs against a live API and reports PASS/FAIL per step, exiting non-zero
 * if anything fails. It is a "happy path" check for data round-tripping:
 * create -> read -> verify, matching what the admin/vendor/financial UIs do.
 *
 * Usage:
 *   node scripts/api-smoke-test.mjs
 *   BASE_URL=http://localhost:8080/api/v1 node scripts/api-smoke-test.mjs
 */
const BASE = (process.env.BASE_URL ?? 'http://localhost:8080/api/v1').replace(/\/$/, '');

let passed = 0;
let failed = 0;
function step(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

const now = Date.now();
const suffix = Math.random().toString(36).slice(2, 6);
const studentEmail = `smoke-student-${suffix}@foodiebus.mw`;
const operatorEmail = `smoke-operator-${suffix}@foodiebus.mw`;

console.log(`Smoke testing ${BASE}\n`);

// ---- 1. Auth ----
const adminLogin = await api('POST', '/auth/login', {
  body: { identifier: 'admin@foodiebus.mw', password: 'superadmin_dev_pass_123' },
});
step('admin login', adminLogin.status === 200 && !!adminLogin.json?.accessToken, 'POST /auth/login');
const adminToken = adminLogin.json?.accessToken;

const health = await api('GET', '/health');
step('health (db+redis ok)', health.status === 200 && health.json?.checks?.database === 'ok', JSON.stringify(health.json?.checks));

// ---- 2. User creation + role login (admin dashboard "Users" flow) ----
const mkUser = (email, phone, role, fullName) => ({
  email,
  phone,
  password: 'smokeTest123',
  fullName,
  role,
});
const createdStudent = await api('POST', '/users', {
  token: adminToken,
  body: mkUser(studentEmail, `+26599${Math.floor(100000 + Math.random() * 900000)}`, 'STUDENT', 'Smoke Student'),
});
step('create student user', createdStudent.status === 201, `POST /users (${studentEmail})`);

const createdOperator = await api('POST', '/users', {
  token: adminToken,
  body: mkUser(operatorEmail, `+26599${Math.floor(100000 + Math.random() * 900000)}`, 'OPERATOR', 'Smoke Operator'),
});
step('create operator user', createdOperator.status === 201, `POST /users (${operatorEmail})`);

const studentLogin = await api('POST', '/auth/login', { body: { identifier: studentEmail, password: 'smokeTest123' } });
const operatorLogin = await api('POST', '/auth/login', { body: { identifier: operatorEmail, password: 'smokeTest123' } });
step('student login', studentLogin.status === 200 && !!studentLogin.json?.accessToken, 'POST /auth/login');
step('operator login', operatorLogin.status === 200 && !!operatorLogin.json?.accessToken, 'POST /auth/login');

const studentToken = studentLogin.json?.accessToken;
const operatorToken = operatorLogin.json?.accessToken;

// ---- 3. Platform settings (admin dashboard "Settings" flow) ----
const settingsBefore = await api('GET', '/admin/settings', { token: adminToken });
step('list settings', settingsBefore.status === 200 && Array.isArray(settingsBefore.json), 'GET /admin/settings');
const setPolicy = await api('PUT', '/admin/settings/cancellation_policy', {
  token: adminToken,
  body: { value: { cancelBeforeHours: 24, refundPercent: 50, rescheduleFee: 5000 } },
});
step('upsert cancellation_policy', setPolicy.status === 200, 'PUT /admin/settings/cancellation_policy');

// ---- 4. Operator data (vendor dashboard "Buses" + "Trips" flow) ----
const operatorMe = await api('GET', '/operators/me/profile', { token: operatorToken });
const operatorId = operatorMe.json?.id;
step('operator profile', operatorMe.status === 200 && !!operatorId, 'GET /operators/me/profile');

const bus = await api('POST', '/buses', {
  token: operatorToken,
  body: { name: 'Smoke Coach', plateNumber: `SMK-${suffix.toUpperCase()}`, capacity: 40, busType: 'STANDARD' },
});
step('create bus', bus.status === 201, `POST /buses (${operatorId})`);
const busId = bus.json?.id;

const route = await api('POST', '/bus-routes', {
  token: adminToken,
  body: { fromCity: `North${suffix}`, toCity: `South${suffix}`, basePrice: 15000, distanceKm: 300 },
});
step('create route', route.status === 201, `POST /bus-routes (${route.json?.id})`);
const routeId = route.json?.id;

const trip = await api('POST', '/trips', {
  token: operatorToken,
  body: {
    routeId,
    busId,
    departureTime: new Date(now + 3 * 86400000).toISOString(),
    arrivalTime: new Date(now + 3 * 86400000 + 4 * 3600000).toISOString(),
    price: 18000,
  },
});
step('create trip', trip.status === 201, `POST /trips (${trip.json?.id})`);
const tripId = trip.json?.id;

const tripDetail = await api('GET', `/trips/${tripId}`);
step('trip detail has seats', tripDetail.status === 200 && Array.isArray(tripDetail.json?.seats), 'GET /trips/:id (seat map)');

// ---- 5. Multi-stop route (Phase 5.3) ----
const stops = await api('PUT', `/bus-routes/${routeId}/stops`, {
  token: adminToken,
  body: {
    stops: [
      { city: `North${suffix}`, departureOffsetMinutes: 0, segmentPrice: 0 },
      { city: `Middle${suffix}`, departureOffsetMinutes: 150, segmentPrice: 4000 },
      { city: `South${suffix}`, departureOffsetMinutes: 300, segmentPrice: 11000 },
    ],
  },
});
step('set route stops', stops.status === 200, 'PUT /bus-routes/:id/stops');

const searched = await api('GET', `/trips/search?fromCity=Middle${suffix}&toCity=South${suffix}&date=${new Date(now + 3 * 86400000).toISOString().slice(0, 10)}`);
step('search trip by intermediate stop', searched.status === 200 && searched.json?.items?.some((t) => t.id === tripId), 'GET /trips/search (multi-stop)');

// ---- 6. Booking + segment pricing (customer flow) ----
const routeStops = await api('GET', '/bus-routes');
const foundRoute = routeStops.json?.items?.find((r) => r.id === routeId);
const middle = foundRoute?.stops?.find((s) => s.city === `Middle${suffix}`);
const south = foundRoute?.stops?.find((s) => s.city === `South${suffix}`);
step('route lists stops', !!middle && !!south, 'GET /bus-routes (stops exposed)');

const booking = await api('POST', '/bookings', {
  token: studentToken,
  body: {
    tripId,
    seatNumber: '1',
    passengerName: 'Smoke Student',
    passengerPhone: '+265991234567',
    ...(middle && south ? { originStopId: middle.id, destinationStopId: south.id } : {}),
  },
});
step('create segment booking', booking.status === 201, `POST /bookings (${booking.json?.id})`);
const bookingId = booking.json?.id;

const myBookings = await api('GET', '/bookings/me', { token: studentToken });
const roundTripped = myBookings.json?.items?.find((b) => b.id === bookingId);
step('booking round-trips to /bookings/me', !!roundTripped, `GET /bookings/me (total=${roundTripped?.totalAmount})`);
step('segment pricing applied (Middle->South = 11000)', roundTripped?.totalAmount === '11000', `totalAmount=${roundTripped?.totalAmount}`);

// ---- 7. Coupon (Phase 5.1) ----
const coupon = await api('POST', '/coupons', {
  token: adminToken,
  body: {
    code: `SMK${suffix.toUpperCase()}`,
    type: 'PERCENT',
    value: 10,
    maxUses: 100,
    perUserUses: 1,
    validFrom: new Date(now - 86400000).toISOString(),
    validTo: new Date(now + 30 * 86400000).toISOString(),
    applicableTo: 'TRIP',
  },
});
step('create coupon', coupon.status === 201, `POST /coupons (${coupon.json?.id})`);
const couponCode = coupon.json?.code ?? `SMK${suffix.toUpperCase()}`;
const validate = await api('GET', `/coupons/${couponCode}/validate`);
step('validate coupon', validate.status === 200, `GET /coupons/:code/validate (${couponCode})`);

// ---- 8. Favorites (Phase 5.5) ----
const vendorEmail = `smoke-vendor-${suffix}@foodiebus.mw`;
await api('POST', '/users', {
  token: adminToken,
  body: mkUser(vendorEmail, `+26599${Math.floor(100000 + Math.random() * 900000)}`, 'VENDOR', 'Smoke Vendor'),
});
const vendorLogin = await api('POST', '/auth/login', { body: { identifier: vendorEmail, password: 'smokeTest123' } });
const vendorToken = vendorLogin.json?.accessToken;
const vendorMe = await api('GET', '/vendors/me/profile', { token: vendorToken });
const vendorId = vendorMe.json?.id;
step('vendor profile', vendorMe.status === 200 && !!vendorId, 'GET /vendors/me/profile');

const fav = await api('POST', '/favorites', {
  token: studentToken,
  body: { vendorId },
});
step('add favorite', fav.status === 201 || fav.status === 200, 'POST /favorites');
const favs = await api('GET', '/favorites', { token: studentToken });
step('favorites round-trip', favs.status === 200 && Array.isArray(favs.json?.items) && favs.json.items.some((i) => i.vendorId === vendorId), 'GET /favorites');
const topFavs = await api('GET', '/favorites/top');
step('top favorites', topFavs.status === 200 && Array.isArray(topFavs.json?.topVendors), 'GET /favorites/top');

// ---- 9. Device tokens (Phase 5.4) ----
const device = await api('POST', '/notifications/devices', {
  token: studentToken,
  body: { token: `smoke-fcm-${suffix}`, platform: 'ANDROID' },
});
step('register device token', device.status === 201, 'POST /notifications/devices');

// ---- 10. Audit trail ----
const audit = await api('GET', '/admin/audit-logs', { token: adminToken });
step('audit logs readable', audit.status === 200, `GET /admin/audit-logs (${audit.json?.items?.length ?? 0} entries)`);

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);