import { PortalLink, PortalNav } from "./PortalNav";
export function MemberSidebarNav({ finances }: { finances: boolean }) {
  const links: PortalLink[] = [
    { href: "/member", label: "Family home", section: "Your next stay" },
    { href: "/member/book", label: "Book a stay", section: "Your next stay" },
    { href: "/member/calendar", label: "Who's staying", section: "Your next stay" },
    { href: "/member/bookings", label: "My bookings", section: "Your next stay" },
    { href: "/member/fees", label: "My fees", section: "Around the house" },
    { href: "/member/maintenance", label: "Maintenance & assets", section: "Around the house" },
    { href: "/member/decisions", label: "Family decisions", section: "Around the house" },
    { href: "/guest", label: "Useful info & feedback", section: "Keep in touch" },
    { href: "/member/telegram", label: "Connect Telegram", section: "Keep in touch" }
  ];
  if (finances) links.push({ href: "/member/finances", label: "Financial records", section: "Shareholder records" });
  return <PortalNav links={links} label="Family menu" />;
}
