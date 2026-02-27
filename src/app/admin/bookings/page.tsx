import { ActiveBookingsPanel } from "@/components/ActiveBookingsPanel";
import { AdminBookingApprovals } from "@/components/AdminBookingApprovals";
import { AdminBookingHistory } from "@/components/AdminBookingHistory";
import { AdminBookingPolicySettings } from "@/components/AdminBookingPolicySettings";

export default function AdminBookingsPage() {
  return (
    <section className="grid">
      <article className="card grid">
        <span className="kicker">Bookings</span>
        <h1>Booking Management</h1>
        <p className="lead">Review active requests, approvals, and full booking audit history.</p>
      </article>

      <AdminBookingPolicySettings />

      <article className="grid">
        <h2>Active Bookings</h2>
        <ActiveBookingsPanel adminMode />
      </article>

      <article className="grid">
        <h2>Approvals</h2>
        <AdminBookingApprovals />
      </article>

      <article className="grid">
        <h2>History & Audit Trail</h2>
        <AdminBookingHistory />
      </article>
    </section>
  );
}
