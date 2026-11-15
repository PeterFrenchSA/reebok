"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarAvailability, CalendarBooking, roomHolds, RoomOption } from "@/lib/booking-options";
import { maxStayNights } from "@/lib/stay-limits";

type AvailabilityBooking = CalendarBooking;

type SelectionMode = "start" | "end";
type NightStatus = "available" | "partial" | "tentative" | "confirmed" | "past";

type Props = {
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  memberMode?: boolean;
  scope?: "WHOLE_HOUSE" | "ROOM_SPECIFIC";
  roomIds?: string[];
  refreshKey?: number;
  onAvailabilityLoaded?: (data: CalendarAvailability) => void;
};

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, amount: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return startOfDay(next);
}

function addMonths(value: Date, amount: number): Date {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  return new Date(year, month - 1, day);
}

function toIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
const shortDateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function BookingCalendar({ startDate, endDate, onStartDateChange, onEndDateChange, memberMode = false,
  scope = "WHOLE_HOUSE", roomIds = [], refreshKey = 0, onAvailabilityLoaded }: Props) {
  const maxNights = maxStayNights(memberMode ? "INTERNAL" : "EXTERNAL_PUBLIC");
  const [bookings, setBookings] = useState<AvailabilityBooking[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [horizon, setHorizon] = useState<string | null>(null);
  const [propertyDate, setPropertyDate] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("start");
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const today = useMemo(() => propertyDate ? parseIsoDate(propertyDate) : startOfDay(new Date()), [propertyDate]);
  const firstVisibleAllowedMonth = useMemo(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
    [today]
  );
  const selectedStart = useMemo(() => (startDate ? parseIsoDate(startDate) : null), [startDate]);
  const selectedEnd = useMemo(() => (endDate ? parseIsoDate(endDate) : null), [endDate]);

  const filteredBookings = memberMode && scope === "ROOM_SPECIFIC" && roomIds.length
    ? bookings.filter((b) => b.scope !== "ROOM_SPECIFIC" || !b.roomIds?.length || b.roomIds.some((id) => roomIds.includes(id))) : bookings;
  const ranges = filteredBookings.map((booking) => ({
        status: booking.status,
        start: parseIsoDate(booking.startDate.slice(0, 10)),
        end: parseIsoDate(booking.endDate.slice(0, 10))
      }));

  useEffect(() => {
    const controller = new AbortController();
    async function loadAvailability() {
      setLoading(true);
      setLoadError(null);
      try {
        const response = await fetch(`/api/bookings/availability${memberMode ? "?mode=member" : ""}`, { cache: "no-store", signal: controller.signal });
        const data = (await response.json()) as CalendarAvailability & { error?: unknown };
        if (!response.ok) {
          setLoadError(typeof data.error === "string" ? data.error : "Could not load availability.");
          return;
        }
        setBookings(data.bookings ?? []);
        setHorizon(data.horizon ?? null);
        setPropertyDate(data.today ?? null);
        setRooms(data.rooms ?? []);
        onAvailabilityLoaded?.(data);
      } catch (error) {
        if (!controller.signal.aborted) setLoadError("Could not load availability. Refresh the page to retry.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadAvailability();
    return () => controller.abort();
  }, [memberMode, refreshKey, onAvailabilityLoaded]);

  useEffect(() => {
    setSelectionMode(startDate && !endDate ? "end" : "start");
  }, [startDate, endDate]);

  function statusForNight(day: Date): NightStatus {
    if (day < today) {
      return "past";
    }
    if (memberMode && scope === "ROOM_SPECIFIC" && !roomIds.length) {
      const start = toIsoDate(day), end = toIsoDate(addDays(day, 1));
      const available = rooms.filter((room) => !roomHolds(bookings, start, end, room.id).length).length;
      if (available > 0) return available === rooms.length ? "available" : "partial";
      return roomHolds(bookings, start, end).some((b) => b.status === "APPROVED") ? "confirmed" : "tentative";
    }

    let tentative = false;
    for (const range of ranges) {
      if (day >= range.start && day < range.end) {
        if (range.status === "APPROVED") {
          return "confirmed";
        }
        if (range.status === "PENDING") {
          tentative = true;
        }
      }
    }

    return tentative ? "tentative" : "available";
  }

  function conflictInRange(start: Date, end: Date): "confirmed" | "tentative" | null {
    if (memberMode && scope === "ROOM_SPECIFIC" && !roomIds.length) {
      if (rooms.some((room) => !roomHolds(bookings, toIsoDate(start), toIsoDate(end), room.id).length)) return null;
      return roomHolds(bookings, toIsoDate(start), toIsoDate(end)).some((b) => b.status === "APPROVED") ? "confirmed" : "tentative";
    }
    for (let cursor = startOfDay(start); cursor < end; cursor = addDays(cursor, 1)) {
      const status = statusForNight(cursor);
      if (status === "confirmed") {
        return "confirmed";
      }
      if (status === "tentative") {
        return "tentative";
      }
    }
    return null;
  }

  function canSelectStart(day: Date): boolean {
    return Boolean(horizon && toIsoDate(day) < horizon && ["available", "partial"].includes(statusForNight(day)));
  }

  function canSelectEnd(day: Date): boolean {
    if (!horizon || toIsoDate(day) > horizon || !selectedStart || day <= selectedStart || day > addDays(selectedStart, maxNights)) {
      return false;
    }
    return conflictInRange(selectedStart, day) === null;
  }

  function onDayClick(day: Date) {
    const iso = toIsoDate(day);
    setHint(null);

    if (selectionMode === "start" || !selectedStart || selectedEnd) {
      if (!canSelectStart(day)) {
        return;
      }
      onStartDateChange(iso);
      onEndDateChange("");
      setSelectionMode("end");
      return;
    }

    if (day <= selectedStart) {
      if (!canSelectStart(day)) {
        return;
      }
      onStartDateChange(iso);
      onEndDateChange("");
      setSelectionMode("end");
      setHint("Check-in reset. Select a check-out date at least one day later.");
      return;
    }

    if (day > addDays(selectedStart, maxNights)) {
      setHint(`Choose check-out within ${maxNights} nights of check-in.`);
      return;
    }
    const conflict = conflictInRange(selectedStart, day);
    if (conflict) {
      setHint(
        conflict === "confirmed"
          ? "That range includes confirmed bookings. Please select another check-out date."
          : "That range includes tentative bookings awaiting approval. Please select another check-out date."
      );
      return;
    }

    onEndDateChange(iso);
    setSelectionMode("start");
  }

  const months = [visibleMonth, addMonths(visibleMonth, 1)];
  const canMovePrevious = visibleMonth > firstVisibleAllowedMonth;
  const availabilityReady = !loading && !loadError;

  return (
    <section className="booking-calendar card grid">
      <div className="status-line">
        <div>
          <h2>Select Your Dates</h2>
          <p className="lead">
            {selectionMode === "start"
              ? "Choose check-in first."
              : `Now choose check-out (1-${maxNights} nights).`}
          </p>
          <p className="lead">{memberMode ? "Member/family stays" : "Guest stays"}: maximum {maxNights} nights per booking.</p>
        </div>
        <div className="action-row">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
            disabled={!canMovePrevious}
          >
            Previous
          </button>
          <button type="button" className="btn-secondary" disabled={!horizon || toIsoDate(addMonths(visibleMonth, 1)) > horizon} onClick={() => setVisibleMonth((current) => addMonths(current, 1))}>
            Next
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              onStartDateChange("");
              onEndDateChange("");
              setSelectionMode("start");
              setHint(null);
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <div className="booking-calendar-legend">
        <span className="legend-item">
          <span className="legend-dot legend-dot-available" />
          Available
        </span>
        {memberMode && scope === "ROOM_SPECIFIC" && <span className="legend-item"><span className="legend-dot legend-dot-partial" />Some rooms available</span>}
        <span className="legend-item">
          <span className="legend-dot legend-dot-confirmed" />
          Confirmed booking
        </span>
        <span className="legend-item">
          <span className="legend-dot legend-dot-tentative" />
          Tentative booking
        </span>
      </div>
      {memberMode && <p className="lead">{scope === "WHOLE_HOUSE" ? "Exclusive stay: any pending or confirmed room reservation blocks the house." : roomIds.length ? "Calendar shows availability for your selected rooms." : "Shared family stay: dates remain selectable while at least one room is free for the entire stay. Choose rooms below."}</p>}

      <div className="booking-calendar-selection">
        <p className="lead">
          Check-in: {selectedStart ? shortDateFormatter.format(selectedStart) : "Not selected"}
        </p>
        <p className="lead">
          Check-out: {selectedEnd ? shortDateFormatter.format(selectedEnd) : "Not selected"}
        </p>
      </div>

      {loadError ? <p className="notice error">{loadError}</p> : null}
      {hint ? <p className="notice">{hint}</p> : null}
      {loading ? <p className="lead">Loading booking calendar...</p> : null}

      {!loading ? (
        <div className="booking-calendar-months">
          {months.map((month) => {
            const days = monthGrid(month);
            return (
              <article key={month.toISOString()} className="booking-month">
                <h3>{monthFormatter.format(month)}</h3>
                <div className="booking-weekdays">
                  {weekdayLabels.map((label) => (
                    <span key={`${month.toISOString()}-${label}`}>{label}</span>
                  ))}
                </div>
                <div className="booking-days-grid">
                  {days.map((day) => {
                    const dayKey = `${month.toISOString()}-${toIsoDate(day)}`;
                    const status = statusForNight(day);
                    const outside = day.getMonth() !== month.getMonth();
                    const isStart = selectedStart ? sameDay(day, selectedStart) : false;
                    const isEnd = selectedEnd ? sameDay(day, selectedEnd) : false;
                    const inRange =
                      selectedStart && selectedEnd ? day > selectedStart && day < selectedEnd : false;
                    const selectableAsEnd =
                      selectionMode === "end" &&
                      selectedStart !== null &&
                      !selectedEnd &&
                      day > selectedStart &&
                      canSelectEnd(day);
                    const visualStatus = selectableAsEnd ? "available" : status;

                    const disabled = (() => {
                      if (!availabilityReady) {
                        return true;
                      }
                      if (selectionMode === "start" || !selectedStart || selectedEnd) {
                        return !canSelectStart(day);
                      }
                      if (day <= selectedStart) {
                        return !canSelectStart(day);
                      }
                      return !canSelectEnd(day);
                    })();

                    const classes = [
                      "booking-day",
                      outside ? "is-outside" : "",
                      visualStatus === "confirmed" ? "is-confirmed" : "",
                      visualStatus === "tentative" ? "is-tentative" : "",
                      visualStatus === "partial" ? "is-partial" : "",
                      visualStatus === "past" ? "is-past" : "",
                      isStart ? "is-start" : "",
                      isEnd ? "is-end" : "",
                      inRange ? "is-range" : "",
                      disabled ? "is-disabled" : ""
                    ]
                      .filter(Boolean)
                      .join(" ");

                    const title = (() => {
                      if (selectionMode === "end" && selectedStart && !selectedEnd && day > addDays(selectedStart, maxNights)) {
                        return `Maximum ${maxNights} nights per booking`;
                      }
                      if (selectableAsEnd && status !== "available") {
                        return "Available as check-out date";
                      }
                      if (status === "confirmed") {
                        return "Confirmed booking";
                      }
                      if (status === "partial") return "Some rooms available";
                      if (status === "tentative") {
                        return "Tentative booking awaiting approval";
                      }
                      if (status === "past") {
                        return "Past date";
                      }
                      return "Available";
                    })();

                    return (
                      <button
                        key={dayKey}
                        type="button"
                        className={classes}
                        onClick={() => onDayClick(day)}
                        disabled={disabled}
                        title={title}
                        aria-label={`${shortDateFormatter.format(day)} - ${title}`}
                      >
                        <span>{day.getDate()}</span>
                      </button>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
