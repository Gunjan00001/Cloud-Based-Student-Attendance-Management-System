import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Nav } from "@/components/nav";
import type { SessionUser } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.mustChangePassword) redirect("/change-password");

  const user: SessionUser = {
    id: session.user.id,
    email: session.user.email ?? "",
    fullName: session.user.fullName,
    role: session.user.role,
    mustChangePassword: session.user.mustChangePassword,
  };

  return (
    <div className="min-h-screen bg-bg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-ink focus:px-4 focus:py-2 focus:text-on-primary"
      >
        Skip to main content
      </a>
      <Nav user={user} />
      <div className="lg:pl-60">
        <header className="sticky top-0 z-10 hidden h-16 items-center justify-between border-b border-border bg-bg px-8 lg:flex">
          <p className="text-sm text-ink-muted">Cloud attendance register</p>
          <p className="text-sm">
            <span className="font-medium">{user.fullName}</span>
            <span className="ml-2 capitalize text-ink-muted">{user.role}</span>
          </p>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
