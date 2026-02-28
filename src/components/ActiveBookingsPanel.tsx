"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type BookingUser = {
  id?: string;
  name: string;
  email: string;
  role?: string;
};

type BookingAuditLog = {
  id: string;
  action: "CREATED" | "APPROVED" | "REJECTED" | "COMMENT" | string;
  comment?: string | null;
  createdAt: string;
  actorRole?: string | null;
  actor?: BookingUser | null;
};

type Booking = {
  id: string;
  source: string;
  scope: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | string;
  startDate: string;
  endDate: string;
  nights: number;
  totalGuests: number;
  petCount?: number | null;
  currency: string;
  totalAmount: string | number | null;
  notes?: string | null;
  rejectionReason?: string | null;
  requestedBy?: BookingUser | null;
  approvedBy?: BookingUser | null;
  bookingAuditLogs?: BookingAuditLog[];
};

type PanelState = { type: "idle" | "success" | "error"; message?: string };

function dateLabel(value: string): string {
  return value.slice(0, 10);
}

function moneyLabel(currency: string, amount: string | number | null): string {
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

type Props = {
  adminMode?: boolean;
  heading?: string;
  emptyMessage?: string;
};

export function ActiveBookingsPanel({
  adminMode = false,
  heading = "Active Bookings",
  emptyMessage = "No active bookings right now."
}: Props) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<PanelState>({ type: "idle" });
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [rejectDrafts, setRejectDrafts] = useState<Record<string, string>>({});

  const activeBookings = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return bookings
      .filter((booking) => {
        const isVisibleStatus = booking.status === "PENDING" || booking.status === "APPROVED";
        if (!isVisibleStatus) {
          return false;
        }
        const end = new Date(booking.endDate);
        return end >= today;
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [bookings, adminMode]);

  const loadBookings = useCallback(async () => {
    setLoading(true);
    setState({ type: "idle" });
    try {
      const response = await fetch("/api/bookings?take=400", { cache: "no-store" });
      const data = (await response.json()) as { bookings?: Booking[]; error?: unknown };
      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Could not load bookings.") });
        return;
      }
      setBookings(data.bookings ?? []);
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not load bookings." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  async function approve(bookingId: string) {
    setProcessingId(bookingId);
    setState({ type: "idle" });
    try {
      const response = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/approve`, { method: "POST" });
      const data = (await response.json()) as { error?: unknown };
      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Approval failed.") });
        return;
      }
      await loadBookings();
      setState({ type: "success", message: `Approved ${bookingId}.` });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Approval failed." });
    } finally {
      setProcessingId(null);
    }
  }

  async function addComment(bookingId: string) {
    const comment = (commentDrafts[bookingId] ?? "").trim();
    if (comment.length < 2) {
      setState({ type: "error", message: "Comment must be at least 2 characters." });
      return;
    }

    setProcessingId(bookingId);
    setState({ type: "idle" });
    try {
      const response = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment })
      });
      const data = (await response.json()) as { error?: unknown };
      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Could not save comment.") });
        return;
      }

      setCommentDrafts((current) => ({ ...current, [bookingId]: "" }));
      await loadBookings();
      setState({ type: "success", message: "Comment added to booking trail." });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not save comment." });
    } finally {
      setProcessingId(null);
    }
  }

  async function reject(bookingId: string) {
    const reason = (rejectDrafts[bookingId] ?? "").trim();
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
        setState({ type: "error", message: errorMessage(data, "Rejection failed.") });
        return;
      }

      setRejectDrafts((current) => ({ ...current, [bookingId]: "" }));
      await loadBookings();
      setState({ type: "success", message: `Rejected ${bookingId}.` });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Rejection failed." });
    } finally {
      setProcessingId(null);
    }
  }

  if (loading) {
    return <p className="lead">Loading active bookings...</p>;
  }

  return (
    <section className="grid">
      <article className="card grid">
        <h3>{heading}</h3>
        <p className="lead">
          Current and upcoming booking requests with live audit trail entries.
        </p>
      </article>

      {state.type === "error" ? <p className="notice error">{state.message}</p> : null}
      {state.type === "success" ? <p className="notice success">{state.message}</p> : null}

      {activeBookings.length === 0 ? (
        <article className="card">
          <p className="lead">{emptyMessage}</p>
        </article>
      ) : (
        activeBookings.map((booking) => {
          const requester = booking.requestedBy?.name ?? "External request";
          const requestEmail = booking.requestedBy?.email ?? "Not available";
          const isProcessing = processingId === booking.id;
          const rejectionLogs = (booking.bookingAuditLogs ?? []).filter((log) => log.action === "REJECTED");
          return (
            <article key={booking.id} className="card grid">
              <div className="status-line">
                <span className={`status-pill status-${booking.status.toLowerCase()}`}>{booking.status}</span>
                <span className="lead">{dateLabel(booking.startDate)} to {dateLabel(booking.endDate)}</span>
              </div>
              <p className="lead">
                Guests: {booking.totalGuests} | {moneyLabel(booking.currency, booking.totalAmount)} | {booking.source}
              </p>
              <p className="lead">Pets: {booking.petCount ?? 0}</p>
              <p className="lead">
                Requester: {requester} ({requestEmail})
              </p>
              <p className="lead">Reference: {booking.id}</p>
              {booking.notes ? <p className="lead">Notes: {booking.notes}</p> : null}
              {booking.rejectionReason ? <p className="notice error">Latest rejection: {booking.rejectionReason}</p> : null}

              {rejectionLogs.length > 0 ? (
                <div className="audit-trail">
                  <strong>Rejection Log</strong>
                  {rejectionLogs.map((log) => (
                    <p key={log.id} className="lead">
                      {dateLabel(log.createdAt)}: {log.comment ?? "Rejected"} ({log.actor?.name ?? log.actorRole ?? "Admin"})
                    </p>
                  ))}
                </div>
              ) : null}

              <div className="audit-trail">
                <strong>Audit Trail</strong>
                {(booking.bookingAuditLogs ?? []).length === 0 ? (
                  <p className="lead">No audit entries yet.</p>
                ) : (
                  booking.bookingAuditLogs?.map((log) => (
                    <p key={log.id} className="lead">
                      {dateLabel(log.createdAt)} {log.action}: {log.comment ?? "No comment"} (
                      {log.actor?.name ?? log.actorRole ?? "System"})
                    </p>
                  ))
                )}
              </div>

              {adminMode ? (
                <div className="grid">
                  <div className="field">
                    <label htmlFor={`booking-comment-${booking.id}`}>Admin comment</label>
                    <input
                      id={`booking-comment-${booking.id}`}
                      value={commentDrafts[booking.id] ?? ""}
                      onChange={(event) =>
                        setCommentDrafts((current) => ({ ...current, [booking.id]: event.target.value }))
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`booking-reject-${booking.id}`}>Reject reason</label>
                    <input
                      id={`booking-reject-${booking.id}`}
                      value={rejectDrafts[booking.id] ?? ""}
                      onChange={(event) =>
                        setRejectDrafts((current) => ({ ...current, [booking.id]: event.target.value }))
                      }
                    />
                  </div>
                  <div className="action-row">
                    {booking.status === "PENDING" ? (
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={isProcessing}
                        onClick={() => void approve(booking.id)}
                      >
                        {isProcessing ? "Working..." : "Approve"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={isProcessing}
                      onClick={() => void addComment(booking.id)}
                    >
                      {isProcessing ? "Working..." : "Add Comment"}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={isProcessing}
                      onClick={() => void reject(booking.id)}
                    >
                      {isProcessing ? "Working..." : "Reject Booking"}
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })
      )}
    </section>
  );
}
