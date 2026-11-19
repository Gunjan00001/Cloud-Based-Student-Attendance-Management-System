import assert from "node:assert/strict";
import test from "node:test";
import { buildKey, normalizeEmail } from "../lib/rate-limit.ts";

test("email normalization is case-insensitive and trims", () => {
  assert.equal(normalizeEmail("  User@Example.edu "), "user@example.edu");
  assert.equal(normalizeEmail("user@example.edu"), normalizeEmail("USER@EXAMPLE.EDU"));
});

test("keys are stable, policy-scoped, and do not contain the identity", () => {
  const secret = "test-secret";
  const a = buildKey("auth.login.email", "user@example.edu", secret);
  const b = buildKey("auth.login.email", "user@example.edu", secret);
  assert.equal(a, b);
  assert.ok(a.startsWith("rl:auth.login.email:"));
  assert.ok(!a.includes("user@example.edu"));
  assert.notEqual(a, buildKey("read.user", "user@example.edu", secret));
});
