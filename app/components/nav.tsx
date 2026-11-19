"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cx } from "@/components/ui";
import type { SessionUser } from "@/lib/types";

type NavItem = { href: string; label: string };

export function Nav({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const items: NavItem[] = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/courses", label: "Courses" },
    { href: "/analytics", label: "Analytics" },
  ];
  if (user.role === "student") items.push({ href: "/students/me", label: "My attendance" });
  if (user.role === "teacher" || user.role === "admin") items.push({ href: "/reports", label: "Reports" });
  if (user.role === "admin") {
    items.push({ href: "/admin/users", label: "Admin · Users" });
    items.push({ href: "/admin/courses", label: "Admin · Courses" });
  }

  const isActive = (href: string) => pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-border bg-bg lg:flex">
        <div className="border-b border-border px-5 py-5">
          <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
            Rollcall<span className="text-primary">.</span>
          </Link>
          <p className="mt-1 text-xs text-ink-muted">Attendance register</p>
        </div>
        <nav aria-label="Main" className="flex-1 space-y-1 p-3">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cx(
                "block rounded-sm px-3 py-2.5 text-sm font-medium",
                isActive(item.href) ? "bg-primary-soft text-ink" : "text-ink-muted hover:bg-surface hover:text-ink",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <p className="truncate px-3 text-sm font-medium">{user.fullName}</p>
          <p className="truncate px-3 text-xs capitalize text-ink-muted">{user.role}</p>
          <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className="btn btn-ghost mt-2 w-full justify-start">
            Sign out
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-border bg-bg lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/dashboard" className="font-semibold">
            Rollcall<span className="text-primary">.</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-muted">{user.fullName}</span>
            <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className="btn btn-ghost min-h-9 px-2">
              Sign out
            </button>
          </div>
        </div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-2 pb-2">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cx(
                "whitespace-nowrap rounded-sm px-3 py-2 text-sm font-medium",
                isActive(item.href) ? "bg-primary-soft text-ink" : "text-ink-muted",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
    </>
  );
}
