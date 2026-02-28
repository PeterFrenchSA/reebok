import Link from "next/link";
import { redirect } from "next/navigation";
import { GuestFeedbackPanel } from "@/components/GuestFeedbackPanel";
import { MemberBookingsPanel } from "@/components/MemberBookingsPanel";
import { getSessionUserFromCookies } from "@/lib/auth";
import {
  BOOKING_POLICY_ID,
  DEFAULT_GUEST_BULLETIN_BODY,
  DEFAULT_GUEST_BULLETIN_TITLE,
  DEFAULT_PET_NOTICE
} from "@/lib/booking-policy";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

export default async function GuestPage() {
  const user = await getSessionUserFromCookies();

  if (!user) {
    redirect("/login?next=/guest");
  }

  const canAccessMember = hasPermission(user.role, "booking:create:family");
  const canAccessAdmin = hasPermission(user.role, "booking:manage");
  const policy = await prisma.bookingPolicy.upsert({
    where: { id: BOOKING_POLICY_ID },
    update: {},
    create: {
      id: BOOKING_POLICY_ID,
      petNotice: DEFAULT_PET_NOTICE,
      guestBulletinTitle: DEFAULT_GUEST_BULLETIN_TITLE,
      guestBulletinBody: DEFAULT_GUEST_BULLETIN_BODY
    },
    select: {
      guestBulletinTitle: true,
      guestBulletinBody: true
    }
  });
  const bulletinItems = policy.guestBulletinBody
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

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
            <h2>{policy.guestBulletinTitle}</h2>
            <p className="lead">This notice board is maintained by administrators.</p>
            <ul className="list">
              {bulletinItems.map((item, index) => (
                <li key={`${index}-${item}`}>{item}</li>
              ))}
            </ul>
          </article>
        </aside>
      </section>
    </section>
  );
}
