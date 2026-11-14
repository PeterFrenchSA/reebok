"use client";
import Link from "next/link";
import type { Route } from "next";
import { useRef } from "react";
import { LogoutButton } from "./LogoutButton";
export function ShellMenu({ links, name }: { links: Array<{ href: Route; label: string }>; name?: string }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const contents = <><nav className="shell-nav" aria-label="Primary">{links.map((link) => <Link key={link.href} href={link.href} className="nav-link" onClick={() => { if (menu.current) menu.current.open = false; }}>{link.label}</Link>)}</nav>
    <div className="session-controls">{name ? <><span className="session-pill">{name}</span><LogoutButton /></> : <Link href="/login" className="nav-link nav-link-strong">Sign In</Link>}</div></>;
  return <><div className="desktop-shell-menu">{contents}</div><details ref={menu} className="mobile-shell-menu"><summary>Menu</summary><div className="mobile-shell-menu-content">{contents}</div></details></>;
}
