# Changelog

All notable changes to FoodieBus will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
