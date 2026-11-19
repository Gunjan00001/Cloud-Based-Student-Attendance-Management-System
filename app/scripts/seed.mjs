import { Algorithm, hash } from "@node-rs/argon2";
import postgres from "postgres";

const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}
if (process.env.NODE_ENV === "production" && process.env.SEED_DEMO !== "1") {
  console.error("Refusing to seed a production database. Set SEED_DEMO=1 to override.");
  process.exit(1);
}

const isLocal = process.env.DB_SSL === "false" || /(localhost|127\.0\.0\.1)/.test(url);
const sql = postgres(url, { max: 1, prepare: false, ssl: isLocal ? false : "require" });

const hashOptions = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

const people = [
  { email: "admin@example.edu", fullName: "Asha Admin", roll: null, role: "admin", password: "ChangeMe-Admin-123" },
  { email: "teacher@example.edu", fullName: "Asha Rao", roll: null, role: "teacher", password: "ChangeMe-Teacher-123" },
  { email: "kabir@example.edu", fullName: "Kabir Rao", roll: "CE01", role: "student", password: "ChangeMe-Student-123" },
  { email: "meera@example.edu", fullName: "Meera Iyer", roll: "CE02", role: "student", password: "ChangeMe-Student-123" },
  { email: "ravi@example.edu", fullName: "Ravi Shah", roll: "CE03", role: "student", password: "ChangeMe-Student-123" },
  { email: "sana@example.edu", fullName: "Sana Khan", roll: "CE04", role: "student", password: "ChangeMe-Student-123" },
  { email: "dev@example.edu", fullName: "Dev Patel", roll: "CE05", role: "student", password: "ChangeMe-Student-123" },
  { email: "tara@example.edu", fullName: "Tara Nair", roll: "CE06", role: "student", password: "ChangeMe-Student-123" },
];

try {
  await sql.begin(async (tx) => {
    for (const person of people) {
      const passwordHash = await hash(person.password, hashOptions);
      await tx`
        INSERT INTO users (email, password_hash, full_name, roll_number, role, is_active, must_change_password)
        VALUES (${person.email}, ${passwordHash}, ${person.fullName}, ${person.roll}, ${person.role}, true, false)
        ON CONFLICT (email) DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          full_name = EXCLUDED.full_name,
          roll_number = EXCLUDED.roll_number,
          role = EXCLUDED.role,
          is_active = true,
          must_change_password = false,
          updated_at = now()
      `;
    }

    const [teacher] = await tx`SELECT id FROM users WHERE email = 'teacher@example.edu'`;
    const students = await tx`SELECT id FROM users WHERE role = 'student' ORDER BY roll_number`;

    const [course] = await tx`
      INSERT INTO courses (code, title, term, teacher_id)
      VALUES ('CS301', 'Database Systems', '2026-27 Semester 1', ${teacher.id})
      ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title, term = EXCLUDED.term, teacher_id = EXCLUDED.teacher_id
      RETURNING id
    `;

    for (const student of students) {
      await tx`
        INSERT INTO enrollments (course_id, student_id)
        VALUES (${course.id}, ${student.id})
        ON CONFLICT (course_id, student_id) DO UPDATE SET dropped_at = NULL
      `;
    }

    const [existing] = await tx`
      SELECT id FROM attendance_sessions WHERE course_id = ${course.id} AND starts_at = '2026-11-13T09:30:00+05:30'
    `;
    if (!existing) {
      const [session] = await tx`
        INSERT INTO attendance_sessions (course_id, starts_at, topic, version, saved_at, created_by)
        VALUES (${course.id}, '2026-11-13T09:30:00+05:30', 'Indexes and query plans', 2, now(), ${teacher.id})
        RETURNING id
      `;
      for (const [index, student] of students.entries()) {
        await tx`
          INSERT INTO attendance_records (session_id, student_id, status, marked_by, marked_at)
          VALUES (${session.id}, ${student.id}, ${index === 3 ? "absent" : "present"}, ${teacher.id}, now())
        `;
      }
    }
  });

  console.log("Seed complete.");
  console.log("admin@example.edu / ChangeMe-Admin-123");
  console.log("teacher@example.edu / ChangeMe-Teacher-123");
  console.log("kabir@example.edu / ChangeMe-Student-123 (and other seeded students)");
} catch (error) {
  console.error("Seed failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
