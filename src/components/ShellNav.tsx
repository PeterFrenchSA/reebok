import Link from "next/link";
import type { Route } from "next";
import { getSessionUserFromCookies } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { LogoutButton } from "@/components/LogoutButton";

const baseLinks: Array<{ href: Route; label: string }> = [{ href: "/", label: "Book Stay" }];

export async function ShellNav() {
  const user = await getSessionUserFromCookies();
  const links = [...baseLinks];

  if (user) {
    links.push({ href: "/guest", label: "Guest" });
  }

  if (user && hasPermission(user.role, "booking:create:family")) {
    links.push({ href: "/member", label: "Member" });
  }

  if (user && hasPermission(user.role, "booking:manage")) {
    links.push({ href: "/admin", label: "Admin" });
  }

  return (
    <header className="shell-header">
      <div className="shell-brand">
        <span className="shell-logo">RB</span>
        <div>
          <p className="shell-title">Reebok House Manager</p>
          <p className="shell-subtitle">Sandeney Pty Ltd</p>
        </div>
      </div>
      <nav className="shell-nav" aria-label="Primary">
        {links.map((item) => (
          <Link key={item.href} href={item.href} className="nav-link">
            {item.label}
          </Link>
        ))}
        {user ? (
          <div className="session-controls">
            <span className="session-pill">{user.email ?? user.role}</span>
            <LogoutButton />
          </div>
        ) : (
          <Link href="/login" className="nav-link nav-link-strong">
            Sign In
          </Link>
        )}
      </nav>
    </header>
  );
}
