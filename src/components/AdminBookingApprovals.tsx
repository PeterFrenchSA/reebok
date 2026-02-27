"use client";

import { useCallback, useEffect, useState } from "react";

type BookingUser = {
  name: string;
  email: string;
};

type Booking = {
  id: string;
  source: string;
  scope: string;
  status: string;
  startDate: string;
  endDate: string;
  nights: number;
  totalGuests: number;
  petCount?: number | null;
  currency: string;
  totalAmount: string | number | null;
  notes?: string | null;
  externalLeadName?: string | null;
  externalLeadEmail?: string | null;
  requestedBy?: BookingUser | null;
};

type PanelState = {
  type: "idle" | "success" | "error";
  message?: string;
};

function formatMoney(currency: string, amount: string | number | null): string {
  const value = Number(amount ?? 0);
  return `${currency} ${value.toFixed(2)}`;
}

function errorMessage(data: unknown, fallback: string): string {
  if (typeof data === "object" && data !== null && "error" in data) {
    const err = (data as { error?: unknown }).error;
    if (typeof err === "string") {
      return err;
    }
  }
  return fallback;
}

export function AdminBookingApprovals() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<PanelState>({ type: "idle" });
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});

  const loadPendingBookings = useCallback(async () => {
    setLoading(true);
    setState({ type: "idle" });
    try {
      const response = await fetch("/api/bookings?status=PENDING", { cache: "no-store" });
      const data = (await response.json()) as { bookings?: Booking[]; error?: unknown };

      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Could not load pending bookings.") });
        return;
      }

      setBookings(data.bookings ?? []);
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not load pending bookings." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPendingBookings();
  }, [loadPendingBookings]);

  async function approveBooking(bookingId: string) {
    setProcessingId(bookingId);
    setState({ type: "idle" });
    try {
      const response = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/approve`, {
        method: "POST"
      });
      const data = (await response.json()) as { error?: unknown };

      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Booking approval failed.") });
        return;
      }

      setBookings((current) => current.filter((booking) => booking.id !== bookingId));
      setState({ type: "success", message: `Approved booking ${bookingId}.` });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Booking approval failed." });
    } finally {
      setProcessingId(null);
    }
  }

  async function rejectBooking(bookingId: string) {
    const reason = (rejectReasons[bookingId] ?? "").trim();
    if (reason.length < 3) {
      setState({ type: "error", message: "Rejection reason must be at least 3 characters." });
      return;
    }

    setProcessingId(bookingId);
    setState({ type: "idle" });
    try {
      const response = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason })
      });
      const data = (await response.json()) as { error?: unknown };

      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Booking rejection failed.") });
        return;
      }

      setBookings((current) => current.filter((booking) => booking.id !== bookingId));
      setRejectReasons((current) => {
        const next = { ...current };
        delete next[bookingId];
        return next;
      });
      setState({ type: "success", message: `Rejected booking ${bookingId}.` });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Booking rejection failed." });
    } finally {
      setProcessingId(null);
    }
  }

  if (loading) {
    return <p className="lead">Loading pending bookings...</p>;
  }

  return (
    <section className="grid">
      {state.type === "error" ? <p className="notice error">{state.message}</p> : null}
      {state.type === "success" ? <p className="notice success">{state.message}</p> : null}

      {bookings.length === 0 ? (
        <article className="card">
          <p className="lead">No pending bookings require approval right now.</p>
        </article>
      ) : (
        bookings.map((booking) => {
          const requester = booking.requestedBy?.name ?? booking.externalLeadName ?? "Unspecified";
          const requesterEmail = booking.requestedBy?.email ?? booking.externalLeadEmail ?? "No email";
          const isProcessing = processingId === booking.id;

          return (
            <article key={booking.id} className="card grid">
              <p>
                <strong>{booking.source}</strong> / {booking.scope}
              </p>
              <p className="lead">
                {booking.startDate.slice(0, 10)} to {booking.endDate.slice(0, 10)} ({booking.nights} nights)
              </p>
              <p className="lead">
                Guests: {booking.totalGuests} | Estimate: {formatMoney(booking.currency, booking.totalAmount)}
              </p>
              <p className="lead">Pets: {booking.petCount ?? 0}</p>
              <p className="lead">
                Requester: {requester} ({requesterEmail})
              </p>
              {booking.notes ? <p className="lead">Notes: {booking.notes}</p> : null}
              <p className="lead">Reference: {booking.id}</p>

              <div className="field">
                <label htmlFor={`reject-${booking.id}`}>Rejection reason</label>
                <input
                  id={`reject-${booking.id}`}
                  value={rejectReasons[booking.id] ?? ""}
                  placeholder="Required if rejecting"
                  onChange={(event) =>
                    setRejectReasons((current) => ({
                      ...current,
                      [booking.id]: event.target.value
                    }))
                  }
                />
              </div>

              <div className="action-row">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={isProcessing}
                  onClick={() => void approveBooking(booking.id)}
                >
                  {isProcessing ? "Processing..." : "Approve"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={isProcessing}
                  onClick={() => void rejectBooking(booking.id)}
                >
                  {isProcessing ? "Processing..." : "Reject"}
                </button>
              </div>
            </article>
          );
        })
      )}
    </section>
  );
}
