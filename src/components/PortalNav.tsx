"use client";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type PortalLink = { href: Route; label: string; section: string };
export function PortalNav({ links, label }: { links: PortalLink[]; label: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return <nav className="portal-nav" aria-label={label}>
    <button type="button" className="portal-menu-toggle" aria-expanded={open} aria-controls="portal-menu-links" onClick={() => setOpen(!open)}>{label}<span>{open ? "Close" : "Browse"}</span></button>
    <div id="portal-menu-links" className={`portal-menu-links ${open ? "is-open" : ""}`}>
      {links.map((link, index) => <div className="portal-nav-item" key={link.href}>
        {(index === 0 || links[index - 1].section !== link.section) && <p className="portal-section-label">{link.section}</p>}
        <Link href={link.href} aria-current={pathname === link.href || (link.href !== "/admin" && link.href !== "/member" && pathname.startsWith(`${link.href}/`)) ? "page" : undefined}
          className="admin-nav-link" onClick={() => setOpen(false)}>{link.label}</Link>
      </div>)}
    </div>
  </nav>;
}
