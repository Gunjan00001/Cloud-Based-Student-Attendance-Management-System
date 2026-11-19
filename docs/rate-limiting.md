# Rate Limiting Design

**Parent design:** [`design.md`](./design.md)
**API contract:** [`api.md`](./api.md)
**Status:** Design contract. Not implemented.

## 1. Goals

- Protect login from credential stuffing and brute force.
- Protect attendance writes and report queries from accidental or malicious floods.
- Keep counters correct across serverless instances.
- Preserve access for legitimate users behind a shared school NAT.
- Fail predictably when Redis is unavailable.
- Give clients enough information to wait and retry safely.

## 2. Non-Goals

- Absorbing a volumetric DDoS attack. The CDN/WAF owns that layer.
- Client-side enforcement. The browser may show a countdown, but the server decides.
- Billing quotas or fair-use plans.
- Replacing authentication, authorization, validation, or database constraints.
- Account lockout. Lockout creates a denial-of-service lever; per-email login limits are enough for v1.

## 3. Topology

```text
Browser
  │
  ▼
CDN/WAF ── coarse IP limit, bot rules, TLS
  │
  ▼
Next.js API route
  ├─ Auth.js authorize (login only) ── Redis: auth.login.ip, auth.login.email
  └─ withApi wrapper
       ├─ verify session
       ├─ check role / relationship
       ├─ Redis: policy for this route
       └─ handler
```

- **CDN/WAF:** a coarse limit (for example, 1,000 requests per minute per IP) and bot protection. It is not aware of authenticated users.
- **Application limiter:** per-IP for login, per-user for authenticated routes.
- **Redis:** Upstash Redis in the reference deployment. HTTP-based, so it works from serverless functions.
- **Source of truth:** Redis. In-memory counters are not authoritative because serverless instances are ephemeral and distributed.

## 4. Algorithm

The reference algorithm is an **exact sliding-window log** using a Redis sorted set. It is stricter and easier to reason about than a fixed window, which allows a burst at the boundary.

For each key:

1. Remove entries older than `now - window`.
2. Count the remaining entries.
3. If `count >= limit`, reject and compute the wait time from the oldest entry.
4. Otherwise add a unique request member with the current timestamp.
5. Set the key's TTL to at least the window.

The whole operation must be atomic. Use a Lua script that reads Redis server time, not the application clock:

```lua
-- KEYS[1] = rate-limit key
-- ARGV[1] = window in milliseconds
-- ARGV[2] = limit
-- ARGV[3] = unique request id
local key = KEYS[1]
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local member = ARGV[3]

local t = redis.call("TIME")
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)

redis.call("ZREMRANGEBYSCORE", key, "-inf", now - window)
local count = redis.call("ZCARD", key)

if count >= limit then
  local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
  local reset = window
  if oldest[2] then
    reset = math.max(1, window - (now - tonumber(oldest[2])))
  end
  return { 0, 0, reset }
end

redis.call("ZADD", key, now, member)
redis.call("PEXPIRE", key, window + 1000)

return { 1, limit - count - 1, window }
```

Notes:

- The unique member is a random request ID (`crypto.randomUUID()`); do not use the timestamp alone because two requests can share a millisecond.
- `PEXPIRE` slightly exceeds the window so cleanup does not race the last request.
- The sorted set stays bounded by the policy limit, because requests are rejected before insertion when the limit is reached.
- Upstash's built-in `slidingWindow` limiter is an approximation that weights the previous window; it is acceptable for a lower-cost v1, but this design uses the exact log. If the approximation is used, document the choice and keep the same policy table and headers.
- Do not use a fixed-window counter: it allows a burst of up to twice the limit around a window boundary.

## 5. Keys and Identity

Key format:

```text
rl:{policy}:{hmac_sha256(identity)}
```

- `policy` is one of the policy IDs below.
- `identity` is:
  - the verified user ID for authenticated routes;
  - the platform-provided client IP for unauthenticated routes;
  - the normalized email for `auth.login.email`, hashed with HMAC.
