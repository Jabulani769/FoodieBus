# Changelog

All notable changes to FoodieBus will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Phase 4 — Ops hardening & security audit fixes**: observability (request-id logging + Prometheus `/metrics`), rate limiting, a load-test harness, and remediation of the 11 confirmed findings from the security audit.
  - **Observability**: every request gets a `request-id` (echoed in logs and the `X-Request-Id` response header); `GET /api/v1/metrics` exposes Prometheus counters/gauges (`http_requests_total`, `http_request_duration_seconds`, `http_errors_total`, `http_active_requests`, `db_query_duration_seconds`), gated by a `METRICS_ENABLED` env var.
  - **Rate limiting**: `@fastify/rate-limit` global + per-route limits — login, OTP/forgot/reset-password (10/min/IP), payment init/verify/webhook, uploads, and manifest endpoints all rate-limited. Configurable via `RATE_LIMIT_ENABLED` (default on; off in tests where the login suite exceeds the 10/min login cap).
  - **Load harness**: `ops/load/loadtest.mjs` — a Node script that hammers login, trip search, and booking creation against a running API (reporting p95/p99/error-rate) for load/soak validation.
  - **Security audit**: an independent audit (`~/security-audit-skill/foodiebus/run-1/`) confirmed 11 findings; all fixed (see Changed) and verified by the full 273-test suite.

- **Web dashboards (Phase II Phase 1)** — three React + Vite + TypeScript apps in an npm-workspaces monorepo consuming the existing backend API, plus four shared packages.
  - **Monorepo**: root `package.json` gains `workspaces: ["apps/*", "packages/*"]` and scripts `dev:vendor`, `dev:admin`, `dev:financial`, `build:web`, `lint:web`, `typecheck:web`. Root eslint ignores `apps/`/`packages/` (each workspace lints with its own config).
  - **Shared packages**: `@foodiebus/types` (domain types: user, food, bus, payment, rating, admin, financial, analytics), `@foodiebus/api-client` (axios client with 401-refresh interceptor + an `Api` class covering all 116 endpoints, plus `createHttpClient`/`extractError`), `@foodiebus/auth` (tokenStore, `AuthProvider`, `AuthGuard`/`RoleGuard`, `useAuth`), `@foodiebus/ui` (Ant Design theme, money/date formatters, `StatusBadge`, `StatCard`).
  - **`@foodiebus/web-vendor` (port 5173)**: login + accept-invite, forgot/reset password, role-based layout; vendor pages (dashboard, menu CRUD with image upload and availability toggles, orders with socket.io realtime refresh and one-step status advancement, ratings, payouts); operator pages (dashboard, buses CRUD, trip scheduling with driver assignment and state-machine status transitions, driver registration/deactivation, settlements).
  - **`@foodiebus/web-admin` (port 5174)**: login + forgot password, dashboard with platform aggregate stats, user list with role filter/search/toggle/delete, vendor & operator approval lists, category CRUD, audit-log viewer, super-admin platform settings editor.
  - **`@foodiebus/web-financial` (port 5175)**: login + forgot password, dashboard from `platformOverview`, revenue reports (totals + daily + by route/operator) with date-range picker, refund workflow (request → approve/reject → process), settlements listing + period generation + mark paid, driver-payouts listing + mark paid, reconciliation mismatches + resolve, analytics with charts (revenue trend, booking/payment funnels, trip utilization, passenger stats).
  - **Verified**: all 4 shared packages and all 3 apps typecheck, lint, and `vite build`; backend typecheck, lint, format-check, build, and the full 268-test suite still pass.

