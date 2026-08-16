#!/usr/bin/env node
/**
 * Load test harness for FoodieBus hot paths.
 *
 * Usage:
 *   node ops/load/loadtest.mjs                    # uses BASE_URL=http://localhost:8080/api/v1
 *   BASE_URL=http://localhost:8080/api/v1 node ops/load/loadtest.mjs
 *   AUTH_TOKEN=... node ops/load/loadtest.mjs     # reuse an existing bearer token
 *
 * Scenarios exercised:
 *   1. trip-search    GET  /trips/search?fromCity=..&toCity=..&date=..
 *   2. booking        POST /bookings   (creates a PENDING booking; requires auth)
 *   3. food-order     POST /food-orders (requires an auth token with a confirmed booking)
 *   4. webhook        POST /webhooks/paychangu (payment provider callback path)
 *
 * Each scenario distributes requests across synthetic client IPs (via
 * x-forwarded-for) so the per-IP rate limiter does not throttle the harness.
 * Without auth, the POST scenarios exercise serialization/validation overhead
 * and return 4xx; set AUTH_TOKEN + the *_ID env vars for happy-path runs.
 *
 * Exit code 0 if all scenarios complete; non-zero on harness failure.
 */
import autocannon from 'autocannon';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8080/api/v1';
const AUTH_TOKEN = process.env.AUTH_TOKEN ?? '';
const DURATION = Number(process.env.DURATION ?? 5); // seconds
const CONN = Number(process.env.CONCURRENCY ?? 10);

const authHeaders = AUTH_TOKEN ? { authorization: `Bearer ${AUTH_TOKEN}` } : {};

let ipCounter = 0;
function setupClient(client) {
  client.setHeaders({ 'x-forwarded-for': `10.${(ipCounter % 254) + 1}.0.1` });
  ipCounter += 1;
}

function scenario(name, opts) {
  return {
    name,
    url: BASE_URL + opts.url,
    method: opts.method ?? 'GET',
    headers: { ...authHeaders, ...(opts.headers ?? {}) },
    body: opts.body,
    duration: DURATION,
    connections: CONN,
    setupClient,
  };
}

const scenarios = [
  scenario('trip-search', {
    url: '/trips/search?fromCity=Lilongwe&toCity=Blantyre&date=2026-09-01',
  }),
  scenario('booking', {
    url: '/bookings',
    method: 'POST',
    body: JSON.stringify({
      tripId: process.env.TRIP_ID ?? '',
      seatNumber: '1A',
      passengerName: 'Load Test',
      passengerPhone: '+265999999999',
    }),
  }),
  scenario('food-order', {
    url: '/food-orders',
    method: 'POST',
    body: JSON.stringify({
      bookingId: process.env.BOOKING_ID ?? '',
      items: [{ dishId: process.env.DISH_ID ?? '', quantity: 1 }],
    }),
  }),
  scenario('webhook', {
    url: '/webhooks/paychangu',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      txRef: process.env.TXREF ?? '',
      status: 'completed',
      amount: '1000',
    }),
  }),
];

function runScenario(cfg) {
  return new Promise((resolve, reject) => {
    autocannon(cfg, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

async function run() {
  const results = [];
  for (const cfg of scenarios) {
    process.stdout.write(`\n→ ${cfg.name} (${cfg.connections} connections, ${cfg.duration}s)\n`);
    const res = await runScenario(cfg);
    results.push({ name: cfg.name, result: res });
  }

  console.log('\n=== SUMMARY ===');
  for (const { name, result } of results) {
    const errors = result.errors + result.timeouts;
    const status = errors === 0 ? 'PASS' : 'WARN';
    const latency = result.latency?.p95 ?? 0;
    console.log(
      `[${status}] ${name.padEnd(14)} reqs=${String(result.requests.total).padStart(6)} ` +
        `rps=${result.requests.average.toFixed(1).padStart(7)} ` +
        `p95=${latency.toFixed(0)}ms ` +
        `errors=${errors}`,
    );
  }
}

run().catch((err) => {
  console.error('Load test harness failed:', err.message);
  process.exit(1);
});
