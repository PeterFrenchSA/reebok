import Link from "next/link";
import type { Route } from "next";

const links: Array<{ href: Route; label: string }> = [
  { href: "/", label: "Home" },
  { href: "/public-booking", label: "Public Booking" },
  { href: "/dashboard", label: "Dashboard" }
];

export function ShellNav() {
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
      </nav>
    </header>
  );
}
