"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminAccommodationCorrection, CorrectableBooking } from "./AdminAccommodationCorrection";
import { AccommodationSummary, BookingAccommodationSummary } from "./BookingRoomFields";
import { notifyBookingsChanged } from "@/lib/booking-events";
import type { FeeBreakdown } from "@/lib/fees";
import { dateAfterNights, maxStayNights, stayLengthMessage } from "@/lib/stay-limits";

type Detail = CorrectableBooking & AccommodationSummary & {
  status: string; notes?: string | null; petCount: number; rejectionReason?: string | null;
  requestedBy?: { name: string; email: string } | null; externalLeadName?: string | null; externalLeadEmail?: string | null;
  bookingAuditLogs: Array<{ id: string; action: string; comment: string | null; createdAt: string; actor: { name: string } | null }>;
};
export function AdminBookingDetails({ id, revision }: { id: string; revision: number }) {
  const [booking, setBooking] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [comment, setComment] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setBooking(null); setError("");
    fetch(`/api/bookings/${encodeURIComponent(id)}`, { cache: "no-store", signal: controller.signal })
      .then(async (r) => { const data = await r.json(); if (!r.ok) throw new Error(data.error); setBooking(data.booking); })
      .catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [id, revision]);
  async function act(action: "approve" | "reject" | "comment") {
    if (!booking || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/bookings/${id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, comment, expectedUpdatedAt: booking.updatedAt }) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Check the reason or comment and try again.");
      setComment(""); setReason("");
      setNotice(action === "approve" ? "Booking approved. Approval does not confirm payment." : action === "reject" ? "Booking rejected and accommodation released." : "Comment saved to the audit trail.");
      notifyBookingsChanged();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save this action. Refresh before retrying."); }
    finally { setBusy(false); }
  }
  return <div className="grid">
    {error && <p className="notice error" role="alert">{error}</p>}
    {notice && <p className="notice success" role="status">{notice}</p>}
    {!booking ? <p className="lead">{error ? "Close and reopen the booking to reload it." : "Loading booking..."}</p> : <>
      <div className="status-line"><span className={`status-pill status-${booking.status.toLowerCase()}`}>{booking.status}</span><span>{booking.startDate.slice(0, 10)} to {booking.endDate.slice(0, 10)}</span></div>
      <h3>{booking.requestedBy?.name ?? booking.externalLeadName ?? "Guest stay"}</h3>
      <p>{booking.totalGuests} guests / {booking.petCount} pets / {booking.nights} nights</p>
      <BookingAccommodationSummary booking={booking} />
      <p>Estimate: {booking.currency} {Number(booking.totalAmount ?? 0).toFixed(2)}. Payment is tracked separately.</p>
      <p className="lead">{booking.requestedBy?.email ?? booking.externalLeadEmail ?? "No contact email"}</p>
      {booking.notes && <p className="feedback-text">{booking.notes}</p>}
      <p className="lead">Reference: {booking.id}</p>
      <fieldset className="booking-fieldset grid" disabled={busy}>
        {booking.status === "PENDING" && <button className="btn-primary" type="button" onClick={() => void act("approve")}>Approve booking</button>}
        {["PENDING", "APPROVED"].includes(booking.status) && <form className="grid" onSubmit={(e) => { e.preventDefault(); void act("reject"); }}>
          <div className="field"><label htmlFor="calendar-reject-reason">Rejection reason</label><input id="calendar-reject-reason" required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <button className="btn-secondary" type="submit">Reject and release accommodation</button>
        </form>}
        <form className="grid" onSubmit={(e) => { e.preventDefault(); void act("comment"); }}>
          <div className="field"><label htmlFor="calendar-admin-comment">Private admin comment</label><textarea id="calendar-admin-comment" required minLength={2} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} /></div>
          <button className="btn-secondary" type="submit">Add comment</button>
        </form>
      </fieldset>
      {["PENDING", "APPROVED"].includes(booking.status) && <>
        <details className="card"><summary>Change dates</summary><DateChange key={booking.updatedAt} booking={booking} /></details>
        <AdminAccommodationCorrection key={`${booking.id}-${booking.updatedAt}`} booking={booking} onSaved={notifyBookingsChanged} />
      </>}
      <details className="card" open><summary>Audit trail (latest 200 entries)</summary><ol className="feedback-history">
        {booking.bookingAuditLogs.map((log) => <li key={log.id}><strong>{log.action} / {log.actor?.name ?? "System"}</strong><p className="lead">{new Date(log.createdAt).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" })}</p><p className="feedback-text">{log.comment}</p></li>)}
      </ol></details>
    </>}
  </div>;
}

function DateChange({ booking }: { booking: Detail }) {
  const [start, setStart] = useState(booking.startDate.slice(0, 10));
  const [end, setEnd] = useState(booking.endDate.slice(0, 10));
  const [reason, setReason] = useState("");
  const [quote, setQuote] = useState<{ key: string; feeConfigId: string; breakdown: FeeBreakdown } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const nights = (Date.parse(end) - Date.parse(start)) / 86400000;
  const maxNights = maxStayNights(booking.source);
  const validLength = Number.isInteger(nights) && nights >= 1 && nights <= maxNights;
  const key = JSON.stringify({ source: booking.source, startDate: start, nights, counts: booking.guestBreakdown });
  useEffect(() => {
    const controller = new AbortController(); setQuote(null); setError("");
    if (!start || !end || !validLength) return () => controller.abort();
    const timer = setTimeout(() => {
      fetch("/api/fees/calculate", { method: "POST", headers: { "Content-Type": "application/json" }, body: key, signal: controller.signal })
        .then(async (r) => { const data = await r.json(); if (!r.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not quote these dates."); if (!controller.signal.aborted) setQuote({ ...data, key }); })
        .catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, start, end, validLength]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!validLength || !quote || quote.key !== key || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/bookings/${booking.id}/dates`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        startDate: start, endDate: end, reason, expectedUpdatedAt: booking.updatedAt, quotedTotal: quote.breakdown.total, quotedFeeConfigId: quote.feeConfigId
      }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      notifyBookingsChanged();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not reschedule booking."); }
    finally { setBusy(false); }
  }
  return <form className="grid correction-form" onSubmit={save}>
    <p className="notice">Rooms and guest categories stay unchanged. Saving checks availability, recalculates the estimate, records your reason and resets approval. Notify the family directly; no rescheduling email is sent.</p>
    <fieldset className="booking-fieldset grid" disabled={busy}>
      <div className="grid grid-2"><div className="field"><label htmlFor="reschedule-start">New check-in</label><input id="reschedule-start" type="date" required value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div className="field"><label htmlFor="reschedule-end">New check-out</label><input id="reschedule-end" type="date" required min={dateAfterNights(start, 1)} max={dateAfterNights(start, maxNights)} value={end} onChange={(e) => setEnd(e.target.value)} /></div></div>
      <p className={validLength ? "lead" : "notice error"}>{stayLengthMessage(booking.source)} Existing records are not shortened automatically.</p>
      {quote?.key === key && <p><strong>Revised estimate: {quote.breakdown.currency} {quote.breakdown.total.toFixed(2)}</strong></p>}
      <div className="field"><label htmlFor="reschedule-reason">Reason and family agreement</label><textarea id="reschedule-reason" required minLength={5} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      {error && <p className="notice error" role="alert">{error}</p>}
      <button className="btn-primary" disabled={!validLength || !quote || quote.key !== key || (start === booking.startDate.slice(0, 10) && end === booking.endDate.slice(0, 10))}>Confirm new dates and reset approval</button>
    </fieldset>
  </form>;
}
