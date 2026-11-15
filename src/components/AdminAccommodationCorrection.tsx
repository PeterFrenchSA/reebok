"use client";
import { FormEvent, useEffect, useState } from "react";
import { CalendarAvailability, emptyMemberCounts, MemberCounts, memberCategories, RoomAllocation } from "@/lib/booking-options";
import { MemberGuestCounts, RoomSelection } from "@/components/BookingRoomFields";
import type { FeeBreakdown } from "@/lib/fees";
import { MEMBER_MAX_STAY_NIGHTS } from "@/lib/stay-limits";

export type CorrectableBooking = { id: string; source: string; scope: string; startDate: string; endDate: string; nights: number;
  totalGuests: number; currency: string; totalAmount: string | number | null; updatedAt?: string; guestBreakdown?: unknown;
  roomAllocations?: RoomAllocation[] };

export function AdminAccommodationCorrection({ booking, onSaved }: { booking: CorrectableBooking; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  return <details className="card" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Correct member accommodation / release unused rooms</summary>
    {open && <CorrectionForm booking={booking} onSaved={onSaved} />}
  </details>;
}

function CorrectionForm({ booking, onSaved }: { booking: CorrectableBooking; onSaved: () => void }) {
  const [scope, setScope] = useState<"ROOM_SPECIFIC" | "WHOLE_HOUSE">(booking.scope === "ROOM_SPECIFIC" ? "ROOM_SPECIFIC" : "WHOLE_HOUSE");
  const [allocations, setAllocations] = useState<RoomAllocation[]>((booking.roomAllocations ?? []).map(({ roomId, guestCount, guestLabel }) => ({ roomId, guestCount, guestLabel: guestLabel ?? "" })));
  const [counts, setCounts] = useState<MemberCounts>(() => {
    const existing = booking.guestBreakdown as Partial<MemberCounts> | null;
    if (booking.source === "INTERNAL" && existing) return Object.fromEntries(memberCategories.map(({ key }) => [key, Number(existing[key] ?? 0)])) as MemberCounts;
    return { ...emptyMemberCounts, member: 1, guestOfMember: Math.max(0, booking.totalGuests - 1) };
  });
  const [availability, setAvailability] = useState<CalendarAvailability | null>(null);
  const [quote, setQuote] = useState<{ key: string; feeConfigId: string; breakdown: FeeBreakdown } | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const key = JSON.stringify({ source: "INTERNAL", startDate: booking.startDate.slice(0, 10), nights: booking.nights, counts });
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/bookings/availability?mode=member&exclude=${encodeURIComponent(booking.id)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setAvailability(data); })
      .catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [booking.id]);
  useEffect(() => {
    const controller = new AbortController(); setQuote(null);
    const timer = setTimeout(() => {
      fetch("/api/fees/calculate", { method: "POST", headers: { "Content-Type": "application/json" }, body: key, signal: controller.signal })
        .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); if (!controller.signal.aborted) { setQuote({ ...data, key }); setError(""); } })
        .catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!quote || quote.key !== key) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/bookings/${booking.id}/accommodation`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        scope, roomAllocations: scope === "WHOLE_HOUSE" ? [] : allocations, guestBreakdown: counts, reason,
        expectedUpdatedAt: booking.updatedAt, quotedTotal: quote.breakdown.total, quotedFeeConfigId: quote.feeConfigId
      }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Correction failed.");
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Correction failed."); }
    finally { setBusy(false); }
  }
  return <form className="grid correction-form" onSubmit={submit}><fieldset className="booking-fieldset grid" disabled={busy}>
    <legend>Admin correction</legend><p className="notice">For future family stays only. This recalculates the member estimate, resets approval and records your reason. No correction email is sent; notify the family directly. Public bookings can be converted only when owned by an active member.</p>
    <p className="lead">Member/family stays are limited to {MEMBER_MAX_STAY_NIGHTS} nights. Shorten longer stays through Change dates before correcting member accommodation.</p>
    <div className="field"><label htmlFor={`correction-scope-${booking.id}`}>Accommodation</label><select id={`correction-scope-${booking.id}`} value={scope} onChange={(e) => { setScope(e.target.value as typeof scope); setAllocations([]); }}><option value="WHOLE_HOUSE">Whole house</option><option value="ROOM_SPECIFIC">Selected rooms (shared family stay)</option></select></div>
    <MemberGuestCounts prefix={`correction-${booking.id}`} value={counts} onChange={setCounts} />
    <p className="lead">Guest categories must total {booking.totalGuests}, the existing party size.</p>
    {scope === "ROOM_SPECIFIC" && availability && <RoomSelection prefix={`correction-room-${booking.id}`} rooms={availability.rooms ?? []} bookings={availability.bookings} startDate={booking.startDate.slice(0, 10)} endDate={booking.endDate.slice(0, 10)} value={allocations} onChange={setAllocations} />}
    <p>Previous estimate: {booking.currency} {Number(booking.totalAmount ?? 0).toFixed(2)}</p>
    {quote?.key === key && <p><strong>Revised estimate: {quote.breakdown.currency} {quote.breakdown.total.toFixed(2)}</strong></p>}
    <div className="field"><label htmlFor={`correction-reason-${booking.id}`}>Reason and family agreement</label><textarea id={`correction-reason-${booking.id}`} minLength={5} maxLength={1000} required value={reason} onChange={(e) => setReason(e.target.value)} /></div>
    {error && <p className="notice error" role="alert">{error} Refresh bookings before retrying if the booking changed.</p>}
    <button className="btn-primary" disabled={busy || !availability || !quote || quote.key !== key || Object.values(counts).reduce((a, b) => a + b, 0) !== booking.totalGuests}>Save correction and request approval</button>
  </fieldset></form>;
}
