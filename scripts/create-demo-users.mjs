#!/usr/bin/env node
/**
 * Create demo role users with known passwords via the public API.
 *
 * Uses the super-admin account to call POST /api/v1/users — the same endpoint
 * the admin dashboard "Users" tab calls. Idempotent: existing emails are skipped.
 *
 * Usage:
 *   node scripts/create-demo-users.mjs                     # defaults to localhost:8080
 *   BASE_URL=http://localhost:8080/api/v1 node scripts/create-demo-users.mjs
 */
const BASE = (process.env.BASE_URL ?? 'http://localhost:8080/api/v1').replace(/\/$/, '');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@foodiebus.mw';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'superadmin_dev_pass_123';

const USERS = [
  { email: 'operator@foodiebus.mw', phone: '+265991111001', password: 'operator123', fullName: 'Northern Coaches', role: 'OPERATOR' },
  { email: 'vendor@foodiebus.mw', phone: '+265991111002', password: 'vendor123', fullName: 'Chimwemwe Kitchen', role: 'VENDOR' },
  { email: 'financial@foodiebus.mw', phone: '+265991111003', password: 'financial123', fullName: 'Finance Team', role: 'FINANCIAL' },
  { email: 'admin2@foodiebus.mw', phone: '+265991111004', password: 'admin123', fullName: 'Ops Admin', role: 'ADMIN' },
  { email: 'student@foodiebus.mw', phone: '+265991111005', password: 'student123', fullName: 'Demo Student', role: 'STUDENT' },
];

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) {
    console.error(`Login as ${ADMIN_EMAIL} failed (${res.status}). Is the API up?`);
    process.exit(1);
  }
  return (await res.json()).accessToken;
}

async function createUser(token, user) {
  const res = await fetch(`${BASE}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(user),
  });
  if (res.status === 201) return `created`;
  if (res.status === 409) return `already exists (password unknown — keep or use a different email)`;
  const body = await res.json().catch(() => ({}));
  console.error(`  FAILED ${user.email} (${res.status}): ${JSON.stringify(body)}`);
  process.exit(1);
}

const token = await login();
console.log(`Logged in as ${ADMIN_EMAIL}`);
for (const u of USERS) {
  const status = await createUser(token, u);
  console.log(`  ${u.role.padEnd(9)} ${u.email}  ${u.password}  -> ${status}`);
}
console.log('\nDone. Use any of these on the matching dashboard.');
