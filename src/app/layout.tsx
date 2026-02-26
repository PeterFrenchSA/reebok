import type { Metadata } from "next";
import { ShellNav } from "@/components/ShellNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reebok House Manager",
  description:
    "Holiday house operations platform for bookings, rates, finance, maintenance, and guest feedback."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <ShellNav />
          <main className="content-shell">{children}</main>
        </div>
      </body>
    </html>
  );
}