- **Dockerize & deploy pipeline (Phase H)** — the service now ships as a production Docker image with a one-shot migrate step, and Sentry error tracking is wired in (no-op without a DSN).
  - **Dockerfile**: multi-stage (deps → build → runtime) production image running `node dist/server.js`. The builder runs `prisma generate` then compiles; the runtime installs production deps only, copies the compiled output, and boots with `prisma migrate deploy && node dist/server.js` (the Prisma client is already compiled into `dist`, so the runtime only needs the CLI for the boot-time migrate). The Prisma CLI is a devDependency, so the runtime installs it explicitly for `migrate deploy` on boot.
  - **docker-compose**: `postgres` and `redis` (existing) are joined by `migrate` (one-shot `prisma migrate deploy` service gated on Postgres being healthy) and `api` (builds the image, reads secrets from `.env`, overrides `DATABASE_URL`/`REDIS_URL` to the compose network, publishes `8080`, starts only after `migrate` completes and Redis is healthy, with a healthcheck polling `/api/v1/health`). The API also re-runs `migrate deploy` on boot (idempotent) so it is safe to scale independently.
  - **CI**: the existing `.github/workflows/ci.yml` already runs typecheck, lint, format check, `prisma migrate deploy` against a CI Postgres, the full test suite, and build on every push/PR to `main` — no changes needed.
  - **Sentry**: new `src/shared/sentry/index.ts` initializes `@sentry/node` only when `SENTRY_DSN` is set (guarded, so a no-op in tests and without a DSN), with `tracesSampleRate: 0` to keep it error-only. `server.ts` calls `initSentry()` before boot, and the error handler forwards unhandled 500s to `captureException`. `SENTRY_DSN` was already present in the env schema and `.env.example`.
  - **Verified**: `npm run build && npm run start` boots the compiled service end-to-end against local Postgres/Redis — migrations applied, `/api/v1/health` reports DB+Redis ok, `/docs` serves Swagger, and errors return the sanitized production message.

- **Webhook idempotency & payment reconciliation (Phase G)** — PayChangu webhook deliveries are deduplicated with a persisted trail, stale pending payments are expired, and a daily reconciliation job flags local/gateway status mismatches.
  - **Schema**: two new tables (migration `webhook_reconciliation`). `WebhookEvent` records every verified webhook delivery (`txRef`, `event`, `status`, full `payload` JSON) with a unique `(txRef, event)` constraint; `ReconciliationMismatch` records payments where the local status diverges from the gateway (`paymentId`, `localStatus`, `remoteStatus`, `resolved`, `resolvedAt?`), with indexes on `resolved` and `createdAt`.
  - **Webhook dedup**: `POST /api/v1/webhooks/paychangu` inserts a `WebhookEvent` row (via a `P2002`-safe create) before running `verifyAndConfirm`. A repeat delivery for the same `(txRef, event)` is skipped entirely, so it can never double-confirm or double-refund; the audit log marks it `deduplicated`. This complements the existing status-guard idempotency in `verifyAndConfirm`.
  - **Payment expiry worker**: new BullMQ `payment-expiry` queue runs every 60s. A `PENDING` payment older than `BOOKING_HOLD_MINUTES` whose booking is still `PENDING` has its booking expired via the existing `expireBooking` (seat released) and the payment marked `FAILED`; a stale pending payment whose booking already left `PENDING` (confirmed/cancelled/expired elsewhere) is just marked `FAILED`.
  - **Reconciliation worker**: new BullMQ `reconciliation` queue runs every 24h. It re-verifies `PAID` payments from the last 24h via `paychangu.verify`; when the gateway no longer reports success, an unresolved `ReconciliationMismatch` is created (idempotent per payment).
  - **Endpoints**: `GET /api/v1/financial/reconciliation/mismatches` (FINANCIAL/ADMIN/SUPER_ADMIN) lists mismatches — paginated, filterable by `resolved`, with booking/trip/route detail; `PATCH /api/v1/financial/reconciliation/mismatches/:id/resolve` (SUPER_ADMIN) marks one resolved (sets `resolvedAt`, rejects already-resolved with `409`, logs `reconciliation.mismatch_resolve`).
  - **Health**: `GET /api/v1/health` now also reports `paychangu: 'ok' | 'down' | 'not_configured'` (gateway ping, `not_configured` when no secret key). Overall status degrades when the gateway is down.
  - 10 new integration tests (webhook dedup records a single `WebhookEvent` and runs one confirm, payment expiry with pending/confirmed/missing-relation bookings, reconciliation flag/no-flag/duplicate-guard, mismatch listing + RBAC, resolve + reject already-resolved, health ok + degraded). PayChangu is stubbed (G5) and `fetch` is stubbed in the health tests.

