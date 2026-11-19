import { eq } from "drizzle-orm";
import { auditEvents, users } from "@/db/schema";
import { withApi } from "@/lib/api";
import { writeDb } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { hashPassword, verifyPassword } from "@/lib/password";
import { parseBody, passwordChangeSchema } from "@/lib/validation";

export const runtime = "nodejs";

export const POST = withApi(
  { policy: "auth.password.user", allowPasswordChange: true },
  async (req, { user }) => {
    const body = await parseBody(req, passwordChangeSchema);
    if (!user) throw new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.");

    const [row] = await writeDb.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!row || !row.isActive) throw new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.");

    const valid = await verifyPassword(row.passwordHash, body.currentPassword);
    if (!valid) throw new ApiError(401, "INVALID_CREDENTIALS", "The current password is incorrect.");

    const passwordHash = await hashPassword(body.newPassword);
    await writeDb
      .update(users)
      .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    await writeDb.insert(auditEvents).values({
      actorId: user.id,
      action: "user.password_changed",
      entityType: "user",
      entityId: user.id,
      after: {},
    });

    return new Response(null, { status: 204 });
  },
);
