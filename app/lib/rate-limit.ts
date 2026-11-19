import { createHmac, randomUUID } from "node:crypto";

export type PolicyId =
  | "global.ip"
  | "auth.login.ip"
  | "auth.login.email"
  | "auth.password.user"
  | "read.user"
  | "attendance.write.user"
  | "report.read.user"
  | "admin.write.user";

type Policy = { limit: number; windowMs: number; failClosed: boolean };

export const POLICIES: Record<PolicyId, Policy> = {
  "global.ip": { limit: 600, windowMs: 60_000, failClosed: false },
  "auth.login.ip": { limit: 60, windowMs: 60_000, failClosed: true },
  "auth.login.email": { limit: 5, windowMs: 15 * 60_000, failClosed: true },
  "auth.password.user": { limit: 5, windowMs: 60 * 60_000, failClosed: true },
  "read.user": { limit: 120, windowMs: 60_000, failClosed: false },
  "attendance.write.user": { limit: 30, windowMs: 60_000, failClosed: false },
  "report.read.user": { limit: 30, windowMs: 60_000, failClosed: false },
  "admin.write.user": { limit: 60, windowMs: 60_000, failClosed: false },
};

export type LimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
  skipped?: boolean;
  unavailable?: boolean;
};

// Exact sliding-window log. Time comes from Redis, not the app clock.
const SLIDING_WINDOW_LUA = `
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
`;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase().replace(/\s+/g, "");
}

export function hashIdentity(identity: string, secret: string): string {
  return createHmac("sha256", secret).update(identity).digest("hex");
}

export function buildKey(policy: PolicyId, identity: string, secret: string): string {
  return `rl:${policy}:${hashIdentity(identity, secret)}`;
}

export function clientIp(headers: Headers): string {
  // These headers are set by the hosting proxy (Vercel/Cloudflare). Do not
  // accept a bare X-Forwarded-For from arbitrary clients in production.
  const value =
    headers.get("x-vercel-forwarded-for") ||
    headers.get("cf-connecting-ip") ||
    headers.get("x-real-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0];
  const ip = value?.trim();
  if (!ip) return "unknown";
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

export async function checkLimit(policyId: PolicyId, identity: string): Promise<LimitResult> {
  const policy = POLICIES[policyId];
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const secret = process.env.RATE_LIMIT_KEY_SECRET;

  // Local/practice runs have no Redis. Production sets both values and the
  // limiter is enforced.
  if (!url || !token) {
    return { allowed: true, limit: policy.limit, remaining: policy.limit, resetSeconds: 0, skipped: true };
  }

  if (!secret) {
    console.error("rate_limit_config", "RATE_LIMIT_KEY_SECRET is missing");
    return { allowed: false, limit: policy.limit, remaining: 0, resetSeconds: 60, unavailable: true };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["EVAL", SLIDING_WINDOW_LUA, "1", buildKey(policyId, identity, secret), policy.windowMs, policy.limit, randomUUID()]),
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`upstash_${response.status}`);
    const payload = (await response.json()) as { result?: unknown } | unknown[];
    const result = (Array.isArray(payload) ? payload : payload.result) as Array<number | string>;
    const allowed = Number(result?.[0]) === 1;
    return {
      allowed,
      limit: policy.limit,
      remaining: Math.max(0, Number(result?.[1] ?? 0)),
      resetSeconds: Math.max(1, Math.ceil(Number(result?.[2] ?? policy.windowMs) / 1000)),
    };
  } catch (error) {
    console.error("rate_limit_unavailable", policyId, error instanceof Error ? error.message : "unknown");
    return {
      allowed: !policy.failClosed,
      limit: policy.limit,
      remaining: 0,
      resetSeconds: 60,
      unavailable: true,
    };
  }
}
