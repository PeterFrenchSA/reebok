"use client";

import { useEffect, useState } from "react";

type Booking = {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
  totalGuests: number;
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

  useEffect(() => {
    async function loadBookings() {
      setLoading(true);
      setState({ type: "idle" });
      try {
        const response = await fetch("/api/bookings", { cache: "no-store" });
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

  return (
    <div className="grid">
      {bookings.map((booking) => (
        <article key={booking.id} className="card grid">
          <p>
            <strong>{booking.status}</strong>
          </p>
          <p className="lead">
            {new Date(booking.startDate).toISOString().slice(0, 10)} to{" "}
            {new Date(booking.endDate).toISOString().slice(0, 10)}
          </p>
          <p className="lead">
            Guests: {booking.totalGuests} | Amount: {formatMoney(booking.currency, booking.totalAmount)}
          </p>
          <p className="lead">Reference: {booking.id}</p>
        </article>
      ))}
    </div>
  );
}
