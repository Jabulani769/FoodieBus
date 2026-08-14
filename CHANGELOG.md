# Changelog

All notable changes to FoodieBus will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Test infrastructure**: isolated test database so tests never touch the dev database.
  - `.env.test` (committed) with test-only env — `DATABASE_URL` points at `foodiebus_test`.
  - `vitest.setup.ts` loads `.env.test` before any module imports.
  - `vitest.global-setup.ts` auto-creates the test DB if missing and runs `prisma migrate deploy` before the suite.
  - `npm run db:test:setup` for manual test-DB setup/migration.
  - Result: `npm test` wipes only `foodiebus_test`; the dev DB (and the bootstrapped super admin) stay intact.

- **Bus module (module 3)**:
  - Models: `OperatorProfile` (one per OPERATOR user, auto-created on role assignment), `Bus` (operator-owned, unique plate number, capacity 1–200, type STANDARD/VIP/EXECUTIVE), `Route` (simple `fromCity` → `toCity`, unique pair, base price MWK), `Trip` (operator schedules a bus on a route with departure/arrival and price), `SeatInventory` (one row per seat per trip, auto-generated from bus capacity as `"1".."N"`), `Booking` (passenger reservation tied to a seat).
  - **Seat locking**: `createBooking` runs inside a transaction with `SELECT ... FOR UPDATE` on the seat row, so two concurrent requests cannot book the same seat (double-booking → `409 SEAT_UNAVAILABLE`). `@@unique([tripId, seatNumber])` is a second DB-level backstop.
  - Booking lifecycle: `PENDING` (seat `HELD`) → `CONFIRMED` (seat `BOOKED`, flipped by the Payments module via `confirmBooking` on webhook) → `CANCELLED` (seat released back to `AVAILABLE`); `EXPIRED` reserved for failed payments.
  - Public endpoints: `GET /operators` (paginated), `GET /operators/:id`, `GET /operators/:operatorId/buses`, `GET /bus-routes`, `GET /trips/search` (fromCity/toCity/date filters, shows live seat availability), `GET /trips/:id` (seat map).
  - Admin endpoints: `POST/PATCH /bus-routes` (admin/super admin); `DELETE /bus-routes/:id` (super admin).
  - Operator endpoints (own data only): `GET/PATCH /operators/me/profile`, `POST /buses`, `PATCH /buses/:id`, `DELETE /buses/:id` (own; super admin may delete any), `POST /trips`, `PATCH /trips/:id`, `PATCH /trips/:id/status`, `DELETE /trips/:id` (own; super admin may delete any).
  - Passenger endpoints (any authenticated role): `POST /bookings`, `GET /bookings/me`, `POST /bookings/:id/cancel`.
  - Ownership guards at the service layer: an operator cannot schedule trips with another operator's bus, update/delete another operator's bus or trip (`403`); a passenger can only cancel their own booking (`403`).
  - **Auto-create `OperatorProfile`** when a user is assigned the `OPERATOR` role (via `createUser` or `PATCH /users/:id`).
  - Delete protections: a bus or route with trips → `409`; a trip with bookings → `409`.
  - All bus mutations are audit-logged.
  - 38 integration tests (happy paths + RBAC/ownership denials, duplicate plate 409, seat locking, booking lifecycle, cancellation releasing seats).
  - Prisma schema: `OperatorProfile`, `Bus`, `Route`, `Trip`, `SeatInventory`, `Booking` models + `BusType`/`TripStatus`/`SeatStatus`/`BookingStatus` enums + migration `bus_module`.

- **Food module (module 2)**:
  - Models: `FoodCategory` (platform-wide, admin-managed), `VendorProfile` (one per VENDOR user, auto-created on role assignment), `Dish` (belongs to a vendor + category, price in MWK).
  - Dish availability: `isAvailable` boolean + optional `availableFrom` / `availableTo` time window.
  - Public read endpoints: `GET /categories`, `GET /vendors` (paginated), `GET /vendors/:id`, `GET /vendors/:vendorId/dishes` (paginated + filters), `GET /dishes/:id`.
  - Admin endpoints: `POST /categories`, `PATCH /categories/:id` (admin/super admin); `DELETE /categories/:id` (super admin only).
  - Vendor endpoints (own data only): `GET/PATCH /vendors/me/profile`, `POST /dishes`, `PATCH /dishes/:id`, `PATCH /dishes/:id/availability`, `DELETE /dishes/:id` (own dish; super admin may delete any).
  - Ownership guard at the service layer: a vendor cannot mutate another vendor's dishes (`403`).
  - **Auto-create `VendorProfile`** when a user is assigned the `VENDOR` role (via `createUser` or `PATCH /users/:id`).
  - Category delete is blocked (`409`) while dishes still reference the category; duplicate category name/slug → `409`.
  - All food mutations are audit-logged.
  - 29 integration tests (happy paths + failure paths: RBAC denials, ownership denials, 404s, 409s, availability toggling/windows).
  - Prisma schema: `FoodCategory`, `VendorProfile`, `Dish` models + migration `food_module`.