- **Live bus tracking (Phase F)** — assigned drivers push the bus's live coordinates over the existing Socket.io infra, and passengers/operators read the latest position.
  - **Data model**: coordinates live in **Redis** (`trip:location:{tripId}` hash with `lat`/`lng`/`updatedAt` and a 24h TTL) rather than a Prisma table — location is high-frequency, ephemeral state (avoids write amplification). No migration.
  - **Write**: `PATCH /api/v1/trips/:id/location` (DRIVER only) accepts `{ lat, lng }` validated to `lat ∈ [-90, 90]`, `lng ∈ [-180, 180]`. The service enforces that the actor is the driver assigned to the trip (403) and that the trip is `IN_TRANSIT` (409), stores the coords in Redis, and emits a `trip:location` Socket.io event to the trip room via the new `emitTripLocation` helper (mirrors `emitTripStatus`).
  - **Read**: `GET /api/v1/trips/:id/location` (any authenticated user) returns `{ tripId, lat, lng, updatedAt, stale }` as a fallback for clients already receiving the live push; `stale: true` when no location is recorded or the last update is older than 15 minutes.
  - 8 integration tests (assigned driver stores coords, non-assigned driver 403, non-`IN_TRANSIT` 409, operator 403, out-of-range coords 400, GET returns latest coords with `stale: false`, GET reports `stale: true` when absent). Socket emissions are no-ops in tests (G8), so assertions read the stored Redis value.

- **Food-order settlement & vendor payouts (Phase E)** — settlements now cover vendors, not just operators, and revenue reports count delivered food orders.
  - **Schema**: no migration needed — the `Settlement` model already carried `vendorId` (optional) with a unique `(vendorId, period)` constraint and its `VendorProfile` relation; the generation logic was the only gap.
  - **Settlement generation**: `POST /financial/settlements/generate` now also iterates active vendors and creates a settlement from `totalAmount` of `DELIVERED_TO_BUS` food orders whose `updatedAt` falls in the period (only delivered orders count as recognized revenue — `PLACED`/`PREPARING`/`READY`/`CANCELLED` are excluded). Commission uses the same `commission_rate` `PlatformSetting`, and idempotency is preserved per `(vendorId, period)`.
  - **Revenue reports**: `GET /financial/reports/revenue` now includes delivered food-order revenue in `totalRevenue` and the daily breakdown, and reports a new `foodOrders` count; `GET /financial/reports/revenue/by-route` folds delivered food-order revenue into the route totals. `revenue/by-operator` and the payments CSV stay booking-only (operators vs. vendors are distinct revenue streams).
  - 5 new integration tests (vendor settlement from delivered orders with correct gross/commission/net, exclusion of non-delivered orders, idempotency per vendor+period, vendor filter on the settlements listing, food-order revenue in reports).

- **Driver payments & payouts (Phase D)** — drivers earn a flat per-trip fee automatically when an assigned trip reaches `COMPLETED`, and finance staff can track and pay those earnings.
  - **Schema**: new `DriverPayoutStatus` enum (`PENDING | PAID`) and a `DriverTripPayout` model (`driverId` → `DriverProfile`, `tripId` → `Trip`, `amount`, `status`, `paidAt?`), with a unique `(driverId, tripId)` constraint so one payout is created per driver per trip (migration `driver_payout`).
  - **Auto-creation**: when a trip transitions to `COMPLETED` in `bus.service.updateTripStatus`, a `PENDING` payout is created for the assigned driver (skipped when no driver is assigned). The per-trip fee comes from the `driver_trip_fee` `PlatformSetting` (override) or the `DRIVER_TRIP_FEE` env var (default `0` — no payout when unset). The unique constraint makes the transition idempotent; a `driver_payout.create` audit log records each payout.
  - **Endpoints** under `/api/v1/financial`: `GET /financial/driver-payouts` (FINANCIAL/ADMIN/SUPER_ADMIN) lists payouts — paginated, filterable by `driverId` and `status`, with driver, route, and operator details; `PATCH /financial/driver-payouts/:id/pay` (SUPER_ADMIN) marks a `PENDING` payout `PAID` (sets `paidAt`), rejecting already-paid payouts with `409` and logging `driver_payout.pay`.
  - 8 integration tests (payout created on completion with driver, none without driver, none on cancellation, idempotency on retry, filtered listing, marking paid, rejecting an already-paid payout, RBAC denials). Test `beforeEach` wipes now clear `DriverTripPayout` before its parents (G4).