- Use `RATE_LIMIT_KEY_SECRET` for HMAC-SHA256. Never store raw emails or IP addresses in Redis keys.
- Normalize email first: trim, lowercase, collapse whitespace. Hash only after normalization.
- Do not trust a client-supplied `X-Forwarded-For`. Read the IP from the trusted platform header or the connection metadata configured for the deployment. Document that proxy setting.
- For authenticated routes, never key only by IP; a shared NAT would punish an entire lab. Use the user ID.

## 6. Policies

| Policy ID | Limit | Window | Identity | Routes | Failure |
|---|---|---|---|---|---|
| `global.ip` | 600 requests | 1 minute | Client IP | All `/api/*`, including health | Fail open |
| `auth.login.ip` | 60 requests | 1 minute | Client IP | Auth.js sign-in | Fail closed |
| `auth.login.email` | 5 requests | 15 minutes | Normalized email HMAC | Auth.js sign-in | Fail closed |
| `auth.password.user` | 5 requests | 1 hour | User ID | `POST /api/me/password` | Fail closed |
| `read.user` | 120 requests | 1 minute | User ID | Course/roster/session lists, `GET /api/me`, admin lists | Fail open |
| `attendance.write.user` | 30 requests | 1 minute | User ID | Session creation, attendance save | Fail open |
| `report.read.user` | 30 requests | 1 minute | User ID | Report summary | Fail open |
| `admin.write.user` | 60 requests | 1 minute | User ID | Admin user/course/enrollment mutations | Fail open |

### Why these values

- **Login per IP is 60/min, not 5/min.** A 40-student lab can log in from one NAT address. The per-email limit of 5/15 minutes stops brute force against a single account without locking out the room.
- **Global IP is high.** It catches obvious floods, not normal shared-network traffic.
- **Reports are stricter than lists.** Report queries aggregate and are the most expensive read path.
- **Attendance writes are stricter than reads.** A teacher saves once per session; 30/min is generous for normal use and limits scripted writes.
- **Password changes are rare.** Five per hour is enough, and failing closed prevents a Redis outage from removing a sensitive-route guard.

## 7. Placement and Order

### Login

1. Resolve the trusted client IP.
2. Check `global.ip` (fail open).
3. Check `auth.login.ip` (fail closed).
4. Normalize and hash the email; check `auth.login.email` (fail closed).
5. Verify the Argon2id hash.
6. Return a generic `401` for a bad email or password; do not reveal which was wrong.

Rate limits run before password verification so expensive hashing and database lookups are not used as a denial-of-service amplifier.

### Authenticated routes

The `withApi` wrapper order:

1. Verify the Auth.js session.
2. Reject inactive users and `must_change_password` users (except the password-change route).
3. Authorize role and resource relationship.
4. Apply the route's rate-limit policy.
5. Validate the body/query with Zod.
6. Execute on the documented database.

Using the user ID after authentication prevents unauthenticated traffic from consuming a user's quota and keeps the identity stable across IP changes.

### Password change

- `auth.password.user` with fail-closed behavior.
- Also apply `global.ip` before authentication.
- On success, clear `must_change_password`; the client signs out and back in.

## 8. Response Contract

On rejection:

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

- `Retry-After` is an integer number of seconds, minimum 1.
- `RateLimit-Reset` is the seconds until the oldest request leaves the window.
- On allowed requests, return the same rate-limit headers with the remaining count.
- The UI shows a countdown and disables the action until reset. It does not retry automatically.
- Do not log the raw identity, email, or full IP. Log the policy ID, hashed key prefix, and outcome.

## 9. Failure Behavior

| Condition | Behavior | User sees |
|---|---|---|
| Redis timeout on login | Fail closed | `503 SERVICE_UNAVAILABLE`, not a password error |
| Redis timeout on authenticated read | Fail open; increment warning metric | Normal response, possibly slower |
| Redis timeout on attendance write | Fail open; increment warning metric | Normal write; database constraints still protect integrity |
| Redis timeout on admin write | Fail open; increment warning metric | Normal write; authorization still applies |
| Redis down, password change | Fail closed | `503`; try later |
| Redis down, report | Fail open | Normal report, alert fires |

