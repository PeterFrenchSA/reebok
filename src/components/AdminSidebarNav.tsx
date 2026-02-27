"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

const adminLinks: Array<{ href: Route; label: string }> = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/assets", label: "Asset Management" },
  { href: "/admin/maintenance", label: "Maintenance" },
  { href: "/admin/users", label: "User Administration" },
  { href: "/admin/feedback", label: "Guest Feedback" },
  { href: "/admin/finances", label: "Finances" },
  { href: "/admin/templates", label: "Email Templates" },
  { href: "/admin/decisions", label: "Decisions" }
];

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) {
    return true;
  }
  if (href === "/admin") {
    return false;
  }
  return pathname.startsWith(`${href}/`);
}

export function AdminSidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="admin-nav" aria-label="Admin modules">
      <p className="kicker">Admin Modules</p>
      {adminLinks.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`admin-nav-link ${isActive(pathname, item.href) ? "admin-nav-link-active" : ""}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
