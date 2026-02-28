import Link from "next/link";
import { redirect } from "next/navigation";
import { ActiveBookingsPanel } from "@/components/ActiveBookingsPanel";
import { MemberDecisionVoting } from "@/components/MemberDecisionVoting";
import { MemberFeeTracker } from "@/components/MemberFeeTracker";
import { MemberBookingsPanel } from "@/components/MemberBookingsPanel";
import { MemberMaintenanceWorkflow } from "@/components/MemberMaintenanceWorkflow";
import { getSessionUserFromCookies } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

export default async function MemberPage() {
  const user = await getSessionUserFromCookies();

  if (!user) {
    redirect("/login?next=/member");
  }

  if (!hasPermission(user.role, "booking:create:family")) {
    redirect("/guest");
  }

  return (
    <section className="grid">
      <article className="card grid">
        <span className="kicker">Member Section</span>
        <h1>Member Console</h1>
        <p className="lead">
          Welcome {user.name ?? user.email ?? "Member"}. Use the booking page to submit requests and check
          your booking history below.
        </p>
        <div>
          <Link href="/" className="btn-primary inline-action">
            Create New Booking
          </Link>
        </div>
      </article>

      <article className="grid">
        <h2>Active Bookings</h2>
        <ActiveBookingsPanel heading="Active House Bookings" emptyMessage="No active bookings currently." />
      </article>

      <article className="grid">
        <h2>My Booking History</h2>
        <MemberBookingsPanel />
      </article>

      <article className="grid">
        <h2>My Fees</h2>
        <MemberFeeTracker />
      </article>

      <article className="grid">
        <h2>Assets & Maintenance Workflow</h2>
        <MemberMaintenanceWorkflow />
      </article>

      <article className="grid">
        <h2>Decision Voting</h2>
        <MemberDecisionVoting />
      </article>
    </section>
  );
}
