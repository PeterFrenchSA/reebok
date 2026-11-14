import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUserFromCookies } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { dateValue, propertyToday } from "@/lib/availability";
export default async function AdminPage() {
  const user = await getSessionUserFromCookies();
  if (!user || !hasPermission(user.role, "booking:manage")) redirect("/login");
  const pendingCount = await prisma.booking.count({ where: { status: "PENDING" } });
  const openTasks = await prisma.maintenanceTask.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } });
  const stays = await prisma.booking.findMany({ where: { status: { in: ["PENDING", "APPROVED"] }, endDate: { gt: dateValue(propertyToday()) } },
    orderBy: [{ startDate: "asc" }, { id: "asc" }], take: 8, select: { id: true, startDate: true, endDate: true, status: true, totalGuests: true, scope: true, externalLeadName: true,
      requestedBy: { select: { name: true } }, roomAllocations: { select: { room: { select: { name: true } } } } } });
  const pending = await prisma.booking.findMany({ where: { status: "PENDING" }, orderBy: { startDate: "asc" }, take: 4, select: { id: true, startDate: true, endDate: true, totalGuests: true, externalLeadName: true, requestedBy: { select: { name: true } } } });
  return <section className="grid"><header className="card coastal-hero grid"><span className="kicker">House desk</span><h1>A well-kept home, a warm welcome.</h1><p className="lead">The essentials first. Review requests, plan the next arrivals and keep the house running smoothly.</p><div className="action-row"><Link href="/admin/calendar" className="btn-primary inline-action">Open booking calendar</Link><Link href="/admin/bookings" className="btn-secondary inline-action">Approvals & history</Link></div></header>
    <div className="quick-link-grid"><Link href="/admin/bookings" className="quick-link"><span className="kicker">Needs a decision</span><h2>{pendingCount}</h2><p>Bookings awaiting approval</p></Link><Link href="/admin/maintenance" className="quick-link"><span className="kicker">Housekeeping</span><h2>{openTasks}</h2><p>Open maintenance tasks</p></Link><Link href="/admin/finances" className="quick-link"><span className="kicker">House records</span><h2>Finances</h2><p>Member contributions, expenses and reports</p></Link></div>
    <section className="card grid"><div className="status-line"><h2>Bookings needing approval</h2><Link href="/admin/bookings" className="text-action">View all {pendingCount}</Link></div>
      {!pending.length && <p className="lead">No booking requests are waiting for a decision.</p>}{pending.map((booking) => <article className="compact-stay" key={booking.id}><div><h3>{booking.requestedBy?.name ?? booking.externalLeadName ?? "Guest stay"}</h3><p className="lead">{booking.startDate.toISOString().slice(0, 10)} to {booking.endDate.toISOString().slice(0, 10)} / {booking.totalGuests} guests</p></div><Link href={`/admin/calendar?date=${booking.startDate.toISOString().slice(0, 10)}&booking=${booking.id}`} className="btn-primary inline-action">Review request</Link></article>)}</section>
    <section className="card grid"><div className="status-line"><h2>Active & upcoming stays</h2><Link href="/admin/calendar" className="text-action">View calendar</Link></div>{!stays.length && <p className="lead">No upcoming stays.</p>}{stays.map((booking) => <article className="compact-stay" key={booking.id}><div><span className={`status-pill status-${booking.status.toLowerCase()}`}>{booking.status}</span><h3>{booking.requestedBy?.name ?? booking.externalLeadName ?? "Guest stay"}</h3><p className="lead">{booking.startDate.toISOString().slice(0, 10)} to {booking.endDate.toISOString().slice(0, 10)} / {booking.scope === "WHOLE_HOUSE" ? "Whole house" : booking.roomAllocations.map((a) => a.room.name).join(", ")}</p></div><Link href={`/admin/calendar?date=${booking.startDate.toISOString().slice(0, 10)}&booking=${booking.id}`} className="btn-secondary inline-action">View stay</Link></article>)}</section>
  </section>;
}
