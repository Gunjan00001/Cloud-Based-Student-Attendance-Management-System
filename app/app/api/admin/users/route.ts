import { and, asc, eq, gt } from "drizzle-orm";
import { auditEvents, users } from "@/db/schema";
import { json, readJson, withApi } from "@/lib/api";
import { decodeCursor, encodeCursor } from "@/lib/cursor";
import { read, writeDb } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import type { SessionUser } from "@/lib/types";
import { adminUsersQuery, createUserSchema, parseBody, parseQuery } from "@/lib/validation";

export const runtime = "nodejs";

export const GET = withApi({ policy: "read.user", roles: ["admin"] }, async (req) => {
  const query = parseQuery(req, adminUsersQuery);
  const cursor = decodeCursor<{ email: string }>(query.cursor);

  const { data, meta } = await read((db) =>
    db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        rollNumber: users.rollNumber,
        role: users.role,
        isActive: users.isActive,
        mustChangePassword: users.mustChangePassword,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(
        and(
          query.role ? eq(users.role, query.role) : undefined,
          query.active ? eq(users.isActive, query.active === "true") : undefined,
          cursor ? gt(users.email, cursor.email) : undefined,
        ),
      )
      .orderBy(asc(users.email))
      .limit(query.limit + 1),
  );

  const rows = data.slice(0, query.limit);
  const last = rows[rows.length - 1];
  return readJson(
    {
      users: rows,
      nextCursor: data.length > query.limit && last ? encodeCursor({ email: last.email }) : null,
    },
    meta,
  );
});

export const POST = withApi({ policy: "admin.write.user", roles: ["admin"] }, async (req, { user }) => {
  const body = await parseBody(req, createUserSchema);
  const passwordHash = await hashPassword(body.temporaryPassword);

  const [created] = await writeDb
    .insert(users)
    .values({
      email: body.email,
      passwordHash,
      fullName: body.fullName,
      rollNumber: body.rollNumber || null,
      role: body.role,
      mustChangePassword: true,
    })
    .returning();

  await writeDb.insert(auditEvents).values({
    actorId: (user as SessionUser).id,
    action: "admin.user_created",
    entityType: "user",
    entityId: created.id,
    after: { email: created.email, fullName: created.fullName, role: created.role, rollNumber: created.rollNumber },
  });

  return json(
    {
      user: {
        id: created.id,
        email: created.email,
        fullName: created.fullName,
        rollNumber: created.rollNumber,
        role: created.role,
        isActive: created.isActive,
        mustChangePassword: created.mustChangePassword,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      },
    },
    { status: 201 },
  );
});
