import { ActiveBookingsPanel } from "@/components/ActiveBookingsPanel";
import { AdminBookingApprovals } from "@/components/AdminBookingApprovals";
import { AdminBookingHistory } from "@/components/AdminBookingHistory";
import Link from "next/link";

export default function AdminBookingsPage() {
  return (
    <section className="grid">
      <article className="card coastal-hero grid">
        <span className="kicker">Bookings</span>
        <h1>Booking Management</h1>
        <p className="lead">Review active requests, approvals, and full booking audit history.</p>
        <div className="action-row"><Link href="/admin/calendar" className="btn-primary inline-action">Open booking calendar</Link><Link href="/admin/bookings/settings" className="btn-secondary inline-action">House notices & booking settings</Link></div>
      </article>

      <article className="grid">
        <h2>Pending Approvals</h2>
        <AdminBookingApprovals />
      </article>

      <article className="grid">
        <h2>Active Bookings</h2>
        <ActiveBookingsPanel adminMode />
      </article>

      <details className="card disclosure">
        <summary>History & Audit Trail</summary>
        <AdminBookingHistory />
      </details>
    </section>
  );
}
