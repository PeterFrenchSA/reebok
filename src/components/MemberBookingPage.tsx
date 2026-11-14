"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { BookingCalendar } from "@/components/BookingCalendar";
import { MemberGuestCounts, RoomSelection } from "@/components/BookingRoomFields";
import { CalendarAvailability, emptyMemberCounts, MemberCounts, RoomAllocation, roomHolds } from "@/lib/booking-options";
import { DEFAULT_PET_NOTICE } from "@/lib/booking-policy";
import type { FeeBreakdown } from "@/lib/fees";

type Quote = { breakdown: FeeBreakdown; feeConfigId: string; key: string };
export function MemberBookingPage({ name = "", email = "" }: { name?: string; email?: string }) {
  const [scope, setScope] = useState<"ROOM_SPECIFIC" | "WHOLE_HOUSE">("ROOM_SPECIFIC");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [counts, setCounts] = useState<MemberCounts>({ ...emptyMemberCounts, member: 1 });
  const [allocations, setAllocations] = useState<RoomAllocation[]>([]);
  const [availability, setAvailability] = useState<CalendarAvailability | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [quoteRevision, setQuoteRevision] = useState(0);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [leadName, setLeadName] = useState(name);
  const [phone, setPhone] = useState("");
  const [pets, setPets] = useState(0);
  const [petNotice, setPetNotice] = useState(DEFAULT_PET_NOTICE);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const nights = startDate && endDate ? Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86400000) : 0;
  const totalGuests = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const quoteKey = JSON.stringify({ source: "INTERNAL", startDate, nights, counts });
  const rooms = availability?.rooms ?? [];
  const selectedRooms = rooms.filter((room) => allocations.some((item) => item.roomId === room.id));
  const allocated = allocations.reduce((sum, item) => sum + item.guestCount, 0);
  const datesReady = nights >= 1 && nights <= 90;
  const capacity = (scope === "WHOLE_HOUSE" ? rooms : selectedRooms).reduce((sum, room) => sum + room.capacity, 0);
  const conflict = datesReady && (scope === "WHOLE_HOUSE" ? roomHolds(availability?.bookings ?? [], startDate, endDate).length > 0
    : allocations.some((item) => roomHolds(availability?.bookings ?? [], startDate, endDate, item.roomId).length > 0));
  const allocationValid = scope === "WHOLE_HOUSE" || (allocations.length > 0 && allocated === totalGuests && allocations.every((item) => item.guestCount >= 1 && item.guestCount <= (rooms.find((room) => room.id === item.roomId)?.capacity ?? 0)));
  const currentQuote = quote?.key === quoteKey ? quote : null;
  const ready = Boolean(availability && datesReady && totalGuests > 0 && totalGuests <= capacity && allocationValid && !conflict && currentQuote);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/bookings/policy", { signal: controller.signal, cache: "no-store" }).then((r) => r.json()).then((data) => {
      if (data.policy?.petNotice) setPetNotice(data.policy.petNotice);
    }).catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setQuote(null); setQuoteError("");
    if (!datesReady || totalGuests < 1 || totalGuests > 50) return () => controller.abort();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/fees/calculate", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: quoteKey });
        const data = await response.json();
        if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not load member pricing.");
        if (!controller.signal.aborted) setQuote({ ...data, key: quoteKey });
      } catch (reason) { if (!controller.signal.aborted) setQuoteError(reason instanceof Error ? reason.message : "Could not load member pricing."); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [quoteKey, datesReady, totalGuests, quoteRevision]);

  async function submit(event: FormEvent) {
    event.preventDefault(); if (!ready || saving || reference || !currentQuote) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        source: "INTERNAL", scope, startDate, endDate, guestBreakdown: counts,
        roomAllocations: scope === "ROOM_SPECIFIC" ? allocations : [], externalLeadName: leadName, externalLeadEmail: email || undefined,
        externalLeadPhone: phone, petCount: pets, notes, quotedTotal: currentQuote.breakdown.total, quotedFeeConfigId: currentQuote.feeConfigId
      }) });
      const data = await response.json();
      if (!response.ok) { setAvailability(null); setRefresh((v) => v + 1); setQuoteRevision((v) => v + 1); throw new Error(typeof data.error === "string" ? data.error : "Could not submit this request."); }
      setReference(data.booking.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The response was lost. Check My Bookings before retrying to avoid duplicates."); }
    finally { setSaving(false); }
  }

  return <section className="grid member-booking-page">
    <header className="card grid member-booking-hero"><span className="kicker">Family stays</span><h1>Make room for everyone</h1>
      <p>Book a room, a few rooms, or an exclusive whole-house stay at the published member rates.</p>
      <p className="lead">Separate family bookings can share the same dates in different rooms. Every request needs admin approval.</p>
      <Link href="/member">Back to Member Console</Link>
    </header>
    {reference ? <section className="card grid notice success" role="status"><h2>Request received</h2><p>Your accommodation is held pending approval. Reference: <strong>{reference}</strong></p>
      <p>Estimated total: {currentQuote?.breakdown.currency} {currentQuote?.breakdown.total.toFixed(2)}. Approval is not proof of payment.</p>
      <div className="action-row"><Link href="/member" className="btn-primary inline-action">View My Bookings</Link><button type="button" className="btn-secondary" onClick={() => { setReference(""); setStartDate(""); setEndDate(""); setAllocations([]); setAvailability(null); setRefresh((v) => v + 1); }}>Book another stay</button></div>
    </section> : <form className="grid" onSubmit={submit}>
      <fieldset disabled={saving} className="booking-fieldset grid">
        <legend>1. Choose your stay</legend>
        <div className="stay-choices">{(["ROOM_SPECIFIC", "WHOLE_HOUSE"] as const).map((option) => <label key={option} className={`stay-choice ${scope === option ? "stay-choice-selected" : ""}`}>
          <input type="radio" name="stay-scope" value={option} checked={scope === option} onChange={() => { setScope(option); setAllocations([]); }} />
          <span><strong>{option === "ROOM_SPECIFIC" ? "Shared family stay" : "Whole house"}</strong><small>{option === "ROOM_SPECIFIC" ? "Reserve only the rooms you need" : "Exclusive use; every room must be free"}</small></span>
        </label>)}</div>
        <BookingCalendar startDate={startDate} endDate={endDate} onStartDateChange={setStartDate} onEndDateChange={setEndDate}
          memberMode scope={scope} roomIds={allocations.map((a) => a.roomId)} refreshKey={refresh} onAvailabilityLoaded={setAvailability} />
      </fieldset>
      <div className="member-booking-layout">
        <fieldset disabled={saving} className="booking-fieldset grid">
          <legend>2. Your family and accommodation</legend>
          <MemberGuestCounts value={counts} onChange={setCounts} />
          {scope === "ROOM_SPECIFIC" ? <RoomSelection rooms={rooms} bookings={availability?.bookings ?? []} startDate={startDate} endDate={endDate} value={allocations} onChange={setAllocations} />
            : <div className="card grid"><h2>Exclusive whole-house stay</h2><p>All {rooms.length} bookable rooms, up to {capacity} guests. Member guest-category prices still apply per person per night.</p><p className="notice">Use a shared family stay instead if other families should be able to reserve rooms on these dates.</p></div>}
          <div className="card grid"><h2>Contact and stay details</h2><div className="field"><label htmlFor="family-lead">Lead name / family</label><input id="family-lead" required maxLength={120} value={leadName} onChange={(e) => setLeadName(e.target.value)} /></div>
            <p className="lead">Booking updates go to your account email: {email || "contact an admin to check your email"}.</p>
            <div className="field"><label htmlFor="family-phone">Contact phone</label><input id="family-phone" type="tel" required maxLength={50} value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <div className="field"><label htmlFor="family-pets">Pets</label><input id="family-pets" type="number" required min={0} max={20} value={pets} onChange={(e) => setPets(Number(e.target.value))} /></div>
            {pets > 0 && <p className="notice" role="note"><strong>Pet notice: </strong>{petNotice}</p>}
            <div className="field"><label htmlFor="family-notes">Notes (optional)</label><textarea id="family-notes" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          </div>
        </fieldset>
        <aside className="card grid member-booking-summary"><span className="kicker">3. Review and request</span><h2>Your stay</h2>
          <p>{startDate || "Choose check-in"} to {endDate || "choose check-out"}</p><p><strong>{Math.max(0, nights)} nights / {totalGuests} guests</strong></p>
          <p>{scope === "WHOLE_HOUSE" ? "Whole house" : selectedRooms.map((room) => room.name).join(", ") || "Choose your rooms"}</p>
          {scope === "ROOM_SPECIFIC" && <p className={allocated === totalGuests && allocated > 0 ? "lead" : "notice"}>{allocated} of {totalGuests} guests assigned to rooms.</p>}
          {datesReady && capacity > 0 && totalGuests > capacity && <p className="notice error">Choose more rooms or reduce the guest count. Selected capacity: {capacity}.</p>}
          {conflict && <p className="notice error">These dates are not available for the selected accommodation.</p>}
          {!rooms.length && availability && <p className="notice">An admin needs to configure bookable rooms.</p>}
          {currentQuote ? <><ul className="quote-lines">{currentQuote.breakdown.lineItems.filter((item) => item.amount > 0).map((item) => <li key={item.label}><span>{item.label}</span><strong>{item.amount.toFixed(2)}</strong></li>)}</ul><p className="booking-total">{currentQuote.breakdown.currency} {currentQuote.breakdown.total.toFixed(2)}</p></>
            : <p className="lead">{quoteError ? "Estimate unavailable." : datesReady && totalGuests > 0 ? "Loading your estimate..." : "Choose dates and guests to see member pricing."}</p>}
          {quoteError && <p className="notice error" role="alert">{quoteError}</p>}
          <button type="button" className="btn-secondary" disabled={saving || !datesReady} onClick={() => setQuoteRevision((v) => v + 1)}>Refresh estimate</button>
          <p className="lead">Prices are checked again on submission. Pending requests hold only your selected accommodation until an admin approves or rejects them.</p>
          {error && <p className="notice error" role="alert">{error}</p>}
          <button type="submit" className="btn-primary" disabled={!ready || saving}>{saving ? "Submitting..." : "Request member booking"}</button>
        </aside>
      </div>
    </form>}
  </section>;
}
