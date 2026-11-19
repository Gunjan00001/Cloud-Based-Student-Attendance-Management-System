-- 0000_init.sql — run on the primary only.
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('admin', 'teacher', 'student');
CREATE TYPE attendance_status AS ENUM ('present', 'absent');

CREATE TABLE users (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                citext NOT NULL UNIQUE,
  password_hash        text NOT NULL,
  full_name            text NOT NULL,
  -- Added to satisfy the roster/report API shapes, which include rollNumber.
  roll_number          text,
  role                 user_role NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_full_name_not_blank CHECK (length(btrim(full_name)) > 0)
);

CREATE TABLE courses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  title       text NOT NULL,
  term        text NOT NULL,
  teacher_id  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  is_archived boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT courses_code_not_blank CHECK (length(btrim(code)) > 0),
  CONSTRAINT courses_title_not_blank CHECK (length(btrim(title)) > 0)
);

CREATE TABLE enrollments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  dropped_at  timestamptz,
  CONSTRAINT enrollments_drop_after_enroll CHECK (dropped_at IS NULL OR dropped_at >= enrolled_at),
  CONSTRAINT enrollments_course_student_unique UNIQUE (course_id, student_id)
);

CREATE TABLE attendance_sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id  uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  starts_at  timestamptz NOT NULL,
  topic      text,
  version    integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  saved_at   timestamptz,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_sessions_course_start_unique UNIQUE (course_id, starts_at)
);

CREATE TABLE attendance_records (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status     attendance_status NOT NULL,
  marked_by  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  marked_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_records_session_student_unique UNIQUE (session_id, student_id)
);

CREATE TABLE audit_events (
  id          bigserial PRIMARY KEY,
  actor_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  ip          inet,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX users_role_active_idx ON users (role, is_active);
CREATE INDEX courses_teacher_idx ON courses (teacher_id);
CREATE INDEX courses_term_archived_idx ON courses (term, is_archived);
CREATE INDEX enrollments_student_idx ON enrollments (student_id);
CREATE INDEX attendance_sessions_course_start_idx ON attendance_sessions (course_id, starts_at DESC);
CREATE INDEX attendance_sessions_saved_idx ON attendance_sessions (course_id, starts_at DESC) WHERE saved_at IS NOT NULL;
CREATE INDEX attendance_records_student_status_idx ON attendance_records (student_id, status);
CREATE INDEX audit_events_created_idx ON audit_events (created_at DESC);
CREATE INDEX audit_events_entity_idx ON audit_events (entity_type, entity_id);