Why the split:

- Login and password changes are credential paths; a limiter outage must not remove brute-force protection.
- Reads and writes still have authentication, authorization, database constraints, and unique keys. Failing open preserves a usable attendance register during a rate-limiter outage.
- Every fail-open event is logged and alerted so the outage is visible.

## 10. Trusted IP Resolution

- On Vercel, use the platform-provided forwarded IP header documented for the deployment; do not trust arbitrary client headers.
- If Cloudflare is in front, configure the app to trust only Cloudflare's proxy range and use the header Cloudflare sets.
- Reject requests with ambiguous or missing IP data on the login route, or key them under a shared `unknown` bucket with a stricter limit.
- Never use `req.headers.get("x-forwarded-for")` directly as a trusted value.
- Preserve IPv6 handling; normalize IPv4-mapped IPv6 addresses to a single representation.

## 11. Observability

Metrics:

- Allowed and blocked counts per policy.
- Rate-limiter latency (p50, p95, p99).
- Redis errors and timeouts.
- `429` rate by route and policy.
- Login failures by IP/email bucket (aggregated, no PII).
- Fail-open events.

Alerts:

- Redis error rate above 5% for five minutes.
- Login `429` rate above 10% for ten minutes (possible attack or too-strict NAT limit).
- Any sustained fail-open on password change.
- Replica lag is not a rate-limit metric; monitor it separately.

## 12. Runbook

### Redis is down

1. Confirm with Upstash status and the app metric.
2. Login and password change return `503`; communicate a maintenance notice if prolonged.
3. Authenticated routes fail open; watch primary write load.
4. Restore Redis; verify counters resume.
5. Post-incident: check whether the fail-open window allowed abuse.

### Unexpected 429 surge

1. Break down by policy and route.
2. If `auth.login.ip` is high with many emails, treat it as credential stuffing; consider a temporary WAF rule.
3. If one user is high, inspect account activity; do not raise the global limit blindly.
4. If a school lab is locked out of login, verify the per-IP limit and consider a temporary allowlist for that network.

### Shared-NAT lockout

1. Compare `auth.login.ip` blocks with normal class start times.
2. Raise the per-IP login limit only with evidence; keep the per-email limit.
3. Prefer per-user limits after authentication.
4. Document the change in this file and the design.

### Compromised account

1. Deactivate the user (effective at next token refresh, at most 8 hours).
2. Tighten the user's rate-limit key or block the account at the WAF.
3. Rotate the password and `must_change_password`.
4. Review audit events and attendance changes.
5. For immediate global invalidation, rotate `AUTH_SECRET`; this signs out everyone.

## 13. Testing

- Burst over the limit returns `429` with correct headers.
- A request exactly at the limit is allowed; the next is rejected.
- Different users have independent keys.
- Different policies for the same user are independent.
- Email normalization maps `User@Example.edu` and `user@example.edu` to the same bucket.
- A shared IP can log in multiple students under the per-IP limit.
- The per-email limit still blocks repeated failures for one account.
- Login fail-closed path returns `503` when Redis is unavailable.
- Authenticated route fail-open path returns the normal response and emits a warning metric.
- Redis server time is used; changing the application clock does not bypass the window.
- The Lua script is atomic under concurrent requests.
- Password change is limited by `auth.password.user`.
- Rate-limit headers do not leak raw identity.

## 14. References

- Upstash Rate Limit overview: https://upstash.com/docs/redis/sdks/ratelimit-ts/overview
- Upstash Rate Limit algorithms: https://upstash.com/docs/redis/sdks/ratelimit-ts/algorithms
- Redis sorted sets: https://redis.io/docs/latest/develop/data-types/sorted-sets/
- Redis Lua scripting: https://redis.io/docs/latest/develop/interact/programmability/eval-intro/
- IETF RateLimit header fields: https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/
