import { z } from "zod";
import { apiErrors } from "@/lib/errors";

const password = z.string().min(12, "Use at least 12 characters.").max(128, "Use at most 128 characters.");
const name = z.string().trim().min(1, "Required.").max(200);
const isoDateTime = z.string().datetime({ offset: true, message: "Use an ISO 8601 date and time." });

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: password,
  })
  .strict();

export const createUserSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(320),
    fullName: name,
    role: z.enum(["admin", "teacher", "student"]),
    temporaryPassword: password,
    rollNumber: z.string().trim().max(40).optional().nullable(),
  })
  .strict();

export const patchUserSchema = z
  .object({
    fullName: name.optional(),
    role: z.enum(["admin", "teacher", "student"]).optional(),
    isActive: z.boolean().optional(),
    temporaryPassword: password.optional(),
    rollNumber: z.string().trim().max(40).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update." });

export const createCourseSchema = z
  .object({
    code: z.string().trim().min(1).max(40),
    title: name,
    term: z.string().trim().min(1).max(100),
    teacherId: z.string().uuid(),
  })
  .strict();

export const patchCourseSchema = z
  .object({
    title: name.optional(),
    term: z.string().trim().min(1).max(100).optional(),
    teacherId: z.string().uuid().optional(),
    isArchived: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update." });

export const enrollmentSchema = z
  .object({
    action: z.enum(["enroll", "drop"]),
    studentIds: z
      .array(z.string().uuid())
      .min(1)
      .max(200)
      .refine((ids) => new Set(ids).size === ids.length, "Duplicate student IDs."),
  })
  .strict();

export const createSessionSchema = z
  .object({
    startsAt: isoDateTime,
    topic: z.string().trim().max(200).optional(),
  })
  .strict();

export const attendanceSchema = z
  .object({
    version: z.number().int().min(1),
    records: z
      .array(
        z
          .object({
            studentId: z.string().uuid(),
            status: z.enum(["present", "absent"]),
          })
          .strict(),
      )
      .min(1)
      .max(1000)
      .refine((records) => new Set(records.map((r) => r.studentId)).size === records.length, "Duplicate student IDs."),
  })
  .strict();

const cursor = z.string().max(500).optional();
const limit = z.coerce.number().int().min(1).max(100).default(25);

export const courseListQuery = z.object({
  includeArchived: z.enum(["true", "false"]).optional(),
  cursor,
  limit,
});

export const sessionListQuery = z.object({
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
  cursor,
  limit,
});

export const adminUsersQuery = z.object({
  role: z.enum(["admin", "teacher", "student"]).optional(),
  active: z.enum(["true", "false"]).optional(),
  cursor,
  limit,
});

export async function parseBody<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<z.output<S>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw apiErrors.validation("Request body must be valid JSON.");
  }
  return schema.parse(json) as z.output<S>;
}

export function parseQuery<S extends z.ZodTypeAny>(req: Request, schema: S): z.output<S> {
  return schema.parse(Object.fromEntries(new URL(req.url).searchParams)) as z.output<S>;
}

export const uuidSchema = z.string().uuid();
