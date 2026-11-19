import { count, eq } from "drizzle-orm";
import { attendanceRecords, attendanceSessions, courses, enrollments, users } from "@/db/schema";
import type { Database } from "@/lib/db";
import { hashPassword } from "@/lib/password";

// Dev/demo data for the PGLITE=1 mode. Keep in sync with scripts/seed.mjs,
// which is the canonical seed for a real database.

const admin = { email: "admin@example.edu", fullName: "Asha Admin", password: "ChangeMe-Admin-123" };

const teachers = [
  { email: "teacher@example.edu", fullName: "Asha Rao", password: "ChangeMe-Teacher-123" },
  { email: "vikram@example.edu", fullName: "Vikram Bose", password: "ChangeMe-Teacher-123" },
  { email: "leela@example.edu", fullName: "Leela Menon", password: "ChangeMe-Teacher-123" },
  { email: "omar@example.edu", fullName: "Omar Farooq", password: "ChangeMe-Teacher-123" },
  { email: "priya@example.edu", fullName: "Priya Desai", password: "ChangeMe-Teacher-123" },
  { email: "sameer@example.edu", fullName: "Sameer Joshi", password: "ChangeMe-Teacher-123" },
];

const firstNames = [
  "Kabir", "Meera", "Ravi", "Sana", "Dev", "Tara", "Arjun", "Nisha", "Rohit", "Ira",
  "Aman", "Zoya",
];
const lastNames = ["Rao", "Iyer", "Shah", "Khan", "Patel", "Nair"];

const courseSpecs = [
  { code: "CS101", title: "Programming Fundamentals", teacher: 0 },
  { code: "MA201", title: "Discrete Mathematics", teacher: 1 },
  { code: "CS201", title: "Data Structures", teacher: 0 },
  { code: "PH101", title: "Engineering Physics", teacher: 2 },
  { code: "EN105", title: "Technical Writing", teacher: 3 },
  { code: "EC202", title: "Digital Electronics", teacher: 4 },
  { code: "CS301", title: "Database Systems", teacher: 0 },
  { code: "DB401", title: "Distributed Systems", teacher: 5 },
];

const topics = [
  "Introduction", "Core concepts", "Worked examples", "Problem solving",
  "Case study", "Review", "Quiz preparation", "Applications", "Discussion",
];

// Deterministic PRNG so every boot produces the same demo data.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function ensureDevData(db: Database) {
  const [{ total }] = await db.select({ total: count() }).from(users);
  if (Number(total) > 0) return;

  // 1 admin + 6 teachers + 60 students.
  const students = firstNames.flatMap((first, fi) =>
    lastNames.map((last, li) => ({
      email: `${first.toLowerCase()}.${last.toLowerCase()}${fi * lastNames.length + li + 1}@example.edu`,
      fullName: `${first} ${last}`,
      roll: `CE${String(fi * lastNames.length + li + 1).padStart(2, "0")}`,
    })),
  );

  // Keep the documented demo account stable.
  students[0].email = "kabir@example.edu";

  const random = mulberry32(2026);

  const staffHashes = await Promise.all(
    [admin, ...teachers].map(async (person) => ({
      email: person.email,
      fullName: person.fullName,
      passwordHash: await hashPassword(person.password),
    })),
  );

  const studentHashes = await Promise.all(
    students.map(async (student) => ({
      ...student,
      passwordHash: await hashPassword("ChangeMe-Student-123"),
    })),
  );

  await db
    .insert(users)
    .values([
      {
        email: staffHashes[0].email,
        passwordHash: staffHashes[0].passwordHash,
        fullName: staffHashes[0].fullName,
        role: "admin" as const,
        isActive: true,
        mustChangePassword: false,
      },
      ...staffHashes.slice(1).map((person) => ({
        email: person.email,
        passwordHash: person.passwordHash,
        fullName: person.fullName,
        role: "teacher" as const,
        isActive: true,
        mustChangePassword: false,
      })),
      ...studentHashes.map((student) => ({
        email: student.email,
        passwordHash: student.passwordHash,
        fullName: student.fullName,
        rollNumber: student.roll,
        role: "student" as const,
        isActive: true,
        mustChangePassword: false,
      })),
    ])
    .onConflictDoNothing();

  const teacherRows = await db.select().from(users).where(eq(users.role, "teacher"));
  const studentRows = await db.select().from(users).where(eq(users.role, "student")).orderBy(users.rollNumber);

  const courseRows = await db
    .insert(courses)
    .values(
      courseSpecs.map((spec) => ({
        code: spec.code,
        title: spec.title,
        term: "2026-27 Semester 1",
        teacherId: teacherRows[spec.teacher]?.id ?? teacherRows[0].id,
      })),
    )
    .onConflictDoNothing()
    .returning();

  // Term starts 2026-08-31; every student enrolled from day one.
  const termStart = new Date("2026-08-31T04:30:00.000Z");
  const enrollmentRows = new Set<string>();
  for (const [index, student] of studentRows.entries()) {
    for (const offset of [0, 1, 3, 6]) {
      const course = courseRows[(index * 5 + offset) % courseRows.length];
      const key = `${course.id}:${student.id}`;
      if (enrollmentRows.has(key)) continue;
      enrollmentRows.add(key);
    }
  }
  await db
    .insert(enrollments)
    .values(
      [...enrollmentRows].map((key) => {
        const [courseId, studentId] = key.split(":");
        return { courseId, studentId, enrolledAt: termStart };
      }),
    )
    .onConflictDoNothing();

  // 12 saved weekly sessions per course, plus one unsaved draft.
  const weeks = 12;
  for (const [index, course] of courseRows.entries()) {
    for (let week = 0; week < weeks; week++) {
      const startsAt = new Date(termStart.getTime() + (index + week * 5) * 24 * 60 * 60 * 1000);
      const savedAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
      const [session] = await db
        .insert(attendanceSessions)
        .values({
          courseId: course.id,
          startsAt,
          topic: topics[week % topics.length],
          version: 1 + (week % 3),
          savedAt,
          createdBy: course.teacherId,
        })
        .onConflictDoNothing()
        .returning();
      if (!session) continue;

      const records = studentRows
        .filter((student) => enrollmentRows.has(`${course.id}:${student.id}`))
        .map((student) => ({
          sessionId: session.id,
          studentId: student.id,
          status: random() < 0.85 ? ("present" as const) : ("absent" as const),
          markedBy: course.teacherId,
          markedAt: savedAt,
        }));
      if (records.length > 0) {
        await db.insert(attendanceRecords).values(records).onConflictDoNothing();
      }
    }

    await db
      .insert(attendanceSessions)
      .values({
        courseId: course.id,
        startsAt: new Date(termStart.getTime() + (index + weeks * 5) * 24 * 60 * 60 * 1000),
        topic: "Next class",
        version: 1,
        savedAt: null,
        createdBy: course.teacherId,
      })
      .onConflictDoNothing();
  }
}
