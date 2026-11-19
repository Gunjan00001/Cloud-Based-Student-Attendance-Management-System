// End-to-end smoke test against a running server (PGLITE=1). Exits non-zero on
// the first failure. Usage: node scripts/e2e.mjs
const base = "http://localhost:3000";

let failures = 0;
function check(name, condition, detail = "") {
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    failures++;
    console.log(`FAIL ${name} ${detail}`);
  }
}

class Jar {
  cookies = new Map();
  capture(response) {
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const eq = pair.indexOf("=");
      this.cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function call(jar, path, { method = "GET", body, form } = {}) {
  const headers = { cookie: jar.header() };
  let payload;
  if (form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    payload = new URLSearchParams(form).toString();
  } else if (body) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  if (method !== "GET") headers.origin = base;
  const response = await fetch(base + path, { method, headers, body: payload, redirect: "manual" });
  jar.capture(response);
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data, headers: response.headers };
}

async function login(jar, email, password) {
  const csrf = await call(jar, "/api/auth/csrf");
  await call(jar, "/api/auth/callback/credentials", {
    method: "POST",
    form: { csrfToken: csrf.data.csrfToken, email, password, callbackUrl: `${base}/dashboard`, json: "true" },
  });
  return call(jar, "/api/me");
}

const admin = new Jar();
let result = await login(admin, "admin@example.edu", "ChangeMe-Admin-123");
check("admin login", result.status === 200 || result.status === 302, `status ${result.status}`);

result = await call(admin, "/api/me");
check("admin session role", result.data?.user?.role === "admin", JSON.stringify(result.data));

result = await call(admin, "/api/courses?limit=100");
const courseId = result.data?.courses?.[0]?.id;
check("admin sees course", Boolean(courseId), JSON.stringify(result.data));

result = await call(admin, "/api/admin/users?role=student&limit=100");
check("admin student list", result.status === 200 && result.data.users.length >= 6, JSON.stringify(result.data));

const zaraEmail = `zara+${Date.now()}@example.edu`;
result = await call(admin, "/api/admin/users", {
  method: "POST",
  body: { email: zaraEmail, fullName: "Zara Ali", role: "student", temporaryPassword: "TempPass-123456", rollNumber: "CE07" },
});
check("admin creates user", result.status === 201, JSON.stringify(result.data));
const zaraId = result.data?.user?.id;

result = await call(admin, "/api/admin/users?role=teacher&limit=100");
const teacherId = result.data?.users?.[0]?.id;
result = await call(admin, "/api/admin/courses", {
  method: "POST",
  body: { code: "CS301", title: "Duplicate", term: "T", teacherId },
});
check("duplicate course code conflicts", result.status === 409, JSON.stringify(result.data));

result = await call(admin, `/api/courses/${courseId}/roster`);
check("admin roster", result.status === 200 && result.data.students.length >= 6, JSON.stringify(result.data));

const teacher = new Jar();
result = await login(teacher, "teacher@example.edu", "ChangeMe-Teacher-123");
check("teacher login", result.status === 200 || result.status === 302, `status ${result.status}`);

result = await call(teacher, "/api/courses");
check("teacher sees own course", result.data?.courses?.some((course) => course.id === courseId), JSON.stringify(result.data));

result = await call(teacher, "/api/admin/users");
check("teacher blocked from admin", result.status === 403, JSON.stringify(result.data));

const startsAtIso = new Date(Date.now()).toISOString();
result = await call(teacher, `/api/courses/${courseId}/sessions`, {
  method: "POST",
  body: { startsAt: startsAtIso, topic: "Joins" },
});
check("teacher creates session", result.status === 201, JSON.stringify(result.data));
const sessionId = result.data?.session?.id;

result = await call(teacher, `/api/courses/${courseId}/sessions`, {
  method: "POST",
  body: { startsAt: startsAtIso },
});
check("duplicate session time conflicts", result.status === 409, JSON.stringify(result.data));

result = await call(teacher, `/api/sessions/${sessionId}`);
const roster = result.data?.session?.roster ?? [];
check("session detail has roster", result.status === 200 && roster.length >= 6, JSON.stringify(result.data));
check("session version starts at 1", result.data?.session?.version === 1);

const records = roster.map((student) => ({ studentId: student.id, status: "present" }));
const ravi = roster.find((student) => student.rollNumber === "CE03");
if (ravi) records.find((record) => record.studentId === ravi.id).status = "absent";
result = await call(teacher, `/api/sessions/${sessionId}/attendance`, {
  method: "PUT",
  body: { version: 1, records },
});
check("save attendance", result.status === 200 && result.data.session.version === 2, JSON.stringify(result.data));

result = await call(teacher, `/api/sessions/${sessionId}/attendance`, {
  method: "PUT",
  body: { version: 1, records },
});
check(
  "stale version conflicts",
  result.status === 409 && result.data.error.details.currentVersion === 2,
  JSON.stringify(result.data),
);

const records2 = records.map((record) => ({ ...record, status: record.status === "absent" ? "present" : record.status }));
if (ravi) records2.find((record) => record.studentId === ravi.id).status = "absent";
result = await call(teacher, `/api/sessions/${sessionId}/attendance`, {
  method: "PUT",
  body: { version: 2, records: records2.slice(0, -1) },
});
check("incomplete roster rejected", result.status === 422, JSON.stringify(result.data));

result = await call(teacher, `/api/sessions/${sessionId}/attendance`, {
  method: "PUT",
  body: { version: 2, records: records2 },
});
check("edit path saves with new version", result.status === 200 && result.data.session.version === 3, JSON.stringify(result.data));

result = await call(teacher, `/api/reports/courses/${courseId}/summary`);
const absentStudent = result.data?.students?.find((student) => student.rollNumber === "CE03");
check("report totals", result.status === 200 && result.data.savedSessions >= 2, JSON.stringify(result.data));
check("absent student percent", absentStudent && absentStudent.attendancePercent < 100, JSON.stringify(absentStudent));
check("report has dataAsOf", Boolean(result.data?.dataAsOf));

const student = new Jar();
result = await login(student, "kabir@example.edu", "ChangeMe-Student-123");
check("student login", result.status === 200 || result.status === 302, `status ${result.status}`);

result = await call(student, "/api/students/me/attendance");
check("student sees own summary", result.status === 200 && result.data.courses.length >= 1, JSON.stringify(result.data));

result = await call(student, `/api/courses/${courseId}/roster`);
check("student blocked from roster", result.status === 403 || result.status === 404, JSON.stringify(result.data));

result = await call(student, `/api/sessions/${sessionId}`);
check("student blocked from session edit view", result.status === 403, JSON.stringify(result.data));

// Password change flow on the freshly created account.
const zara = new Jar();
result = await login(zara, zaraEmail, "TempPass-123456");
check("new user login", result.status === 200 || result.status === 302, `status ${result.status}`);
result = await call(zara, "/api/me/password", {
  method: "POST",
  body: { currentPassword: "TempPass-123456", newPassword: "NewPassword-123456" },
});
check("password change", result.status === 204, JSON.stringify(result.data));

const wrong = new Jar();
result = await login(wrong, zaraEmail, "TempPass-123456");
check("old password no longer works", result.status === 401, `status ${result.status}`);

const again = new Jar();
result = await login(again, zaraEmail, "NewPassword-123456");
check("new password works", result.status === 200 || result.status === 302, `status ${result.status}`);

result = await call(admin, `/api/students/${zaraId}/attendance`);
check("admin views student attendance", result.status === 200, JSON.stringify(result.data));

result = await call(student, "/api/health");
check("health is public", result.status === 200, JSON.stringify(result.data));

console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
