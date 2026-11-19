import { and, eq, gt, lte, or, isNull } from "drizzle-orm";
import { attendanceSessions, courses, enrollments, users } from "@/db/schema";
import { apiErrors } from "@/lib/errors";
import { writeDb } from "@/lib/db";
import type { SessionUser } from "@/lib/types";
import type { Course } from "@/db/schema";

export async function assertCourseAccess(courseId: string, user: SessionUser): Promise<Course> {
  const [course] = await writeDb.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course) throw apiErrors.notFound("Course not found.");

  if (user.role === "admin") return course;
  if (user.role === "teacher") {
    if (course.teacherId !== user.id) throw apiErrors.forbidden();
    return course;
  }

  const now = new Date();
  const [enrollment] = await writeDb
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.courseId, courseId),
        eq(enrollments.studentId, user.id),
        lte(enrollments.enrolledAt, now),
        or(isNull(enrollments.droppedAt), gt(enrollments.droppedAt, now)),
      ),
    )
    .limit(1);
  if (!enrollment) throw apiErrors.notFound("Course not found.");
  return course;
}

export async function assertCourseStaff(courseId: string, user: SessionUser): Promise<Course> {
  const course = await assertCourseAccess(courseId, user);
  if (user.role === "admin") return course;
  if (user.role !== "teacher" || course.teacherId !== user.id) throw apiErrors.forbidden();
  return course;
}

export async function assertCourseTeacher(courseId: string, user: SessionUser): Promise<Course> {
  if (user.role !== "teacher") throw apiErrors.forbidden("Only the assigned teacher can mark attendance.");
  const course = await assertCourseStaff(courseId, user);
  if (course.teacherId !== user.id) throw apiErrors.forbidden();
  return course;
}

export async function loadSessionForStaff(sessionId: string, user: SessionUser) {
  const [row] = await writeDb
    .select({ session: attendanceSessions, course: courses })
    .from(attendanceSessions)
    .innerJoin(courses, eq(courses.id, attendanceSessions.courseId))
    .where(eq(attendanceSessions.id, sessionId))
    .limit(1);

  if (!row) throw apiErrors.notFound("Session not found.");
  if (user.role !== "admin" && (user.role !== "teacher" || row.course.teacherId !== user.id)) {
    throw apiErrors.forbidden();
  }
  return row;
}

export async function assertStudentVisible(studentId: string, user: SessionUser) {
  const [student] = await writeDb
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, studentId))
    .limit(1);
  if (!student || student.role !== "student") throw apiErrors.notFound("Student not found.");

  if (user.role === "student") {
    if (user.id !== studentId) throw apiErrors.notFound("Student not found.");
    return { teacherId: null as string | null };
  }
  if (user.role === "admin") return { teacherId: null as string | null };

  const [enrollment] = await writeDb
    .select({ id: enrollments.id })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(and(eq(enrollments.studentId, studentId), eq(courses.teacherId, user.id)))
    .limit(1);
  if (!enrollment) throw apiErrors.notFound("Student not found.");
  return { teacherId: user.id };
}
