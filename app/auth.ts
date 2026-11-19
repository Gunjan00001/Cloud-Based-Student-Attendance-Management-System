import { eq } from "drizzle-orm";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { users } from "@/db/schema";
import { writeDb } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { checkLimit, clientIp, normalizeEmail } from "@/lib/rate-limit";
import type { Role } from "@/lib/types";

class RateLimitedSignIn extends CredentialsSignin {
  code = "rate_limited";
}

class ServiceUnavailableSignIn extends CredentialsSignin {
  code = "service_unavailable";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  jwt: { maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const email = typeof credentials?.email === "string" ? normalizeEmail(credentials.email) : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;

        try {
          const ip = clientIp(request.headers);
          const global = await checkLimit("global.ip", ip);
          if (!global.allowed) throw new RateLimitedSignIn();

          const byIp = await checkLimit("auth.login.ip", ip);
          if (byIp.unavailable || !byIp.allowed) {
            throw byIp.unavailable ? new ServiceUnavailableSignIn() : new RateLimitedSignIn();
          }

          const byEmail = await checkLimit("auth.login.email", email);
          if (byEmail.unavailable || !byEmail.allowed) {
            throw byEmail.unavailable ? new ServiceUnavailableSignIn() : new RateLimitedSignIn();
          }

          const [user] = await writeDb.select().from(users).where(eq(users.email, email)).limit(1);
          if (!user || !user.isActive) return null;

          const valid = await verifyPassword(user.passwordHash, password);
          if (!valid) return null;

          return {
            id: user.id,
            email: user.email,
            name: user.fullName,
            fullName: user.fullName,
            role: user.role as Role,
            mustChangePassword: user.mustChangePassword,
          };
        } catch (error) {
          if (error instanceof CredentialsSignin) throw error;
          console.error("login_error", error instanceof Error ? error.name : "unknown");
          throw new ServiceUnavailableSignIn();
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.fullName = user.fullName;
        token.mustChangePassword = user.mustChangePassword;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as Role;
      session.user.fullName = token.fullName as string;
      session.user.mustChangePassword = token.mustChangePassword as boolean;
      return session;
    },
  },
});
