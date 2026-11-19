import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { auth } from "@/auth";
import { ApiError, apiErrors } from "@/lib/errors";
import { checkLimit, clientIp, type LimitResult, type PolicyId } from "@/lib/rate-limit";
import type { ReadMeta } from "@/lib/db";
import type { Role, SessionUser } from "@/lib/types";

type Params = Record<string, string | string[]>;
type Handler = (req: NextRequest, ctx: { user: SessionUser | null; params: Params }) => Promise<Response>;

export function withApi(
  options: { policy?: PolicyId; roles?: Role[]; anonymous?: boolean; allowPasswordChange?: boolean },
  handler: Handler,
) {
  return async (req: NextRequest, context: { params: Promise<Params> }): Promise<Response> => {
    const headers = new Headers();
    let activeLimit: LimitResult | null = null;

    try {
      const global = await checkLimit("global.ip", clientIp(req.headers));
      applyLimitHeaders(headers, global);
      if (!global.allowed) return rateLimited(global, headers);

      let user: SessionUser | null = null;
      if (!options.anonymous) {
        const session = await auth();
        if (!session?.user?.id) throw apiErrors.unauthenticated();

        user = {
          id: session.user.id,
          email: session.user.email ?? "",
          fullName: session.user.fullName,
          role: session.user.role,
          mustChangePassword: session.user.mustChangePassword,
        };

        if (user.mustChangePassword && !options.allowPasswordChange) {
          throw new ApiError(403, "PASSWORD_CHANGE_REQUIRED", "Change your temporary password before continuing.");
        }
        if (options.roles && !options.roles.includes(user.role)) {
          throw apiErrors.forbidden();
        }

        if (options.policy) {
          activeLimit = await checkLimit(options.policy, user.id);
          applyLimitHeaders(headers, activeLimit);
          if (activeLimit.unavailable && activeLimit.allowed && !isGlobalPolicy(options.policy)) {
            console.warn("rate_limit_fail_open", options.policy);
          }
          if (!activeLimit.allowed) return rateLimited(activeLimit, headers);
        }
      }

      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) assertOrigin(req);

      const params = context?.params ? await context.params : {};
      const response = await handler(req, { user, params });
      headers.forEach((value, key) => response.headers.set(key, value));
      return response;
    } catch (error) {
      return errorResponse(error, headers, req.nextUrl.pathname);
    }
  };
}

function isGlobalPolicy(policy: PolicyId) {
  return policy === "global.ip";
}

function applyLimitHeaders(headers: Headers, result: LimitResult | null) {
  if (!result || result.skipped) return;
  headers.set("RateLimit-Limit", String(result.limit));
  headers.set("RateLimit-Remaining", String(result.remaining));
  headers.set("RateLimit-Reset", String(result.resetSeconds));
}

function rateLimited(result: LimitResult, headers: Headers) {
  headers.set("Retry-After", String(result.resetSeconds));
  return errorResponse(
    new ApiError(429, "RATE_LIMITED", `Too many requests. Try again in ${result.resetSeconds} seconds.`, {
      retryAfter: result.resetSeconds,
    }),
    headers,
  );
}

function assertOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) throw apiErrors.forbidden("Missing request origin.");

  const allowed = new Set<string>([req.nextUrl.origin]);
  for (const value of [process.env.AUTH_URL, process.env.NEXT_PUBLIC_APP_URL]) {
    if (!value) continue;
    try {
      allowed.add(new URL(value).origin);
    } catch {
      // Ignore a malformed configured URL; same-origin still works.
    }
  }
  if (!allowed.has(origin)) throw apiErrors.forbidden("Request origin is not allowed.");
}

function errorResponse(error: unknown, headers: Headers, path = "") {
  let apiError: ApiError;

  if (error instanceof ApiError) {
    apiError = error;
  } else if (error instanceof ZodError) {
    apiError = new ApiError(422, "VALIDATION_ERROR", "Check the highlighted fields.", error.flatten());
  } else {
    const source = (typeof error === "object" && error !== null ? error : {}) as {
      code?: string;
      cause?: { code?: string };
    };
    const code = source.code ?? source.cause?.code ?? "";
    if (code === "23505") {
      apiError = apiErrors.conflict("That value already exists.");
    } else if (code === "23503") {
      apiError = apiErrors.validation("A referenced record does not exist.");
    } else if (code === "22P02") {
      apiError = apiErrors.validation("One of the identifiers is not valid.");
    } else if (["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "57P01", "08001", "08006"].includes(code)) {
      apiError = new ApiError(503, "SERVICE_UNAVAILABLE", "The service is temporarily unavailable. Try again shortly.");
    } else {
      console.error("api_error", path || "-", error instanceof Error ? error.name : "unknown", code || "-");
      if (process.env.PGLITE === "1") {
        // Dev database only: show why a query failed.
        console.error("api_error_detail", error instanceof Error ? error.message : String(error));
        if (error instanceof Error && error.cause instanceof Error && error.cause.message) {
          console.error("api_error_cause", error.cause.message);
        }
      }
      apiError = new ApiError(500, "INTERNAL_ERROR", "Something went wrong.");
    }
  }

  return NextResponse.json(
    { error: { code: apiError.code, message: apiError.message, details: apiError.details ?? {} } },
    { status: apiError.status, headers },
  );
}

export function json(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, init);
}

export function readJson(body: unknown, meta: ReadMeta, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("X-Data-Source", meta.source);
  if (meta.replicaLagMs != null) headers.set("X-Replica-Lag-Ms", String(meta.replicaLagMs));
  return NextResponse.json(body, { ...init, headers });
}
