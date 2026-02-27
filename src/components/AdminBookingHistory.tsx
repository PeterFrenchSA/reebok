"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type BookingAuditLog = {
  id: string;
  action: string;
  comment?: string | null;
  createdAt: string;
  actorRole?: string | null;
  actor?: { name?: string | null; email?: string | null } | null;
};

type Booking = {
  id: string;
  status: string;
  source: string;
  scope: string;
  startDate: string;
  endDate: string;
  nights: number;
  totalGuests: number;
  currency: string;
  totalAmount: string | number | null;
  rejectionReason?: string | null;
  requestedBy?: { name: string; email: string } | null;
  approvedBy?: { name: string; email: string; role: string } | null;
  bookingAuditLogs?: BookingAuditLog[];
};

type PanelState = { type: "idle" | "error"; message?: string };

function dateLabel(value: string): string {
  return value.slice(0, 10);
}

function amountLabel(currency: string, amount: string | number | null): string {
  return `${currency} ${Number(amount ?? 0).toFixed(2)}`;
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

export function AdminBookingHistory() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<PanelState>({ type: "idle" });

  const history = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return bookings
      .filter((booking) => {
        if (booking.status === "REJECTED" || booking.status === "CANCELLED") {
          return true;
        }
        return new Date(booking.endDate) < today;
      })
      .sort((a, b) => b.endDate.localeCompare(a.endDate));
  }, [bookings]);

  const summary = useMemo(
    () => ({
      total: history.length,
      approved: history.filter((booking) => booking.status === "APPROVED").length,
      rejected: history.filter((booking) => booking.status === "REJECTED").length
    }),
    [history]
  );

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setState({ type: "idle" });
    try {
      const response = await fetch("/api/bookings?take=500", { cache: "no-store" });
      const data = (await response.json()) as { bookings?: Booking[]; error?: unknown };
      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Could not load booking history.") });
        return;
      }
      setBookings(data.bookings ?? []);
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not load booking history." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  if (loading) {
    return <p className="lead">Loading booking history...</p>;
  }

  return (
    <section className="grid">
      {state.type === "error" ? <p className="notice error">{state.message}</p> : null}

      <article className="card inline">
        <div className="metric">
          <strong>{summary.total}</strong>
          <span>Historical bookings</span>
        </div>
        <div className="metric">
          <strong>{summary.approved}</strong>
          <span>Approved and completed stays</span>
        </div>
        <div className="metric">
          <strong>{summary.rejected}</strong>
          <span>Rejected bookings</span>
        </div>
      </article>

      {history.length === 0 ? (
        <article className="card">
          <p className="lead">No historical bookings yet.</p>
        </article>
      ) : (
        history.map((booking) => (
          <article key={booking.id} className="card grid">
            <div className="status-line">
              <span className={`status-pill status-${booking.status.toLowerCase()}`}>{booking.status}</span>
              <span className="lead">{dateLabel(booking.startDate)} to {dateLabel(booking.endDate)}</span>
            </div>
            <p className="lead">
              {booking.source} / {booking.scope} | Guests: {booking.totalGuests} | {amountLabel(booking.currency, booking.totalAmount)}
            </p>
            <p className="lead">Requested by: {booking.requestedBy?.name ?? "External"} ({booking.requestedBy?.email ?? "No email"})</p>
            <p className="lead">Reviewed by: {booking.approvedBy?.name ?? "Not reviewed"}</p>
            {booking.rejectionReason ? <p className="notice error">Rejection reason: {booking.rejectionReason}</p> : null}
            <div className="audit-trail">
              <strong>Audit Trail</strong>
              {(booking.bookingAuditLogs ?? []).length === 0 ? (
                <p className="lead">No audit entries.</p>
              ) : (
                booking.bookingAuditLogs?.map((log) => (
                  <p key={log.id} className="lead">
                    {dateLabel(log.createdAt)} {log.action}: {log.comment ?? "No comment"} (
                    {log.actor?.name ?? log.actorRole ?? "System"})
                  </p>
                ))
              )}
            </div>
          </article>
        ))
      )}
    </section>
  );
}
