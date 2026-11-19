import { and, eq, ne, sql } from "drizzle-orm";
import { auditEvents, users } from "@/db/schema";
import { json, withApi } from "@/lib/api";
import { writeDb } from "@/lib/db";
import { apiErrors } from "@/lib/errors";
import { hashPassword } from "@/lib/password";
import type { SessionUser } from "@/lib/types";
import { parseBody, patchUserSchema, uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

export const PATCH = withApi({ policy: "admin.write.user", roles: ["admin"] }, async (req, { user, params }) => {
  const userId = uuidSchema.parse(params.userId);
  const body = await parseBody(req, patchUserSchema);

  const [current] = await writeDb.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!current) throw apiErrors.notFound("User not found.");

  const wouldRemoveAdmin =
    current.role === "admin" &&
    current.isActive &&
    ((body.role !== undefined && body.role !== "admin") || body.isActive === false);

  if (wouldRemoveAdmin) {
    const [otherAdmins] = await writeDb
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.isActive, true), ne(users.id, userId)));
    if (Number(otherAdmins?.count ?? 0) === 0) {
      throw apiErrors.conflict("At least one active admin must remain.");
    }
  }

  const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (body.fullName !== undefined) updates.fullName = body.fullName;
  if (body.role !== undefined) updates.role = body.role;
  if (body.isActive !== undefined) updates.isActive = body.isActive;
  if (body.rollNumber !== undefined) updates.rollNumber = body.rollNumber || null;
  if (body.temporaryPassword !== undefined) {
    updates.passwordHash = await hashPassword(body.temporaryPassword);
    updates.mustChangePassword = true;
  }

  const [updated] = await writeDb.update(users).set(updates).where(eq(users.id, userId)).returning();

  const safeBefore = {
    fullName: current.fullName,
    role: current.role,
    isActive: current.isActive,
    rollNumber: current.rollNumber,
  };
  const safeAfter = {
    fullName: updated.fullName,
    role: updated.role,
    isActive: updated.isActive,
    rollNumber: updated.rollNumber,
  };

  await writeDb.insert(auditEvents).values({
    actorId: (user as SessionUser).id,
    action: "admin.user_updated",
    entityType: "user",
    entityId: userId,
    before: safeBefore,
    after: { ...safeAfter, passwordReset: body.temporaryPassword !== undefined },
  });

  return json({
    user: {
      id: updated.id,
      email: updated.email,
      fullName: updated.fullName,
      rollNumber: updated.rollNumber,
      role: updated.role,
      isActive: updated.isActive,
      mustChangePassword: updated.mustChangePassword,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    },
  });
});
