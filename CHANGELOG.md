# Changelog

All notable changes to FoodieBus will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Delivery module (module 9)** — food ordering, driver management, and trip fulfillment with real-time updates.
  - **Driver management**: `DRIVER` role + new `DriverProfile` model. `POST /drivers` (operator) registers a driver (creates the user with the `DRIVER` role and the profile); `GET /drivers/me` lists own drivers; `PATCH /drivers/:id` updates a driver; `DELETE /drivers/:id` deactivates. Operators can only manage their own drivers.
  - **Trip fulfillment**: `PATCH /trips/:id/status` is now a strict state machine (`SCHEDULED → BOARDING → IN_TRANSIT → COMPLETED`, `CANCELLED` from any non-completed state) — operators update their own trips, assigned drivers their assigned trips; illegal transitions return `409`. Cancelling a trip cancels PENDING/CONFIRMED bookings and releases seats; each status change notifies passengers. `POST /trips/:id/assign-driver` (operator) assigns a driver; `POST /trips/:id/check-in` (operator/driver) records `checkedInAt` on a booking; `GET /trips/:id/manifest` returns the passenger manifest with driver, route, and check-in state.
  - **Food ordering**: new `FoodOrder` + `FoodOrderItem` models and `FoodOrderStatus` enum (`PLACED → PREPARING → READY → DELIVERED_TO_BUS`, one step at a time, `CANCELLED` allowed). `POST /food-orders` places an order against a confirmed booking (all items must come from the same vendor, dishes must be available, total auto-calculated); `GET /food-orders/me` and `GET /food-orders/:id` (own orders only); `PATCH /food-orders/:id/status` (vendor); `GET /vendors/:vendorId/orders` (vendor's own orders, status-filtered, paginated).
  - **Real-time**: Socket.io attached to the HTTP server (`src/realtime`) with JWT auth and per-user rooms; `emitTripStatus` broadcasts trip status to `trip:{id}` subscribers and `emitFoodOrderStatus` pushes order updates to the passenger's room.
  - Schema: `DriverProfile`, `FoodOrder`, `FoodOrderItem` models; `DRIVER` role, `FoodOrderStatus` enum, `checkedInAt` on `Booking`, `driverId` on `Trip` (migration `delivery_module`).
  - 13 delivery tests + updated bus tests for the state machine; test teardowns now clear food orders before bookings (FK ordering).

- **Analytics module (module 8)** — read-only business-intelligence endpoints under `/api/v1/analytics` (ADMIN, FINANCIAL, or SUPER_ADMIN). No new schema; everything is derived from existing data.
  - **Platform overview**: `GET /analytics/platform/overview` — new users, bookings, revenue, paid payments, new operators, new vendors for a range with an automatic same-duration previous period and `changePercent` per metric; `GET /analytics/platform/growth` — time-series of users/bookings/revenue at daily/weekly/monthly granularity (in-memory bucketing, no `DATE_TRUNC` dependency).
  - **Seat utilization**: `GET /analytics/utilization/trips` (per trip, optional `routeId`/`operatorId` filters), `/routes` and `/operators` (aggregated capacity/booked/utilization).
  - **Conversion funnels**: `GET /analytics/funnel/bookings` (PENDING/CONFIRMED/CANCELLED/EXPIRED + conversion/cancellation/expiry rates), `/payments` (PENDING/PAID/FAILED/REFUNDED + success/failure/refund rates).
  - **Passengers**: `GET /analytics/passengers/overview` (unique passengers, repeat rate, avg bookings per passenger, top route) and `/top` (sorted by bookings or spend).
  - **Notifications**: `GET /analytics/notifications/delivery-rate` (per-channel sent/delivered/failed + rate) and `/failures` (failure-reason distribution).
  - **Refunds**: `GET /analytics/refunds/summary` (requests by status, approval rate, refund rate vs paid revenue, total refunded).
  - 17 integration tests.

- **Financial module (module 7)**:
  - **Refund lifecycle**: `POST /financial/refunds` (financial/super admin) requests a refund against a PAID payment (amount ≤ refundable balance, reason required); `GET /financial/refunds` lists with status/date filters; `GET /financial/refunds/:id` shows payment + booking + actors; `PATCH /financial/refunds/:id/approve` and `/reject` (super admin); `POST /financial/refunds/:id/process` calls the PayChangu refund API, then flips the payment to `REFUNDED`, cancels the booking via the new `busService.forceCancelBooking`, releases the seat, and notifies the passenger. Gateway failures leave the refund `FAILED` with the reason.
  - **Revenue reports**: `GET /financial/reports/revenue` (daily breakdown + totals + refunded amount), `GET /financial/reports/revenue/by-route` and `/by-operator` (grouped sums), and `GET /financial/reports/payments/export` returning a `text/csv` download of all paid payments in a range.
  - **Settlements**: `POST /financial/settlements/generate` (super admin) computes each operator's gross paid revenue for a `YYYY-MM` period, applies the commission rate (from `PlatformSetting commission_rate`, else `COMMISSION_RATE` env, default 10%), and snapshots gross/commission/net per operator — idempotent per `(operatorId, period)` unique constraint. `GET /financial/settlements` lists with operator/vendor/period/status filters; `PATCH /financial/settlements/:id/pay` marks a settlement paid.
  - All financial mutations audit-logged (`financial.refund_*`, `financial.settlement_*`). New `Refund` and `Settlement` models and `RefundStatus`/`SettlementStatus` enums (migration `financial_module`). New `paychangu.refund()` client method. Routes live under `/api/v1/financial`; approve/reject/process/generate/pay require SUPER_ADMIN, the rest FINANCIAL or SUPER_ADMIN.
  - 20 integration tests.

- **Admin module (module 6)**:
  - **Dashboard stats**: `GET /admin/dashboard` — aggregate user counts by role, booking counts by status, paid revenue, active vendors/operators, pending bookings.
  - **User management**: `GET /admin/users` (role filter + name/email/phone search), `GET /admin/users/:id` (detail with role-specific profiles and counts), `PATCH /admin/users/:id/status` (toggle active), `DELETE /admin/users/:id` (soft-delete via the previously-unused `deletedAt` column — super admin only, another super admin is protected). Deleted users are rejected at login.
  - **Vendor/operator approval**: `PATCH /admin/vendors/:id/approve` and `PATCH /admin/operators/:id/approve` toggle the profile `isActive` flag.
  - **Audit log viewer**: `GET /admin/audit-logs` — the write-only `AuditLog` table now has a paginated query endpoint with `actorId`, `action`, `entity`, and `from`/`to` date filters, including the actor's details.
  - **Platform settings**: new `PlatformSetting` key-value store (`key` unique, JSON `value`). `GET /admin/settings`, `GET /admin/settings/:key`, `PUT /admin/settings/:key` (upsert) — super admin only. Migration `admin_module`.
  - All admin routes live under `/api/v1/admin`; dashboard/users/approval/audit require ADMIN or SUPER_ADMIN, soft-delete and settings require SUPER_ADMIN. Mutations are audit-logged.
  - Existing admin routes in the auth module (`POST/GET /users`, `PATCH /users/:id`, `POST /auth/invite`) are untouched — backward compatible.
  - 23 integration tests.
  - Schema: `PlatformSetting` model.

- **Notifications module (module 5)**:
  - **Provider abstraction** (`NotificationProvider` interface) with mock SMS, WhatsApp, and email providers. Real providers are wired later via env toggles: `SMS_PROVIDER` (mock|africastalking), `WHATSAPP_PROVIDER` (mock|meta), `EMAIL_PROVIDER` (mock|resend|smtp) — all default to `mock`, so nothing external is required to run.
  - **BullMQ queue infrastructure** (`src/jobs/`): a `notifications` queue + worker (dispatches to the matching provider, retries with exponential backoff, marks `SENT`/`FAILED`) and a `booking-expiry` queue + repeating worker. Workers boot in-process via `startWorkers()` from `server.ts`.
  - **Models**: `Notification` (channel, status `PENDING/SENT/DELIVERED/FAILED/READ`, reference + referenceType for linking to bookings/payments/OTPs), `OtpCode` (SHA-256-hashed 6-digit code, purpose, expiry, attempts), `NotificationPreference` (per-user SMS/WhatsApp/email toggles, default all on). Migration `notifications_module`.
  - **OTP / password reset**: `POST /auth/forgot-password` (always 202 — never leaks whether an account exists) and `POST /auth/reset-password` (verify code + set new password). Codes expire after `OTP_TTL_MINUTES` (default 10) and lock after 5 failed attempts.
  - **User invites**: `POST /auth/invite` (admin/super admin — creates an inactive user and sends a code) and `POST /auth/verify-invite` (activates + sets password).
  - **Notification API**: `GET /notifications/me` (paginated), `PATCH /notifications/:id/read` (owner only), `GET/PUT /notifications/preferences` (rejects disabling all channels).
  - **Booking expiry**: `BOOKING_HOLD_MINUTES` (default 15) — the worker transitions stale `PENDING` bookings to `EXPIRED`, releases the seat back to `AVAILABLE`, and notifies the passenger. New `busService.expireBooking()` backs this.
  - **Hooks into existing flows (best-effort, never block or throw)**: payment confirmation → "Booking confirmed"; booking cancellation → "Booking cancelled"; password reset / invite → OTP via SMS + email.
  - 20 integration tests (OTP lifecycle, invites, notification CRUD, preferences, booking expiry).
  - Env: `BOOKING_HOLD_MINUTES`, `OTP_TTL_MINUTES`, provider toggles + credentials, `EMAIL_FROM`.

- **Payments module (module 4)**:
  - PayChangu integration (`PayChanguClient` in `paychangu.ts`): initiate a checkout (`POST /payment`, bearer-token auth) returning a `checkout_url`, and verify a transaction (`GET /verify-payment/{tx_ref}`) used as the source of truth.
  - `Payment` model + `PaymentStatus` (`PENDING/PAID/FAILED/REFUNDED`) and `Currency` (`MWK/USD`) enums + migration `payment_module`. A booking may have **multiple** payment attempts; `txRef` is unique.
  - `POST /api/v1/payments`: the booking owner initiates a payment for their own `PENDING` booking (others → `403`; a `CONFIRMED`/`CANCELLED` booking → `409`). Returns `checkout_url` + `txRef`; the payment row is `PENDING`.
  - `POST /api/v1/webhooks/paychangu`: raw-body SHA-256 HMAC signature verification (timing-safe) against `PAYCHANGU_WEBHOOK_SECRET`, then always **re-verifies** via the PayChangu API before confirming. On success the booking flips `PENDING → CONFIRMED` (seat `HELD → BOOKED`) and the payment becomes `PAID`; an amount mismatch marks the payment `FAILED` without touching the booking; duplicate webhooks are idempotent.
  - `POST /api/v1/payments/:id/verify`: manual re-verification as a fallback if the webhook never fires.
  - `GET /api/v1/payments/me` (own payments), `GET /api/v1/payments/:id` (owner or staff), `GET /api/v1/payments/:id/receipt` (PDF via `pdfkit`; only when `PAID`).
  - New `AppError.paymentFailed` (402) / `AppError.paymentPending` (202); env: `PAYCHANGU_SECRET_KEY`, `PAYCHANGU_PUBLIC_KEY`, `PAYCHANGU_WEBHOOK_SECRET`, `PAYCHANGU_BASE_URL`, `PAYCHANGU_CALLBACK_URL`, `PAYCHANGU_RETURN_URL` (all optional, so the app boots without PayChangu configured).
  - Seat/booking state ownership stays in the Bus module: payments call `busService.confirmBooking`, which treats an already-confirmed booking as idempotent.
  - 14 integration tests with a mocked PayChangu client (initiation, RBAC, webhook HMAC validation, amount-mismatch failure, idempotency, manual verify, receipts).
  - `@types/pdfkit` added for the receipt generator.

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
