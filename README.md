# Cloud-Based Student Attendance Management System

A cloud-hosted attendance register for one institution. Admins manage users, courses, and enrollments; teachers take a present/absent roll call; students view their own attendance. Every write goes to a Supabase Postgres primary while read-heavy lists and reports are served from a Supabase Read Replica.

## Repository layout

| Path | Contents |
|---|---|
| [`docs/`](./docs) | The full design contract: [system design](./docs/design.md), [database (primary/replica)](./docs/database.md), [API](./docs/api.md), [rate limiting](./docs/rate-limiting.md), [design system](./docs/design-system.md) |
| [`app/`](./app) | The implementation: Next.js 15 + Auth.js v5 + Drizzle ORM + Tailwind CSS 4, with its own [README](./app/README.md) (setup, Docker, seeding, E2E tests) |

## Quick start

```bash
cd app
npm install
npm run build
PGLITE=1 npm start     # in-memory demo database, no setup needed
```

Then open http://localhost:3000 and sign in with `admin@example.edu` / `ChangeMe-Admin-123` (teacher and student demo accounts in `app/README.md`).

For the real topology (primary + streaming read replica) there is a one-command Docker stack:

```bash
cd app
docker compose up -d   # app + Postgres primary + hot-standby replica + migrations + seed
```

For the production reference deployment (Vercel + Supabase + Upstash), follow [`app/README.md`](./app/README.md#real-deployment-supabase) and the design docs.

## Verification

- `npm run typecheck` — TypeScript, strict
- `npm test` — unit tests (percentage math, rate-limit identity, roster completeness)
- `npm run e2e` — 31-check end-to-end suite against a running server: auth for all roles, RBAC denials, attendance save/version-conflict flows, reports, admin CRUD, password change

## Status

Design (phases 1–6 of the rollout) implemented: foundation, administration, attendance, student view + reports, and hardening basics (rate limiter, replica fallback, audit trail, security headers). Known deliberate gaps are listed in `app/README.md`.
