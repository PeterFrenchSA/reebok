import { redirect } from "next/navigation";
import { ActiveBookingsPanel } from "@/components/ActiveBookingsPanel";
import { AdminBookingApprovals } from "@/components/AdminBookingApprovals";
import { AdminBookingHistory } from "@/components/AdminBookingHistory";
import { AdminDecisionVoting } from "@/components/AdminDecisionVoting";
import { AdminExpensesLedger } from "@/components/AdminExpensesLedger";
import { AdminFeedbackModeration } from "@/components/AdminFeedbackModeration";
import { AdminFeeTracker } from "@/components/AdminFeeTracker";
import { AdminMaintenanceWorkflow } from "@/components/AdminMaintenanceWorkflow";
import { AdminUserManager } from "@/components/AdminUserManager";
import { getSessionUserFromCookies } from "@/lib/auth";
import { SAMPLE_ADMIN, SAMPLE_MEMBER } from "@/lib/default-users";
import { hasPermission } from "@/lib/rbac";

export default async function AdminPage() {
  const user = await getSessionUserFromCookies();

  if (!user) {
    redirect("/login?next=/admin");
  }

  if (!hasPermission(user.role, "booking:manage")) {
    redirect("/member");
  }

  return (
    <section className="grid">
      <article className="card grid">
        <span className="kicker">Admin Section</span>
        <h1>Admin Console</h1>
        <p className="lead">
          Manage user access below. You can update names, roles, activation, and passwords.
        </p>
      </article>

      <article className="card grid">
        <h2>Starter Accounts</h2>
        <p className="lead">These seeded accounts are available after `npm run prisma:seed`:</p>
        <ul className="list">
          <li>
            Admin: {SAMPLE_ADMIN.email} / {SAMPLE_ADMIN.password}
          </li>
          <li>
            Member: {SAMPLE_MEMBER.email} / {SAMPLE_MEMBER.password}
          </li>
        </ul>
      </article>

      <article className="grid">
        <h2>Active Bookings</h2>
        <ActiveBookingsPanel adminMode />
      </article>

      <article className="grid">
        <h2>Booking Approval Queue</h2>
        <AdminBookingApprovals />
      </article>

      <article className="grid">
        <h2>Booking History & Audit Trail</h2>
        <AdminBookingHistory />
      </article>

      <article className="grid">
        <h2>Expenses Ledger & Import/Export</h2>
        <AdminExpensesLedger />
      </article>

      <article className="grid">
        <h2>Assets & Maintenance Workflow</h2>
        <AdminMaintenanceWorkflow />
      </article>

      <article className="grid">
        <h2>Feedback Moderation</h2>
        <AdminFeedbackModeration />
      </article>

      <article className="grid">
        <h2>Member Fee Tracking</h2>
        <AdminFeeTracker />
      </article>

      <article className="grid">
        <h2>Decision Voting</h2>
        <AdminDecisionVoting />
      </article>

      <article className="grid">
        <h2>User Management</h2>
        <AdminUserManager />
      </article>
    </section>
  );
}
