"use client";

import { CalendarBooking, MemberCounts, memberCategories, RoomAllocation, roomHolds, RoomOption } from "@/lib/booking-options";

export function MemberGuestCounts({ value, onChange, prefix = "member" }: { value: MemberCounts; onChange: (value: MemberCounts) => void; prefix?: string }) {
  return <fieldset className="booking-fieldset grid"><legend>Who is staying?</legend>
    <p className="lead">Count every person once, including yourself. Categories determine the per-person nightly price.</p>
    <div className="grid grid-2">{memberCategories.map((category) => <div className="field" key={category.key}>
      <label htmlFor={`${prefix}-${category.key}`}>{category.label}</label>
      <input id={`${prefix}-${category.key}`} type="number" min={0} max={50} step={1} required value={value[category.key]}
        onChange={(event) => onChange({ ...value, [category.key]: Number(event.target.value) })} />
    </div>)}</div>
  </fieldset>;
}

export function RoomSelection({ rooms, bookings, startDate, endDate, value, onChange, prefix = "room" }: {
  rooms: RoomOption[]; bookings: CalendarBooking[]; startDate: string; endDate: string;
  value: RoomAllocation[]; onChange: (value: RoomAllocation[]) => void; prefix?: string;
}) {
  const ready = Boolean(startDate && endDate && endDate > startDate);
  return <fieldset className="booking-fieldset grid"><legend>Choose your rooms</legend>
    <p className="lead">Select one or more rooms for your entire stay. Other families can book the remaining rooms, even at peak times.</p>
    {!ready && <p className="notice">Select check-in and check-out first.</p>}
    {!rooms.length && <p className="notice">No bookable rooms are configured. Please contact an administrator.</p>}
    <div className="room-options">{rooms.map((room) => {
      const allocation = value.find((item) => item.roomId === room.id);
      const holds = ready ? roomHolds(bookings, startDate, endDate, room.id) : [];
      const status = !ready ? "Choose dates" : holds.some((b) => b.status === "APPROVED") ? "Confirmed hold" : holds.length ? "Pending hold" : "Available";
      return <article key={room.id} className={`room-option ${allocation ? "room-option-selected" : ""} ${holds.length ? "room-option-held" : ""}`}>
        <label className="check-line" htmlFor={`${prefix}-${room.id}`}>
          <input id={`${prefix}-${room.id}`} type="checkbox" checked={Boolean(allocation)} disabled={!ready || (holds.length > 0 && !allocation)}
            onChange={(event) => onChange(event.target.checked ? [...value, { roomId: room.id, guestCount: 1, guestLabel: "" }] : value.filter((item) => item.roomId !== room.id))} />
          <strong>{room.name}</strong><span className={`room-availability ${holds.length ? "room-unavailable" : ""}`}>{status}</span>
        </label>
        <p>{room.notes}</p><p className="lead">Sleeps up to {room.capacity}</p>
        {allocation && <div className="grid">
          <div className="field"><label htmlFor={`${prefix}-count-${room.id}`}>Guests in {room.name}</label>
            <input id={`${prefix}-count-${room.id}`} type="number" min={1} max={room.capacity} required value={allocation.guestCount}
              onChange={(event) => onChange(value.map((item) => item.roomId === room.id ? { ...item, guestCount: Number(event.target.value) } : item))} /></div>
          <div className="field"><label htmlFor={`${prefix}-label-${room.id}`}>Family / group label (optional)</label>
            <input id={`${prefix}-label-${room.id}`} maxLength={120} placeholder="e.g. Adi and family" value={allocation.guestLabel ?? ""}
              onChange={(event) => onChange(value.map((item) => item.roomId === room.id ? { ...item, guestLabel: event.target.value } : item))} /></div>
          {holds.length > 0 && <p className="notice error">This room is not available for all selected nights. Choose another room or change dates.</p>}
        </div>}
      </article>;
    })}</div>
  </fieldset>;
}

export type AccommodationSummary = { scope?: string; roomAllocations?: Array<{ guestCount: number; guestLabel?: string | null; room: { name: string } }> };
export function BookingAccommodationSummary({ booking }: { booking: AccommodationSummary }) {
  return <p className="lead">{booking.scope === "ROOM_SPECIFIC"
    ? `Rooms: ${booking.roomAllocations?.map((a) => `${a.room.name} (${a.guestCount}${a.guestLabel ? `; ${a.guestLabel}` : ""})`).join(", ") || "Allocation needs admin review"}`
    : "Whole house - exclusive stay"}</p>;
}
