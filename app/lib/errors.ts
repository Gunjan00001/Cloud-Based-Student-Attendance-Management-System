export type ErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_CREDENTIALS"
  | "PASSWORD_CHANGE_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const apiErrors = {
  unauthenticated: () => new ApiError(401, "UNAUTHENTICATED", "Sign in to continue."),
  forbidden: (message = "You do not have access to this resource.") => new ApiError(403, "FORBIDDEN", message),
  notFound: (message = "Not found.") => new ApiError(404, "NOT_FOUND", message),
  conflict: (message: string, details?: unknown) => new ApiError(409, "CONFLICT", message, details),
  validation: (message: string, details?: unknown) => new ApiError(422, "VALIDATION_ERROR", message, details),
};
