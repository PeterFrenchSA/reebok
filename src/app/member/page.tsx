import Link from "next/link";
import { redirect } from "next/navigation";
import { MemberFeeTracker } from "@/components/MemberFeeTracker";
import { MemberBookingsPanel } from "@/components/MemberBookingsPanel";
import { getSessionUserFromCookies } from "@/lib/auth";

export default async function MemberPage() {
  const user = await getSessionUserFromCookies();

  if (!user) {
    redirect("/login?next=/member");
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
        <h2>My Bookings</h2>
        <MemberBookingsPanel />
      </article>

      <article className="grid">
        <h2>My Fees</h2>
        <MemberFeeTracker />
      </article>
    </section>
  );
}
