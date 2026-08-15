# FoodieBus Backend

Multi-vendor platform combining campus food ordering and intercity bus ticketing. One API service serving the mobile app (students) and three web dashboards (admin, financial, vendor/operator). Currency: **MWK**. Payments via **PayChangu**. Notifications via **SMS + WhatsApp**.

This repo contains the **backend only** — a single deployable API service.

## Tech Stack

| Layer            | Choice                           |
| ---------------- | -------------------------------- |
| Runtime          | Node.js LTS, TypeScript (strict) |
| Framework        | Fastify                          |
| Database         | PostgreSQL via Prisma            |
| Cache / Queue    | Redis via BullMQ                 |
| Real-time        | Socket.io                        |
| Auth             | JWT (access + refresh), argon2   |
| Object storage   | S3-compatible (R2 / DO Spaces)   |
| PDF              | pdf-lib or PDFKit                |
| Testing          | Vitest                           |
| Containerization | Docker                           |
| Logging          | Pino                             |
| Error tracking   | Sentry                           |

## Project Structure

```
src/
  modules/        # Domain modules: auth, food, bus, payments, notifications, admin, financial, analytics, delivery
  jobs/           # BullMQ queue definitions and workers
  realtime/       # Socket.io event handlers
  shared/         # db client, config, middleware, error types
```

A modular monolith: each module owns its routes, service logic, and Prisma models. Modules depend only on `shared/`.

## Getting Started

### Prerequisites

- Node.js >= 22
- PostgreSQL 16+ (local or Docker)
- Redis 7 (local or Docker)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# edit .env and set real secrets
```

Required: `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`. Secrets must be >= 32 chars.

### 3. Start infrastructure (Docker)

```bash
docker compose up -d postgres redis
```

If you're not using Docker, point `DATABASE_URL` / `REDIS_URL` at local instances.

### 4. Generate client + run migrations

```bash
npm run db:generate
npm run db:migrate
```

### 5. Run the API

```bash
npm run dev          # hot reload
npm run build        # compile
npm run start        # run compiled build
```

The API listens on `http://localhost:8080` and serves Swagger docs at `http://localhost:8080/docs`.

### Run everything with Docker (production build)

```bash
docker compose up -d --build
```

This builds the multi-stage `Dockerfile`, runs `migrate` (one-shot `prisma migrate deploy`)
against Postgres, then starts the `api` service (also runs `migrate deploy` on boot, then
`node dist/server.js`). Secrets and config are read from `.env` (env-file). A container
healthcheck polls `GET /api/v1/health`.

## Scripts

| Script                 | Description                 |
| ---------------------- | --------------------------- |
| `npm run dev`          | Run with hot reload         |
| `npm run build`        | Compile TypeScript          |
| `npm run start`        | Run compiled build          |
| `npm run typecheck`    | Type check (strict)         |
| `npm run lint`         | ESLint                      |
| `npm run format`       | Prettier write              |
| `npm run format:check` | Prettier check              |
| `npm test`             | Run Vitest                  |
| `npm run db:generate`  | Generate Prisma client      |
| `npm run db:migrate`   | Create/apply dev migrations |
| `npm run db:deploy`    | Apply migrations (prod)     |
| `npm run db:studio`    | Open Prisma Studio          |

## Development Workflow

- **Branching:** trunk-based. Short-lived `feat/<module>` / `fix/<issue>` branches merged to `main`.
- **Commits:** Conventional Commits, enforced by commitlint:
  `feat(auth): issue refresh tokens`, `fix(payments): idempotent webhook handling`, `test(bus): seat-lock race`.
- **Pre-commit:** lint-staged runs ESLint + Prettier on staged files; commitlint validates the message.
- **CI:** GitHub Actions runs typecheck, lint, format check, Prisma migrations, tests, and build on every push/PR to `main`.

## Conventions

- API base path: `/api/v1`
- Error shape: `{ "error": { "code": "...", "message": "..." } }`
- Pagination: `?page=&limit=`, capped at 100
- All endpoints validated with Zod before business logic
- Every endpoint documented in OpenAPI as it's built
- Never commit secrets; all config via environment variables (`.env.example`)
- Prisma migrations for every schema change — never edit the DB directly

## Module Build Order

1. Auth & RBAC
2. Food
3. Bus
4. Payments
5. Notifications
6. Admin
7. Financial
8. Analytics
9. Delivery

Each module ships as a complete increment: schema → routes → service → tests (happy path + failure path).

See [CHANGELOG.md](./CHANGELOG.md) for a running log of what's been built.