### Assumptions / flags

- **Seat naming auto-generated** from bus capacity (`"1".."N"`); no explicit seat-map layouts for now.
- **Direct routes only** — no intermediate stops for now (a future `TripStop` model can extend this).
- **Booking hold model**: bookings start `PENDING` and hold the seat until the Payments module confirms (via webhook) or a future expiry job releases `EXPIRED` holds.
- **Dish images stubbed** as a `imageUrl` string field; S3/R2 upload wiring deferred to a later upload/notifications step.
- **No soft deletes** for dishes/categories (hard delete), per the agreed plan.
- `VendorProfile.businessName` defaults to the user's `fullName` on auto-creation; vendors update it via `PATCH /vendors/me/profile`.
- Integration tests wipe the dev database (they `deleteMany` users) — re-run `npm run bootstrap:super-admin` after `npm test` if you need the dev super admin back.

- **Auth & RBAC (module 1)**:
  - JWT access + refresh tokens; refresh tokens stored **hashed (SHA-256)** in DB, **rotated on use** with reuse detection (reuse of a revoked token revokes the token family).
  - Login by **email or phone**, argon2 password hashing.
  - RBAC deny-by-default: `authenticate` + `authorize(...roles)` preHandlers; routes declare allowed roles.
  - Endpoints: `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`; admin-only `POST /users`, `GET /users` (paginated), `PATCH /users/:id` (role/status — super admin only).
  - **Admin-only registration**: no public self-registration; super admin creates users and assigns roles. A `SUPER_ADMIN` cannot be demoted by another admin; only the target user themselves (or another super admin) can change their role.
  - Audit log table; `auth.login` and all `user.create` / `user.update` actions are logged with actor, IP, and timestamp.
  - Bootstrap script `npm run bootstrap:super-admin` to create the initial super admin from env vars.
  - 21 integration tests covering happy paths and failure paths (invalid creds, deactivated user, RBAC denials, token rotation, reuse detection, logout).
  - Prisma schema: `RefreshToken`, `AuditLog` models + migration `auth_refresh_audit`.

### Fixed

- **Refresh token collision**: two refresh tokens issued to the same user within one second produced identical JWTs (same `sub`/`iat`), violating the unique `tokenHash` constraint. Added a unique `jti` (UUID) claim to every refresh token.

### Assumptions / flags

- **Admin-only registration** per your decision; the Admin module (module 6) will add richer user/staff management and platform settings on top.
- **No email** — password reset and invites deferred; SMS/WhatsApp handled in the Notifications module.
- `argon2` ships its own TypeScript types; removed the conflicting `@types/argon2`.
- Initial super admin is created via a bootstrap script, **not** a migration/seed (so credentials never end up in the repo or migration history).

- **Project scaffolding (Phase 0)** — project skeleton for the FoodieBus backend:
  - Trunk-based git workflow on `main` with Conventional Commits enforced via commitlint + husky.
  - TypeScript strict-mode config with Node native subpath imports (`#/*`).
  - ESLint (flat config) + Prettier formatting with lint-staged pre-commit hooks.
  - Docker Compose for local Postgres 16 + Redis 7; production `Dockerfile` and dev `Dockerfile.dev`.
  - GitHub Actions CI: typecheck, lint, format check, Prisma migrations, tests, and build on every push/PR to `main`.
  - `src/shared/` layer: Zod-validated env config (fail-fast), Prisma client singleton (driver adapter), Redis client, Pino logger with redaction, AppError + consistent error handler, and Fastify type augmentation.
  - Fastify app factory (`src/app.ts`) with CORS, Swagger/OpenAPI at `/docs`, and global error handler.
  - Health endpoint `GET /api/v1/health` with live DB + Redis checks.
  - Initial Prisma schema: `User` model with `Role` enum, first migration applied.
  - `.env.example` covering all required environment variables.

### Assumptions / flags

- **Deployment target not decided yet.** Dockerfile + CI are deploy-ready but the deploy step is a placeholder to be wired when the host is chosen.
- **Node engines pinned to `>=22`** (LTS at the time of setup).
- **Redis installed locally** was required for verification; the repo uses Docker Compose for infrastructure by default.

## [0.1.0] - 2026-08-14

Initial scaffold.
