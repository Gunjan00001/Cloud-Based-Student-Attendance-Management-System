# API Design

**Parent design:** [`design.md`](./design.md)
**Database contract:** [`database.md`](./database.md)
**Rate-limit contract:** [`rate-limiting.md`](./rate-limiting.md)

## 1. Conventions

- Base path: `/api`.
- Content type: `application/json` for requests and responses, except `/api/health`.
- Authentication: Auth.js JWT session cookie. The browser sends it automatically; no bearer token.
- Same-origin app only. Mutations require a valid `Origin` header matching `AUTH_URL`/`NEXT_PUBLIC_APP_URL`.
- CSRF: Auth.js protection plus SameSite=Lax cookie and Origin validation.
- All mutations validate input with Zod and reject unknown fields.
- All domain routes require an authenticated, active user whose `must_change_password` flag is false.
- Roles and relationships are checked server-side. A client-supplied `role`, `actorId`, or `markedBy` is ignored or rejected.
- Timestamps are ISO 8601 with an explicit offset.
- IDs are UUID strings.
- Pagination: cursor-based with `?cursor=<opaque>&limit=<1..100>`; default limit is 25.
- Error envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": {}
  }
}
```

- Every limited response includes rate-limit headers. A rejected request returns `429` and `Retry-After`.
- Reads from the replica include `X-Data-Source: replica` and `X-Replica-Lag-Ms`. Reads from the primary include `X-Data-Source: primary`.

## 2. Authentication

Auth.js owns the sign-in flow and its framework routes under `/api/auth/*`. The application does not expose a separate login JSON endpoint.

- The login page submits credentials through Auth.js.
- Rate limits `auth.login.ip` and `auth.login.email` run inside the `authorize` callback before password verification.
- A successful login sets an httpOnly, Secure, SameSite=Lax JWT cookie with an 8-hour lifetime.
- `POST` sign-out is handled by Auth.js and clears the cookie.
- There is no public registration. An admin creates accounts.
- New accounts and admin password resets set `must_change_password = true`. While true, the only allowed API operations are `GET /api/me`, `POST /api/me/password`, and sign-out. Other routes return `403 PASSWORD_CHANGE_REQUIRED`.
- Deactivation and role changes take effect on the next login/token refresh, at most 8 hours later. Emergency invalidation rotates `AUTH_SECRET`.

## 3. Permission Matrix

| Capability | Admin | Teacher | Student |
|---|---|---|---|
| Manage users | Yes | No | No |
| Manage courses and enrollments | Yes | No | No |
| View assigned/own courses | All | Own | Enrolled |
| View course roster | All | Own | No |
| Create attendance sessions | Yes | Own | No |
| Mark attendance | No | Own | No |
| View course reports | All | Own | No |
| View own attendance | Yes (any) | Own courses | Own only |
| View audit log | Yes | No | No |

## 4. Rules That Apply to Every Route

1. Authenticate the session.
2. Reject inactive users and users who must change their password.
3. Authorize by role and resource relationship.
4. Apply the documented rate-limit policy.
5. Validate the request.
6. Use the documented database target.
7. Return the standard response or error envelope.
8. Never expose password hashes, internal database errors, replica hostnames, or secrets.

## 5. Endpoints

### 5.1 Current user

#### `GET /api/me`

- **Roles:** any authenticated user.
- **Database:** no database read; returns the JWT claims, including `mustChangePassword`.
- **Rate limit:** `read.user`.
- **Response:**

```json
{
  "user": {
    "id": "uuid",
    "email": "teacher@example.edu",
    "fullName": "Asha Rao",
    "role": "teacher",
    "mustChangePassword": false
  }
}
```

#### `POST /api/me/password`

- **Roles:** any authenticated user.
- **Database:** primary.
- **Rate limit:** `auth.password.user`.
- **Body:**

```json
{
  "currentPassword": "current-secret",
  "newPassword": "new-secret-at-least-12-chars"
}
```

- **Rules:** verify the current password with Argon2id; new password 12–128 characters; hash with Argon2id; set `must_change_password = false`; update `updated_at`. Existing JWT sessions remain valid until expiry (at most 8 hours) because sessions are stateless; the client signs out and signs in again after a successful change.
- **Success:** `204 No Content`.
- **Errors:** `401 INVALID_CREDENTIALS`, `422 VALIDATION_ERROR`, `429 RATE_LIMITED`.

### 5.2 Courses and roster

#### `GET /api/courses`

- **Roles:** admin, teacher, student.
- **Scope:** admin sees all non-archived courses; teacher sees courses assigned to them; student sees courses where they have an active enrollment.
- **Database:** replica.
- **Rate limit:** `read.user`.
- **Query:** `?includeArchived=true` (admin only), `?cursor=`, `?limit=`.
- **Response:** `{ "courses": [...], "nextCursor": null }`.

Course shape:

```json
{
  "id": "uuid",
  "code": "CS301",
  "title": "Database Systems",
  "term": "2026-27 Semester 1",
  "teacher": { "id": "uuid", "fullName": "Asha Rao" },
  "isArchived": false,
  "enrollmentCount": 42
}
```

#### `GET /api/courses/:courseId`

- **Roles:** admin, assigned teacher, enrolled student.
- **Database:** replica.
- **Rate limit:** `read.user`.
- **Response:** one course object plus `canMarkAttendance` for the current user.
- **Errors:** `403 FORBIDDEN`, `404 NOT_FOUND`.

#### `GET /api/courses/:courseId/roster`

- **Roles:** admin, assigned teacher. Students cannot list classmates.
- **Database:** replica.
- **Rate limit:** `read.user`.
- **Response:**

```json
{
  "courseId": "uuid",
  "students": [
    {
      "id": "uuid",
      "fullName": "Kabir Rao",
      "email": "kabir@example.edu",
      "enrolledAt": "2026-07-01T00:00:00.000Z",
      "droppedAt": null
    }
  ]
}
```

#### `GET /api/courses/:courseId/sessions`

- **Roles:** admin, assigned teacher.
- **Database:** replica.
- **Rate limit:** `read.user`.
- **Query:** `?from=2026-07-01T00:00:00Z&to=2026-12-31T23:59:59Z&cursor=&limit=`.
- **Response:** saved and draft sessions with `id`, `startsAt`, `topic`, `savedAt`, `version`, and present/absent totals. Draft sessions have `savedAt: null`.

### 5.3 Create a session

#### `POST /api/courses/:courseId/sessions`

- **Roles:** admin, assigned teacher.
- **Database:** primary.
- **Rate limit:** `attendance.write.user`.
- **Body:**

```json
{
  "startsAt": "2026-11-20T09:30:00+05:30",
  "topic": "Query planning"
}
```

- **Rules:** course exists and is not archived; teacher owns it; `startsAt` is valid and not in the far future; `topic` is optional, max 200 characters; uniqueness is `(courseId, startsAt)`.
- **Success:** `201 Created` with the session object.
- **Errors:** `409 CONFLICT` if the same course/start time exists; `422 VALIDATION_ERROR`.

### 5.4 Editable session detail

#### `GET /api/sessions/:sessionId`

- **Roles:** admin, assigned teacher.
- **Database:** **primary**; this is an edit view and must not use a lagging replica.
- **Rate limit:** `read.user`.
- **Response:**

```json
{
  "session": {
    "id": "uuid",
    "courseId": "uuid",
    "startsAt": "2026-11-20T09:30:00+05:30",
    "topic": "Query planning",
    "version": 4,
    "savedAt": "2026-11-20T10:05:00.000Z",
    "roster": [
      { "id": "uuid", "fullName": "Kabir Rao", "rollNumber": "CE04" }
    ],
    "records": [
      { "studentId": "uuid", "status": "present" }
    ]
  }
}
```

- **Notes:** `roster` is the enrollment window at `startsAt`. `records` may be empty for a draft. `version` is the value the client must send back when saving.

### 5.5 Save attendance

#### `PUT /api/sessions/:sessionId/attendance`

- **Roles:** assigned teacher only. Admins can view but cannot mark.
- **Database:** primary, single transaction.
- **Rate limit:** `attendance.write.user`.
- **Body:**

```json
{
  "version": 4,
  "records": [
    { "studentId": "uuid-1", "status": "present" },
    { "studentId": "uuid-2", "status": "absent" }
  ]
}
```

- **Rules:**
  - The session exists and belongs to a course owned by the teacher.
  - `version` is the latest version the client loaded.
  - Every student in the roster at `startsAt` appears exactly once.
  - No unknown, duplicate, or not-enrolled student IDs.
  - Statuses are only `present` or `absent`.
  - `markedBy` is the authenticated teacher; the client cannot supply it.
- **Success:** `200 OK` with the canonical session, incremented `version`, and `savedAt`.
- **Errors:**
  - `409 CONFLICT` with `details.currentVersion` if another device saved first.
  - `422 VALIDATION_ERROR` for incomplete or invalid records.
  - `403 FORBIDDEN` for an admin or a teacher who does not own the course.
- **Concurrency:** the update uses `WHERE id = ? AND version = ?`; a loser cannot overwrite a winner. See `database.md`.

### 5.6 Student attendance

#### `GET /api/students/me/attendance`

- **Roles:** student only.
- **Database:** replica.
- **Rate limit:** `read.user`.
- **Response:** course summaries with `course`, `presentSessions`, `savedSessions`, `attendancePercent`, and `dataAsOf`.

#### `GET /api/students/:studentId/attendance`

- **Roles:** admin; teacher only for students enrolled in the teacher's courses.
- **Database:** replica.
- **Rate limit:** `read.user`.
- **Response:** same shape as the student self-view, scoped to the requesting user's permissions.

### 5.7 Reports

#### `GET /api/reports/courses/:courseId/summary`

- **Roles:** admin; assigned teacher.
- **Database:** replica.
- **Rate limit:** `report.read.user`.
- **Response:**

```json
{
  "courseId": "uuid",
  "savedSessions": 18,
  "students": [
    {
      "studentId": "uuid",
      "fullName": "Kabir Rao",
      "rollNumber": "CE04",
      "presentSessions": 15,
      "countedSessions": 18,
      "attendancePercent": 83.3
    }
  ],
  "trend": [
    { "sessionId": "uuid", "startsAt": "2026-11-01T09:30:00.000Z", "present": 41, "absent": 1 }
  ],
  "dataAsOf": "2026-11-20T10:06:12.000Z",
  "replicaLagMs": 420
}
```

- **Rules:** only saved sessions count. A student's denominator is the number of saved sessions inside their enrollment window. Zero counted sessions returns `attendancePercent: null`. `trend` lists every saved session oldest first with present/absent counts; the per-session percentage is `present / (present + absent)`.
- **Notes:** the UI displays `dataAsOf`; it must not claim the report is live.

#### `GET /api/reports/institution`

- **Roles:** admin.
- **Database:** replica.
- **Rate limit:** `report.read.user`.
- **Response:** role/user counts, course counts (total/archived), institution-wide present/absent totals across saved sessions, and a per-course breakdown (`id`, `code`, `savedSessions`, `present`, `absent`), plus `dataAsOf` and `replicaLagMs`.
- **Errors:** `403 FORBIDDEN` for non-admins.

### 5.8 Admin users

#### `GET /api/admin/users`

- **Roles:** admin.
- **Database:** replica.
- **Rate limit:** `read.user`.
- **Query:** `?role=student&active=true&cursor=&limit=`.
- **Response:** paginated user list without password hashes.

#### `POST /api/admin/users`

- **Roles:** admin.
- **Database:** primary.
- **Rate limit:** `admin.write.user`.
- **Body:**

```json
{
  "email": "new.student@example.edu",
  "fullName": "New Student",
  "role": "student",
  "temporaryPassword": "temporary-secret-123"
}
```

- **Rules:** unique email; role is `admin`, `teacher`, or `student`; temporary password is hashed with Argon2id and `must_change_password = true`; no public registration.
- **Success:** `201 Created`.
- **Errors:** `409 CONFLICT` for an existing email; `422 VALIDATION_ERROR`.

#### `PATCH /api/admin/users/:userId`

- **Roles:** admin.
- **Database:** primary.
- **Rate limit:** `admin.write.user`.
- **Body:** any of `{ "fullName", "role", "isActive", "temporaryPassword" }`.
- **Rules:** if `temporaryPassword` is supplied, hash it and set `must_change_password = true`. Do not allow deactivating or demoting the last active admin. Do not allow an admin to deactivate their own account if it would leave no active admin.
- **Success:** `200 OK` with the updated user.
- **Errors:** `409 CONFLICT` for the last-admin rule; `422 VALIDATION_ERROR`.

### 5.9 Admin courses and enrollments

#### `POST /api/admin/courses`

- **Roles:** admin.
- **Database:** primary.
- **Rate limit:** `admin.write.user`.
- **Body:** `{ "code": "CS301", "title": "Database Systems", "term": "2026-27 Semester 1", "teacherId": "uuid" }`.
- **Rules:** unique code; teacher exists and has role `teacher`; course starts non-archived.
- **Success:** `201 Created`.

#### `PATCH /api/admin/courses/:courseId`

- **Roles:** admin.
- **Database:** primary.
- **Rate limit:** `admin.write.user`.
- **Body:** any of `{ "title", "term", "teacherId", "isArchived" }`.
- **Rules:** cannot archive a course with an attendance save in progress; archiving hides it from active lists but keeps reports.
- **Success:** `200 OK`.

#### `POST /api/admin/courses/:courseId/enrollments`

- **Roles:** admin.
- **Database:** primary.
- **Rate limit:** `admin.write.user`.
- **Body:**

```json
{
  "action": "enroll",
  "studentIds": ["uuid-1", "uuid-2"]
}
```

- **Rules:** action is `enroll` or `drop`; all IDs must be active students; enroll clears `dropped_at` and sets `enrolled_at = now()` if the row exists; drop sets `dropped_at = now()`.
- **Success:** `200 OK` with the affected enrollments.
- **Errors:** `422 VALIDATION_ERROR` for non-students or unknown IDs.

### 5.10 Health

#### `GET /api/health`

- **Roles:** public.
- **Database:** none; liveness only.
- **Rate limit:** `global.ip`.
- **Response:** `200 { "status": "ok" }`.
- **Rule:** do not expose database hostnames, versions, connection state, or error details.

## 6. Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Missing, expired, or invalid session |
| `INVALID_CREDENTIALS` | 401 | Login or password-change credentials are wrong |
| `PASSWORD_CHANGE_REQUIRED` | 403 | User must change a temporary password first |
| `FORBIDDEN` | 403 | Role or relationship check failed |
| `NOT_FOUND` | 404 | Resource does not exist or is outside the caller's scope |
| `CONFLICT` | 409 | Unique constraint or optimistic version conflict |
| `VALIDATION_ERROR` | 422 | Invalid, missing, unknown, or duplicate input |
| `RATE_LIMITED` | 429 | Rate limit exceeded; see `Retry-After` |
| `SERVICE_UNAVAILABLE` | 503 | Primary, replica, or rate-limiter outage |

Use `404` instead of `403` when revealing that a resource exists would leak another user's data. Use `403` when the resource is known but the action is not allowed.

## 7. Rate-Limit Headers

| Header | Meaning |
|---|---|
| `RateLimit-Limit` | Requests allowed in the current window |
| `RateLimit-Remaining` | Requests remaining |
| `RateLimit-Reset` | Seconds until the window resets |
| `Retry-After` | Seconds to wait before retrying; present on `429` |

Policy values and failure behavior are in `rate-limiting.md`.

## 8. Examples

### 429 response

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 42
RateLimit-Limit: 30
RateLimit-Remaining: 0
RateLimit-Reset: 42
```

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Try again in 42 seconds.",
    "details": { "retryAfter": 42 }
  }
}
```

### 409 attendance conflict

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "This session changed on another device. Reload before saving.",
    "details": { "currentVersion": 5 }
  }
}
```

The UI must preserve the teacher's marks, show the conflict, and offer a reload. It must not silently overwrite the newer version.

## 9. Security Checklist for Every New Endpoint

- [ ] Authenticated except explicitly public routes.
- [ ] Role and relationship authorization in the service layer.
- [ ] `must_change_password` gate.
- [ ] Rate-limit policy assigned.
- [ ] Zod schema with unknown-field rejection.
- [ ] Primary or replica target justified.
- [ ] Actor derived from the session, never the body.
- [ ] No PII in logs.
- [ ] Standard error envelope.
- [ ] Integration test for 401, 403, 422, and 429 where applicable.
