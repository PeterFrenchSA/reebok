"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookingCalendarData, CalendarEntry, occupiesDay, occupiesRoom } from "@/lib/booking-calendar";
import { BOOKINGS_CHANGED } from "@/lib/booking-events";
import { AdminBookingDetails } from "./AdminBookingDetails";

const add = (day: string, count: number) => new Date(Date.parse(day) + count * 86400000).toISOString().slice(0, 10);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const monthName = (day: string) => new Date(day).toLocaleDateString("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLabel = (day: string) => new Date(day).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
function monthStart(day: string) { return `${day.slice(0, 7)}-01`; }
function moveMonth(day: string, count: number) { const date = new Date(monthStart(day)); date.setUTCMonth(date.getUTCMonth() + count); return date.toISOString().slice(0, 10); }
const roomLabel = (entry: CalendarEntry) => entry.scope === "WHOLE_HOUSE" ? "Whole house" : entry.rooms.map((room) => room.name).join(", ") || "Allocation needs review";

export function BookingManagementCalendar({ adminMode = false, initialDate, initialBookingId }: { adminMode?: boolean; initialDate?: string; initialBookingId?: string }) {
  const [view, setView] = useState<"planner" | "month" | "agenda">("planner");
  const [anchor, setAnchor] = useState(() => initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) && Number.isFinite(Date.parse(initialDate)) && new Date(initialDate).toISOString().slice(0, 10) === initialDate ? initialDate : today());
  const [status, setStatus] = useState("ACTIVE");
  const [room, setRoom] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [data, setData] = useState<BookingCalendarData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<CalendarEntry | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const openedInitialBooking = useRef(false);
  const range = useMemo(() => {
    if (view === "planner") return { start: anchor, end: add(anchor, 14) };
    if (view === "agenda") return { start: monthStart(anchor), end: moveMonth(anchor, 1) };
    const start = add(monthStart(anchor), -((new Date(monthStart(anchor)).getUTCDay() + 6) % 7));
    return { start, end: add(start, 42) };
  }, [anchor, view]);
  const days = useMemo(() => Array.from({ length: Math.round((Date.parse(range.end) - Date.parse(range.start)) / 86400000) }, (_, n) => add(range.start, n)), [range]);
  useEffect(() => { if (matchMedia("(max-width: 700px)").matches) setView("agenda"); }, []);
  useEffect(() => {
    if (!data || !initialBookingId || openedInitialBooking.current) return;
    const entry = data.bookings.find((booking) => booking.id === initialBookingId);
    if (entry) { openedInitialBooking.current = true; setSelected(entry); }
  }, [data, initialBookingId]);
  useEffect(() => {
    const refresh = () => setRevision((n) => n + 1);
    window.addEventListener(BOOKINGS_CHANGED, refresh);
    return () => window.removeEventListener(BOOKINGS_CHANGED, refresh);
  }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(""); setData(null);
    const query = new URLSearchParams({ ...range, status });
    fetch(`/api/bookings/calendar?${query}`, { cache: "no-store", signal: controller.signal })
      .then(async (r) => { const next = await r.json(); if (!r.ok) throw new Error(next.error); if (!controller.signal.aborted) setData(next); })
      .catch((e) => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [range, status, revision]);
  useEffect(() => {
    if (selected) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selected]);
  const bookings = (data?.bookings ?? []).filter((entry) => !room || (room === "house" ? entry.scope === "WHOLE_HOUSE" : occupiesRoom(entry, room)));
  const rooms = (data?.rooms ?? []).filter((r) => !room || room === "house" || r.id === room);
  function bookingButton(entry: CalendarEntry, compact = false) {
    return <button type="button" key={entry.id} className={`calendar-booking calendar-${entry.status.toLowerCase()}`} onClick={() => setSelected(entry)}
      title={`${entry.displayName}: ${entry.startDate.slice(0, 10)} to ${entry.endDate.slice(0, 10)}, ${roomLabel(entry)}, ${entry.status}`}>
      <strong>{entry.displayName}{entry.isOwnBooking ? " (you)" : ""}</strong><span>{entry.status.toLowerCase().replaceAll("_", " ")}{!compact ? ` / ${roomLabel(entry)}` : ""}</span>
    </button>;
  }
  return <section className="grid management-calendar" aria-label="Booking calendar">
    <div className="calendar-toolbar card grid">
      <div className="status-line"><div><span className="kicker">At a glance</span><h2>{view === "planner" ? `${dayLabel(range.start)} - ${dayLabel(add(range.end, -1))}` : monthName(anchor)}</h2></div>
        <div className="segmented-control" aria-label="Calendar view">{(["planner", "month", "agenda"] as const).map((option) => <button key={option} type="button" aria-pressed={view === option} onClick={() => setView(option)}>{option === "planner" ? "Room planner" : option === "month" ? "Month" : "Agenda"}</button>)}</div></div>
      <div className="calendar-controls">
        <div className="action-row"><button type="button" className="btn-secondary" onClick={() => setAnchor(view === "planner" ? add(anchor, -14) : moveMonth(anchor, -1))}>Previous</button><button type="button" className="btn-secondary" onClick={() => setAnchor(today())}>Today</button><button type="button" className="btn-secondary" onClick={() => setAnchor(view === "planner" ? add(anchor, 14) : moveMonth(anchor, 1))}>Next</button></div>
        <div className="field"><label htmlFor="calendar-period">Jump to date</label><input id="calendar-period" type="date" required value={anchor} onChange={(e) => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && Number.isFinite(Date.parse(e.target.value))) setAnchor(e.target.value); }} /></div>
        <button type="button" className="btn-secondary calendar-filter-toggle" aria-expanded={filtersOpen} aria-controls="calendar-extra-controls" onClick={() => setFiltersOpen(!filtersOpen)}>{filtersOpen ? "Hide filters & help" : `Filters & calendar help${room || status !== "ACTIVE" ? " (filtered)" : ""}`}</button>
      </div>
      <div id="calendar-extra-controls" className={`calendar-extra-controls ${filtersOpen ? "is-open" : ""}`}>
      <div className="calendar-controls">
        <div className="field"><label htmlFor="calendar-room">Accommodation</label><select id="calendar-room" value={room} onChange={(e) => setRoom(e.target.value)}><option value="">All rooms and house</option><option value="house">Whole-house stays</option>{data?.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
        <div className="field"><label htmlFor="calendar-status">Status</label><select id="calendar-status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="ACTIVE">Pending + approved</option><option value="PENDING">Pending approval</option><option value="APPROVED">Approved</option>{adminMode && <option value="ALL">All, including rejected / cancelled</option>}</select></div>
      </div>
      <div className="calendar-legend"><span className="status-pill status-pending">Pending: accommodation held</span><span className="status-pill status-approved">Approved: accommodation held</span><span className="lead">Checkout day is free for the next stay.</span></div>
      <p className="lead">{adminMode ? "Select a stay to review, approve, comment or make an audited change. No drag-and-drop changes." : "See which family members are staying. Guest stays are anonymous; contact details, prices and admin notes remain private."}</p>
      <button type="button" className="text-action" onClick={() => setRevision((n) => n + 1)}>Refresh calendar</button>
      </div>
    </div>
    {error && <p className="notice error" role="alert">{error}</p>}
    {loading && <p role="status">Loading calendar...</p>}
    {data && <>
      {view === "planner" && <div className="calendar-scroll card" tabIndex={0} role="region" aria-label="Room planner, scroll horizontally for all dates"><div className="room-planner">
        <div className="planner-row planner-heading"><strong className="planner-room">Room / capacity</strong><div className="planner-days">{days.map((day) => <span key={day} className={day === data.today ? "planner-today" : ""}>{dayLabel(day)}</span>)}</div></div>
        {rooms.map((r) => <div className="planner-row" key={r.id}><div className="planner-room"><strong>{r.name}</strong><small>Sleeps {r.capacity}{!r.isBookable ? " / unavailable" : ""}</small></div>
          <div className="planner-stays">{bookings.filter((entry) => occupiesRoom(entry, r.id)).map((entry) => {
            const start = Math.max(0, Math.floor((Date.parse(entry.startDate.slice(0, 10)) - Date.parse(range.start)) / 86400000));
            const end = Math.min(14, Math.ceil((Date.parse(entry.endDate.slice(0, 10)) - Date.parse(range.start)) / 86400000));
            return <div className="planner-bar" key={entry.id} style={{ gridColumn: `${start + 1} / ${end + 1}` }}>{bookingButton(entry, true)}</div>;
          })}</div></div>)}
        {!rooms.length && <p className="notice">No rooms are configured for this view.</p>}
      </div></div>}
      {view === "month" && <div className="calendar-scroll card" tabIndex={0} role="region" aria-label="Monthly booking calendar"><div className="management-month">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <strong className="month-weekday" key={d}>{d}</strong>)}
        {days.map((day) => <div className={`management-day ${day.slice(0, 7) !== anchor.slice(0, 7) ? "outside-month" : ""} ${day === data.today ? "current-day" : ""}`} key={day}>
          <span className="month-date">{Number(day.slice(-2))}{day === data.today ? " / today" : ""}</span>
          {bookings.filter((entry) => occupiesDay(entry, day)).map((entry) => bookingButton(entry, true))}
        </div>)}
      </div></div>}
      {view === "agenda" && <div className="calendar-agenda">{bookings.map((entry) => <article className="card agenda-stay" key={entry.id}><div><span className="kicker">{dayLabel(entry.startDate.slice(0, 10))}</span><p className="lead">to {dayLabel(entry.endDate.slice(0, 10))}</p></div><div>{bookingButton(entry)}<p className="lead">{entry.totalGuests} guests / {entry.petCount} pets</p></div></article>)}</div>}
      {!bookings.length && <p className="notice">No bookings match this period and these filters.</p>}
    </>}
    <dialog ref={dialog} className="booking-dialog" onCancel={() => setSelected(null)} onClose={() => setSelected(null)} aria-labelledby="booking-dialog-title">
      <div className="dialog-heading"><h2 id="booking-dialog-title">{adminMode ? "Manage booking" : "Stay details"}</h2><button type="button" className="btn-secondary" onClick={() => setSelected(null)} autoFocus>Close</button></div>
      {selected && (adminMode ? <AdminBookingDetails id={selected.id} revision={revision} /> : <div className="grid"><h3>{selected.displayName}</h3><span className={`status-pill status-${selected.status.toLowerCase()}`}>{selected.status}</span><p>{selected.startDate.slice(0, 10)} to {selected.endDate.slice(0, 10)}</p><p>{roomLabel(selected)}</p><p>{selected.totalGuests} guests / {selected.petCount} pets</p>{selected.isOwnBooking && <a className="btn-primary inline-action" href={`/booking/manage?reference=${encodeURIComponent(selected.id)}`}>Manage my booking</a>}</div>)}
    </dialog>
  </section>;
}
