import Link from "next/link";
import type { Route } from "next";
import { getSessionUserFromCookies } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { ShellMenu } from "./ShellMenu";
export async function ShellNav() {
  const user = await getSessionUserFromCookies();
  const links: Array<{ href: Route; label: string }> = [{ href: "/", label: "Book a stay" }];
  if (user) links.push({ href: "/guest", label: "My stay" });
  if (user && hasPermission(user.role, "booking:create:family")) links.push({ href: "/member", label: "Family" });
  if (user && hasPermission(user.role, "booking:manage")) links.push({ href: "/admin", label: "Admin" });
  return <header className="shell-header"><Link href="/" className="shell-brand" aria-label="Reebok House home">
    <span className="shell-logo" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><circle cx="26" cy="12" r="5" fill="currentColor" /><path d="M5 25c5-5 10 5 15 0s10 5 15 0M5 31c5-5 10 5 15 0s10 5 15 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>
    <div><p className="shell-title">Reebok House</p><p className="shell-subtitle">A place for the whole family</p></div>
  </Link><ShellMenu links={links} name={user ? user.name ?? "Account" : undefined} /></header>;
}
