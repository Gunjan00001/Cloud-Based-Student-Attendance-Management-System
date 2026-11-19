# Rollcall — Cloud-Based Student Attendance Management System

Implementation of the design contract in `../docs/` (design.md, database.md, api.md, rate-limiting.md, design-system.md).

Next.js 15 (App Router) · Auth.js v5 (JWT, Argon2id) · Drizzle ORM + Postgres · Tailwind CSS 4 (white/black/blue tokens) · Upstash Redis rate limiting.

## Quick start (no external database)

```bash
npm install
npm run build
PGLITE=1 npm start        # or set PGLITE=1 in .env.local
```

`PGLITE=1` runs an in-process in-memory Postgres (PGlite). Schema and demo data are created on each boot and reset on restart — for demos and practice only.

Demo accounts (same for all modes):

| Role | Email | Password |
|---|---|---|
| Admin | `admin@example.edu` | `ChangeMe-Admin-123` |
| Teacher | `teacher@example.edu` | `ChangeMe-Teacher-123` |
| Students | `kabir@example.edu` and 5 more | `ChangeMe-Student-123` |

Run the scripted end-to-end check against the running server:

```bash
npm run e2e   # 31 checks: auth, RBAC, attendance save/conflict, reports, admin
```

## Docker (primary + real streaming read replica)

```bash
docker compose up -d      # builds the app, starts Postgres primary + standby, migrates, seeds
```

- `db-primary` — Postgres 16 with a `replicator` role (`docker/primary-init.sql`) and an `hba_file` allowing replication (`docker/pg_hba.conf`).
- `db-replica` — hot standby: `pg_basebackup -R` from the primary, then streams WAL (`docker/replica-entrypoint.sh`). Verify with `docker compose exec db-replica psql -U postgres -c "SELECT pg_is_in_recovery();"` (expect `t`).
- `migrate` — one-shot: applies migrations and the demo seed on every `up` (both idempotent; the seed enrolls every existing student user).
- `app` — Next.js on `http://localhost:3000`. Reads with replica URLs get `X-Data-Source: replica` and `X-Replica-Lag-Ms` headers; kill the replica (`docker compose stop db-replica`) to watch reads fall back to the primary with `X-Data-Source: primary`.
- Demo data here is the small seed (1 admin, 1 teacher, 6 students, CS301 with one saved class). For Supabase deployments, use the same commands against the pooler URLs.

Auth creds are the demo accounts above. Override `AUTH_SECRET` before any non-local use.

## Real deployment (Supabase)

1. Create the Supabase project (Pro plan for a Read Replica, AWS region, PG 15+).
2. Enable the Read Replica; copy both pooler URLs.
3. Create `app_write` / `app_read` roles per `../docs/database.md` §11.
4. Copy `.env.example` to `.env.local` and fill in:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Primary pooler (transaction mode, port 6543), `prepare: false` + `max: 1` |
| `DATABASE_REPLICA_URL` | Read-replica pooler for read-heavy queries |
| `MIGRATION_DATABASE_URL` | Direct/session connection; only `npm run db:migrate` uses it |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL`, `NEXT_PUBLIC_APP_URL` | Canonical app URL |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Rate limiter (skipped locally when unset) |
| `RATE_LIMIT_KEY_SECRET` | HMAC key for rate-limit identities |

```bash
npm run db:migrate   # applies db/migrations/*.sql to the primary only
npm run db:seed      # dev/staging demo data (refuses to run in production)
npm run build && npm start
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `start` | App on `http://localhost:3000` |
| `npm run db:migrate` | Apply SQL migrations (forward-only, primary only) |
| `npm run db:seed` | Seed demo data (dev/staging only) |
| `npm run e2e` | End-to-end smoke test (needs a running server) |
| `npm run typecheck` / `test` | TypeScript / node --test unit tests |

## What maps to which doc

- **Schema & migrations** — `db/schema.ts`, `db/migrations/0000_init.sql` (matches database.md, plus `users.roll_number` — see notes).
- **Primary/replica routing** — `lib/db.ts`: `writeDb` for writes/login/edit views, `read()` wraps replica reads with one retry, a 30-second circuit-breaker fallback to primary, and `X-Data-Source` / `X-Replica-Lag-Ms` / `dataAsOf` metadata.
- **Auth** — `auth.ts`: Auth.js credentials, Argon2id (`lib/password.ts`), JWT with 8-hour lifetime, `must_change_password` gate, login rate limits inside `authorize`.
- **API wrapper** — `lib/api.ts`: session → role gate → rate limit → Zod validation → handler, standard error envelope, rate-limit headers, `Origin` check on mutations.
- **Rate limiting** — `lib/rate-limit.ts`: exact sliding-window log via Upstash `EVAL` (Redis server time), HMAC-hashed identities, per-policy fail-open/closed per rate-limiting.md.
- **Attendance save** — `app/api/sessions/[sessionId]/attendance/route.ts`: one transaction, `UPDATE ... WHERE version = ?` optimistic lock, full-roster validation (`lib/attendance.ts`), upserted records, audit event, canonical response from the primary.
- **Design system** — `app/globals.css` tokens + component classes; screens per design-system.md §14.

## Known deviations / deferred (deliberate)

- `users.roll_number` added (nullable) — roster/report API shapes in api.md include `rollNumber`, but database.md's user table omitted it.
- CSP allows `unsafe-inline` for scripts/styles; strict CSP needs per-request nonces — tighten before launch.
- Rate limiting is skipped when Upstash env vars are unset; production must set them (fail-closed routes then protect login/password paths).
- Login 429 shows "wait a few minutes" rather than a live countdown (Auth.js credentials flow does not expose Retry-After to the client).
- Dashboard is a lightweight summary; audit-log viewer UI and load tests from design.md §6/§14 are not built yet.