- **Ratings & reviews (Phase C)** — students can now rate trips, dishes, operators, and vendors, with aggregates surfaced on the existing trip/dish detail endpoints.
  - **Schema**: new `RatingEntityType` enum (`TRIP | DISH | OPERATOR | VENDOR`) and a polymorphic `Rating` model (`userId`, `entityType`, `entityId`, `score` 1–5, `comment?`) with a unique constraint on `(userId, entityType, entityId)` so one user rates an entity once, plus an index on `(entityType, entityId)` (migration `ratings_module`).
  - **Eligibility** (enforced in `rating.service`): `TRIP` and `OPERATOR` require a `CONFIRMED` booking by the student (on that trip / on a trip owned by that operator); `DISH` and `VENDOR` require a `DELIVERED_TO_BUS` food order (dish must be in the order; vendor from the order). Non-participants get `403`, duplicates `409`, unknown entities `404`.
  - **Endpoints** under `/api/v1/ratings`: `POST /ratings` (STUDENT) creates; `GET /ratings` lists (paginated, filterable by `entityType` + `entityId`); `PATCH /ratings/:id` and `DELETE /ratings/:id` update/delete own ratings (ownership enforced → `403`). All mutations write an audit log (`rating.create`/`update`/`delete`).
  - **Aggregates**: `GET /trips/:id` and `GET /dishes/:id` now return a `rating: { average, count }` object (via `ratingService.getRatingSummary`, `_avg`/`_count`).
  - 18 integration tests (per-type happy paths, duplicate `409`, non-participant `403`, score bounds, unknown entity, unauthenticated, non-student role, update/delete ownership, filtered listing, aggregate math on trip + dish, zero aggregate). Every test `beforeEach` now wipes `Rating` before its parents (G4).

- **Object storage & media uploads (Phase B)** — a pluggable storage layer plus a single authenticated upload endpoint that returns a public URL to store in `imageUrl`/`logoUrl` fields.
  - **`src/shared/storage/`** — `StorageProvider` interface (`upload`, `delete`) with two implementations behind the `STORAGE_PROVIDER` env toggle (default `mock`):
    - **Mock** (`STORAGE_PROVIDER=mock`): writes to `STORAGE_UPLOAD_DIR` (default `./uploads`) and serves it back via `@fastify/static` at `/uploads/*`; returns a `http://{host}:{port}/uploads/{key}` URL. Useful for local dev — no external services needed.
    - **S3** (`STORAGE_PROVIDER=s3`): streams the file to an S3-compatible bucket (AWS S3, Cloudflare R2, DigitalOcean Spaces) via `@aws-sdk/client-s3` (new runtime dependency). Configured with `STORAGE_S3_BUCKET`/`STORAGE_S3_REGION`/`STORAGE_S3_ACCESS_KEY_ID`/`STORAGE_S3_SECRET_ACCESS_KEY`; `STORAGE_S3_ENDPOINT` + `forcePathStyle` enable compatible providers; `STORAGE_S3_PUBLIC_BASE_URL` overrides the public URL prefix.
  - **`POST /uploads`** (`src/modules/uploads/upload.routes.ts`) — multipart upload (field `file`), authenticated for STUDENT/VENDOR/OPERATOR/ADMIN/SUPER_ADMIN. Validates MIME type against `STORAGE_ALLOWED_TYPES` (default `image/jpeg,image/png,image/webp`), streams through a size-limiting Transform capped at `STORAGE_MAX_SIZE_MB` (default 5), and stores under `{category}/{uuid}.{ext}` where `category` comes from the `?category=` query param (default `uploads`). Returns `{ url, key }` with a `201`, and writes an `upload.create` audit log entry.
  - Registered in `app.ts`: `@fastify/multipart` (file-size ceiling 10× the limit so the app-level Transform stays authoritative) and, in mock mode only, `@fastify/static` with `decorateReply: false`.
  - 10 integration tests (per-type happy paths, unsupported type, missing file, unauthenticated, invalid category, oversized file, static retrieval, audit log, provider singleton).
  - Env: storage vars added to `env.ts` and `.env.example`; `.env.test` pins `STORAGE_PROVIDER=mock` + `uploads-test/`; `.gitignore` excludes local upload dirs.

