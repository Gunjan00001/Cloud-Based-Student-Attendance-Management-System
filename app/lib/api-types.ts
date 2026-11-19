import type { Role } from "@/lib/types";

export type CourseSummary = {
  id: string;
  code: string;
  title: string;
  term: string;
  teacher: { id: string; fullName: string };
  isArchived: boolean;
  enrollmentCount: number;
};

export type CourseDetail = CourseSummary & { canMarkAttendance: boolean };

export type SessionRow = {
  id: string;
  startsAt: string;
  topic: string | null;
  version: number;
  savedAt: string | null;
  present: number;
  absent: number;
};

export type RosterStudent = { id: string; fullName: string; rollNumber: string | null };

export type SessionDetail = {
  id: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  term: string;
  startsAt: string;
  topic: string | null;
  version: number;
  savedAt: string | null;
  roster: RosterStudent[];
  records: Array<{ studentId: string; status: "present" | "absent" }>;
};

export type StudentAttendanceCourse = {
  course: { id: string; code: string; title: string; term: string };
  presentSessions: number;
  savedSessions: number;
  attendancePercent: number | null;
};

export type ReportStudent = {
  studentId: string;
  fullName: string;
  rollNumber: string | null;
  presentSessions: number;
  countedSessions: number;
  attendancePercent: number | null;
};

export type ReportResponse = {
  courseId: string;
  savedSessions: number;
  students: ReportStudent[];
  // Per saved session, oldest first: marked = present + absent.
  trend: Array<{ sessionId: string; startsAt: string; present: number; absent: number }>;
  dataAsOf: string;
  replicaLagMs: number | null;
};

export type InstitutionAnalytics = {
  users: { admins: number; teachers: number; students: number; activeUsers: number };
  courses: { total: number; archived: number };
  attendance: { savedSessions: number; present: number; absent: number };
  perCourse: Array<{ id: string; code: string; savedSessions: number; present: number; absent: number }>;
  dataAsOf: string;
  replicaLagMs: number | null;
};

export type AdminUser = {
  id: string;
  email: string;
  fullName: string;
  rollNumber: string | null;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
};
