import Link from "next/link";
import { redirect } from "next/navigation";
import { GuestFeedbackPanel } from "@/components/GuestFeedbackPanel";
import { MemberBookingsPanel } from "@/components/MemberBookingsPanel";
import { getSessionUserFromCookies } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

export default async function GuestPage() {
  const user = await getSessionUserFromCookies();

  if (!user) {
    redirect("/login?next=/guest");
  }

  const canAccessMember = hasPermission(user.role, "booking:create:family");
  const canAccessAdmin = hasPermission(user.role, "booking:manage");

  return (
    <section className="grid">
      <article className="card grid">
        <span className="kicker">Guest Services</span>
        <h1>Guest Booking Portal</h1>
        <p className="lead">
          Welcome {user.name ?? user.email ?? "Guest"}. Create new bookings, manage your current accommodation
          requests, and submit feedback to the house team.
        </p>
        <div className="action-row">
          <Link href="/" className="btn-primary inline-action">
            Create New Booking
          </Link>
          <Link href="/booking/manage" className="btn-secondary inline-action">
            Manage by Reference
          </Link>
          {canAccessMember ? (
            <Link href="/member" className="btn-secondary inline-action">
              Open Member Console
            </Link>
          ) : null}
          {canAccessAdmin ? (
            <Link href="/admin" className="btn-secondary inline-action">
              Open Admin Console
            </Link>
          ) : null}
        </div>
      </article>

      <section className="grid grid-2 guest-layout">
        <section className="grid">
          <article className="card grid">
            <h2>My Bookings & Accommodation</h2>
            <p className="lead">
              Track upcoming and past bookings. Use each booking reference to make updates when needed.
            </p>
            <MemberBookingsPanel />
          </article>

          <GuestFeedbackPanel defaultName={user.name} defaultEmail={user.email} />
        </section>

        <aside className="grid guest-bulletin">
          <article className="card grid">
            <h2>Useful Info</h2>
            <p className="lead">Important contacts and arrival reminders for all guests.</p>
            <div className="table-list">
              <div className="table-item">
                <p>
                  <strong>Emergency Services</strong>
                </p>
                <p className="lead">Police / Fire / Ambulance: 112</p>
              </div>
              <div className="table-item">
                <p>
                  <strong>House Manager</strong>
                </p>
                <p className="lead">+27 82 000 0000</p>
                <p className="lead">For access, keys, and urgent stay support.</p>
              </div>
              <div className="table-item">
                <p>
                  <strong>Maintenance Callout</strong>
                </p>
                <p className="lead">+27 82 111 1111</p>
                <p className="lead">Use for water, power, or safety-critical issues.</p>
              </div>
              <div className="table-item">
                <p>
                  <strong>Arrival Checklist</strong>
                </p>
                <ul className="list">
                  <li>Bring your booking reference from email.</li>
                  <li>Report damages or faults on arrival.</li>
                  <li>For pets, keep furniture and bedrooms pet-free.</li>
                </ul>
              </div>
            </div>
          </article>
        </aside>
      </section>
    </section>
  );
}
