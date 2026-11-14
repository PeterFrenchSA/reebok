"use client";

import { useEffect, useState } from "react";
import { AccommodationSummary, BookingAccommodationSummary } from "@/components/BookingRoomFields";
import { BOOKINGS_CHANGED } from "@/lib/booking-events";

type Booking = AccommodationSummary & {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
  totalGuests: number;
  petCount?: number | null;
  currency: string;
  totalAmount: string | number | null;
};

type PanelState = {
  type: "idle" | "error";
  message?: string;
};

function formatMoney(currency: string, amount: string | number | null): string {
  const value = Number(amount ?? 0);
  return `${currency} ${value.toFixed(2)}`;
}

export function MemberBookingsPanel() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<PanelState>({ type: "idle" });
  const [history, setHistory] = useState(false);

  useEffect(() => {
    async function loadBookings() {
      setLoading(true);
      setState({ type: "idle" });
      try {
        const response = await fetch("/api/bookings?mineOnly=true", { cache: "no-store" });
        const data = await response.json();

        if (!response.ok) {
          setState({
            type: "error",
            message: typeof data.error === "string" ? data.error : "Could not load bookings."
          });
          return;
        }

        setBookings((data.bookings ?? []) as Booking[]);
      } catch (error) {
        console.error(error);
        setState({ type: "error", message: "Could not load bookings." });
      } finally {
        setLoading(false);
      }
    }

    void loadBookings();
    window.addEventListener(BOOKINGS_CHANGED, loadBookings);
    return () => window.removeEventListener(BOOKINGS_CHANGED, loadBookings);
  }, []);

  if (loading) {
    return <p className="lead">Loading bookings...</p>;
  }

  if (state.type === "error") {
    return <p className="notice error">{state.message}</p>;
  }

  if (bookings.length === 0) {
    return (
      <article className="card">
        <p className="lead">No bookings found yet. Use the booking page to submit your first request.</p>
      </article>
    );
  }

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const upcoming = (booking: Booking) => ["PENDING", "APPROVED"].includes(booking.status) && booking.endDate.slice(0, 10) > today;
  const visible = bookings.filter((booking) => history ? !upcoming(booking) : upcoming(booking))
    .sort((a, b) => history ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate));
  return (
    <div className="grid">
      <div className="segmented-control" aria-label="My booking list"><button type="button" aria-pressed={!history} onClick={() => setHistory(false)}>Current & upcoming</button><button type="button" aria-pressed={history} onClick={() => setHistory(true)}>Booking history</button></div>
      {!visible.length && <p className="notice">{history ? "No past, rejected or cancelled stays." : "No current or upcoming stays."}</p>}
      {visible.map((booking) => (
        <article key={booking.id} className="card grid">
          <p>
            <span className={`status-pill status-${booking.status.toLowerCase()}`}>{booking.status === "PENDING" ? "Awaiting approval" : booking.status}</span>
          </p>
          <p className="lead">
            {new Date(booking.startDate).toISOString().slice(0, 10)} to{" "}
            {new Date(booking.endDate).toISOString().slice(0, 10)}
          </p>
          <p className="lead">
            Guests: {booking.totalGuests} | Estimate: {formatMoney(booking.currency, booking.totalAmount)}
          </p>
          <p className="lead">Pets: {booking.petCount ?? 0}</p>
          <BookingAccommodationSummary booking={booking} />
          <p className="lead">Reference: {booking.id}</p>
          <div className="action-row">
            <a className="btn-secondary inline-action" href={`/booking/manage?reference=${encodeURIComponent(booking.id)}`}>
              Manage Booking
            </a>
          </div>
        </article>
      ))}
      <p className="lead">Pending and approved stays hold their accommodation. Approval and estimates are not payment receipts.</p>
    </div>
  );
}