- **Real notification providers (Phase A)** — replaced the mock-only providers with working real-world integrations behind the existing `NotificationProvider` interface. Mocks remain the default (no external credentials needed for tests/local dev).
  - **SMS — Africa's Talking** (`SMS_PROVIDER=africastalking`): `POST /version1/messaging` with `apiKey` header + form-encoded `username`/`to`/`message`/`from`; maps per-recipient `status`/`messageId` and throws on failure. Requires `SMS_API_KEY` + new `SMS_API_USERNAME` (application username), optional `SMS_SENDER_ID`.
  - **WhatsApp — Meta Cloud API** (`WHATSAPP_PROVIDER=meta`): `POST /graph.facebook.com/v18.0/{phone_number_id}/messages` with a Bearer token; strips the leading `+` from phone numbers (Meta expects E.164 without `+`); parses `messages[].id` and surfaces `error.message` on failure. Requires `WHATSAPP_API_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`.
  - **Email — Resend** (`EMAIL_PROVIDER=resend`): `POST /api.resend.com/emails` with a Bearer key, `from` = `EMAIL_FROM`, `to` array, subject, text body; returns the Resend `id`. Requires `EMAIL_API_KEY`.
  - **Email — SMTP** (`EMAIL_PROVIDER=smtp`): sends via `nodemailer` using `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`; `secure: true` when port is 465; returns the SMTP `messageId`.
  - All real providers use raw `fetch()` (SMTP uses `nodemailer` — new runtime dependency). Failures throw, the BullMQ worker retries with exponential backoff (3 attempts), then records `FAILED` + `failureReason`.
  - 14 provider unit tests (mock fallbacks, successful mappings, HTTP/API error mapping, SMTP auth/secure-mode) with stubbed `fetch` and a mocked nodemailer transport — no external APIs are ever called in tests.
  - Env: added `SMS_API_USERNAME` to `env.ts` and `.env.example`.

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

- **Security audit findings (Phase 4)** — 11 confirmed findings remediated:
  - **F1 (HIGH) — ADMIN could mint a SUPER_ADMIN**: `createUser`/`createInvitedUser` now take an `actorRole` and enforce a role hierarchy (`assertCanAssignRole`) — only SUPER_ADMIN may create/invite SUPER_ADMIN or ADMIN; ADMIN creates roles strictly below ADMIN; OPERATOR creates OPERATOR/DRIVER/STUDENT. Routes pass the authenticated actor's role; bootstrap script passes SUPER_ADMIN.
  - **F2 (HIGH) — manifest IDOR**: `getManifest(tripId, actorId)` now enforces ownership — the actor must be the trip's assigned driver or its operator's user, else `403`.
  - **F3 (HIGH) — TOCTOU double-refund**: `processRefund` atomically claims the `APPROVED → PROCESSED` transition via a conditional `updateMany` before calling the gateway (a concurrent duplicate is rejected before any money moves); a partial unique index (`Refund_paymentId_status_active_key`) prevents two active refunds per payment; `requestRefund` maps the resulting `P2002` to a clean `409`.
  - **F4 (MEDIUM) — partial refund cancelled the whole booking**: a refund only marks the payment `REFUNDED` and force-cancels the booking when it covers the full amount; partial refunds leave the booking intact and the remainder refundable.
  - **F5 (HIGH) — paid CONFIRMED booking could be cancelled**: `cancelBooking` rejects cancellation when the booking has a `PAID` payment ("request a refund"), and `verifyAndConfirm` auto-requests a refund when a payment lands on an already-cancelled/expired booking.
  - **F6 (HIGH) — expiry worker raced the webhook**: `expireStalePayments` verifies with the gateway (`paychangu.verify`) before expiring — a confirmed paid payment marks the booking `CONFIRMED` instead of releasing the seat; `expireBooking`/`confirmBooking` are now atomic (`updateMany` on `PENDING` + count check).
  - **F7 (MEDIUM) — trip cancellation gave no refunds**: `cancelTripBookings` auto-creates a `REQUESTED` refund (with passenger notification) for every `CONFIRMED` booking that has a `PAID` payment.
  - **F8 (MEDIUM) — ratings before interaction / surviving cancellation**: TRIP and OPERATOR ratings now require a `COMPLETED` trip; cancelling a booking (or a cancelled trip) deletes the passenger's related trip/operator ratings.
  - **F9 (LOW) — account enumeration**: `resetPassword` returns the same generic message for an unknown identifier and a wrong code.
  - **F10 (MEDIUM) — CSV formula injection**: `csvEscape` neutralizes cells starting with `=`, `+`, `-`, `@`, tab, or CR by prefixing an apostrophe.
  - **F11 (HIGH) — default JWT secrets**: the app fails fast if `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` are known defaults; JWT sign/verify pin `algorithm: HS256` / `algorithms: ['HS256']`.

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
