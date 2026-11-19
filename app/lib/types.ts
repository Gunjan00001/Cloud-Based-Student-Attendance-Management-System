export type Role = "admin" | "teacher" | "student";

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  mustChangePassword: boolean;
};
