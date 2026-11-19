# Changelog

All notable changes to this project are documented here. Versions follow semantic versioning: `MAJOR.MINOR.PATCH` (major = breaking change, minor = new feature, patch = bug fix).

## [1.1.0] - 2026-11-20

### Added
- Analytics with charts for every role: institution overview (user counts by role, overall attendance donut, per-course attendance bars) for admins; class-by-class trend line, present/absent donut, and per-student bars for teachers; overall donut plus per-course bars for students
- `GET /api/reports/institution` (admin, replica) for institution-wide aggregates
- The course report now includes a per-session `trend` array for charting
- Dependency-free SVG chart components (donut, bar list, trend line) in the white/black/blue design tokens

## [1.0.0] - 2026-11-20

First complete release: design contract plus working implementation.

### Added
- Role-based attendance register (admin / teacher / student) with Auth.js JWT sessions and Argon2id passwords; temporary passwords force a change at first sign-in
- Supabase primary / read-replica data layer: writes, login lookups, and edit views on the primary; lists, histories, and reports on the replica with `dataAsOf`, `X-Data-Source`, `X-Replica-Lag-Ms`, one retry, and a 30-second circuit-breaker fallback to the primary
- Attendance roll call: session creation, present/absent marking, optimistic `version` locking with `409` conflict handling that preserves unsaved marks
- Course reports with enrollment-window counting and percentage rules (zero classes → em dash)
- Admin management: users (create, reset password, activate/deactivate, last-active-admin guard), courses (create, archive/restore), enrollments (enroll/drop with window semantics)
- Exact sliding-window rate limiting via Upstash Redis with per-policy fail-open/closed behavior and standard `RateLimit` headers
- Append-only audit events for attendance saves and admin changes
- Design system per contract: white/black/blue tokens, accessible roll call (aria-pressed controls, live save status, keyboard flow)
- Docker Compose stack with a real Postgres primary + streaming hot-standby replica
- `PGLITE=1` in-memory demo mode with seeded data; Drizzle SQL migrations and seed scripts
- Verification: strict TypeScript build, unit tests, and a 31-check end-to-end suite

### Known gaps (deferred)
- Audit-log viewer UI, live rate-limit countdown, strict-CSP nonces, load testing
