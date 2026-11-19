import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rollcall — Attendance register",
  description: "Cloud-based student attendance register",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
