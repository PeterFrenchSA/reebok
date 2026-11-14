import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUserFromCookies } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { propertyToday, dateValue } from "@/lib/availability";
export default async function MemberPage() {
  const user = await getSessionUserFromCookies();
  if (!user) redirect("/login?next=/member");
  if (!hasPermission(user.role, "booking:create:family")) redirect("/guest");
  const now = new Date();
  const stays = await prisma.booking.findMany({ where: { requestedById: user.id, status: { in: ["PENDING", "APPROVED"] }, endDate: { gt: dateValue(propertyToday()) } }, orderBy: { startDate: "asc" }, take: 3,
    select: { id: true, status: true, scope: true, startDate: true, endDate: true, totalGuests: true, roomAllocations: { select: { room: { select: { name: true } } } } } });
  const votes = await prisma.decision.count({ where: { status: "ACTIVE", audience: "MEMBERS_AND_ADMINS", OR: [{ closesAt: null }, { closesAt: { gt: now } }] } });
  const tasks = await prisma.maintenanceTask.count({ where: { createdById: user.id, status: { in: ["OPEN", "IN_PROGRESS"] } } });
  return <section className="grid">
    <header className="card coastal-hero grid"><span className="kicker">Family home</span><h1>Welcome back, {user.name?.split(" ")[0] ?? "family"}.</h1><p className="lead">A little planning, more time together. Find a room, see who is staying and keep in touch with the house.</p>
      <div className="action-row"><Link href="/member/book" className="btn-primary inline-action">Create New Booking</Link><Link href="/member/calendar" className="btn-secondary inline-action">See who is staying</Link></div></header>
    <div className="quick-link-grid"><Link href="/member/bookings" className="quick-link"><span className="kicker">Your plans</span><h2>My bookings</h2><p>Current stays, requests and history.</p><span>View bookings</span></Link>
      <Link href="/member/decisions" className="quick-link"><span className="kicker">Have your say</span><h2>{votes} open {votes === 1 ? "decision" : "decisions"}</h2><p>Review the proposals and cast your vote.</p><span>Family decisions</span></Link>
      <Link href="/member/maintenance" className="quick-link"><span className="kicker">Care for the house</span><h2>{tasks} open {tasks === 1 ? "task" : "tasks"}</h2><p>Track your reports or log something new.</p><span>House maintenance</span></Link></div>
    <section className="card grid"><div className="status-line"><h2>Your next stays</h2><Link href="/member/bookings" className="text-action">All my bookings</Link></div>
      {!stays.length && <p className="lead">No upcoming stays yet. Choose a shared family stay to reserve just the rooms you need.</p>}
      {stays.map((stay) => <article key={stay.id} className="compact-stay"><div><span className={`status-pill status-${stay.status.toLowerCase()}`}>{stay.status === "PENDING" ? "Awaiting approval" : "Approved stay"}</span><h3>{stay.startDate.toISOString().slice(0, 10)} to {stay.endDate.toISOString().slice(0, 10)}</h3><p className="lead">{stay.scope === "WHOLE_HOUSE" ? "Whole house" : stay.roomAllocations.map((a) => a.room.name).join(", ")} / {stay.totalGuests} guests</p></div><Link className="btn-secondary inline-action" href={`/booking/manage?reference=${stay.id}`}>Manage stay</Link></article>)}
      <p className="lead">Pending requests hold their accommodation. An approved stay is not a payment receipt.</p>
    </section>
    <div className="quick-link-grid"><Link href="/member/fees" className="quick-link"><h3>My fees</h3><p>Your contribution and recorded fee status.</p></Link><Link href="/guest" className="quick-link"><h3>Before you arrive</h3><p>Useful information, important numbers and stay feedback.</p></Link>{hasPermission(user.role, "finance:view") && <Link href="/member/finances" className="quick-link"><h3>Financial records</h3><p>Shareholder read-only records and exports.</p></Link>}</div>
  </section>;
}
