"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Alert, Spinner } from "@/components/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        const code = (result as { code?: string }).code;
        if (code === "rate_limited") setError("Too many sign-in attempts. Wait a few minutes and try again.");
        else if (code === "service_unavailable") setError("Sign-in is temporarily unavailable. Try again shortly.");
        else setError("Email or password is incorrect.");
        return;
      }
      window.location.assign("/dashboard");
    } catch {
      setError("Could not reach the service. Try again shortly.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main id="main" className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-ink p-10 text-on-primary lg:flex">
        <p className="text-lg font-semibold">
          Rollcall<span className="text-primary-soft">.</span>
        </p>
        <div>
          <h1 className="max-w-[16ch] text-5xl font-semibold leading-[1.1] tracking-tight">
            A calm register for every class.
          </h1>
          <p className="mt-4 max-w-[40ch] text-sm text-white/70">
            Take roll call from a laptop or phone. Attendance is saved to one shared cloud register.
          </p>
        </div>
        <p className="text-xs text-white/50">One institution · Accounts are created by an admin</p>
      </section>

      <section className="flex flex-col justify-center px-5 py-10">
        <div className="mx-auto w-full max-w-sm">
          <p className="text-lg font-semibold lg:hidden">
            Rollcall<span className="text-primary">.</span>
          </p>
          <p className="mt-8 text-xs font-semibold uppercase tracking-widest text-primary lg:mt-0">Sign in</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Open the register</h1>
          <p className="mt-2 text-sm text-ink-muted">Use the account your admin created. There is no public sign-up.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {error ? <Alert>{error}</Alert> : null}
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                className="input"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
              Show password
            </label>
            <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
              {submitting ? <Spinner label="Signing in…" /> : "Sign in"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
