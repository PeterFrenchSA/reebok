import { PortalLink, PortalNav } from "./PortalNav";
const links: PortalLink[] = [
  { href: "/admin", label: "Overview", section: "House desk" },
  { href: "/admin/calendar", label: "Booking calendar", section: "House desk" },
  { href: "/admin/bookings", label: "Approvals & history", section: "House desk" },
  { href: "/admin/pricing", label: "Pricing & Rooms", section: "House desk" },
  { href: "/admin/assets", label: "Asset management", section: "Housekeeping" },
  { href: "/admin/maintenance", label: "Maintenance", section: "Housekeeping" },
  { href: "/admin/users", label: "User administration", section: "Family & guests" },
  { href: "/admin/feedback", label: "Guest feedback", section: "Family & guests" },
  { href: "/admin/decisions", label: "Decisions", section: "Family & guests" },
  { href: "/admin/finances", label: "Finances", section: "Records & connections" },
  { href: "/admin/integrations", label: "Google Sheets", section: "Records & connections" },
  { href: "/admin/templates", label: "Email templates", section: "Records & connections" },
  { href: "/admin/telegram", label: "Telegram", section: "Records & connections" },
  { href: "/admin/guide", label: "User guide", section: "Help & ideas" },
  { href: "/admin/app-feedback", label: "App feedback", section: "Help & ideas" }
];
export function AdminSidebarNav() { return <PortalNav links={links} label="Admin menu" />; }
