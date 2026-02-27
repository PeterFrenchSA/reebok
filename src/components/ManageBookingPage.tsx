"use client";

import { FormEvent, useState } from "react";

type Booking = {
  id: string;
  source: string;
  scope: string;
  status: string;
  startDate: string;
  endDate: string;
  nights: number;
  totalGuests: number;
  petCount: number;
  notes?: string | null;
  externalLeadName?: string | null;
  externalLeadEmail?: string | null;
  externalLeadPhone?: string | null;
  currency: string;
  totalAmount: string | number | null;
};

type UiState = {
  type: "idle" | "error" | "success";
  message?: string;
};

type Props = {
  initialReference?: string;
  initialToken?: string;
  initialEmail?: string;
};

function toDateInput(value: string): string {
  return value.slice(0, 10);
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

export function ManageBookingPage({ initialReference = "", initialToken = "", initialEmail = "" }: Props) {
  const [reference, setReference] = useState(initialReference);
  const [token, setToken] = useState(initialToken);
  const [email, setEmail] = useState(initialEmail);

  const [booking, setBooking] = useState<Booking | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [totalGuests, setTotalGuests] = useState(1);
  const [petCount, setPetCount] = useState(0);
  const [notes, setNotes] = useState("");
  const [leadName, setLeadName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadPhone, setLeadPhone] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<UiState>({ type: "idle" });

  async function loadBooking(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setLoading(true);
    setState({ type: "idle" });

    try {
      const query = new URLSearchParams({ reference: reference.trim() });
      if (token.trim()) {
        query.set("token", token.trim());
      }
      if (email.trim()) {
        query.set("email", email.trim());
      }

      const response = await fetch(`/api/bookings/manage?${query.toString()}`, { cache: "no-store" });
      const data = (await response.json()) as { booking?: Booking; error?: unknown };
      if (!response.ok || !data.booking) {
        setBooking(null);
        setState({ type: "error", message: errorMessage(data, "Could not load booking.") });
        return;
      }

      setBooking(data.booking);
      setStartDate(toDateInput(data.booking.startDate));
      setEndDate(toDateInput(data.booking.endDate));
      setTotalGuests(data.booking.totalGuests);
      setPetCount(data.booking.petCount ?? 0);
      setNotes(data.booking.notes ?? "");
      setLeadName(data.booking.externalLeadName ?? "");
      setLeadEmail(data.booking.externalLeadEmail ?? email);
      setLeadPhone(data.booking.externalLeadPhone ?? "");
      setState({ type: "success", message: `Loaded booking ${data.booking.id}.` });
    } catch (error) {
      console.error(error);
      setBooking(null);
      setState({ type: "error", message: "Could not load booking." });
    } finally {
      setLoading(false);
    }
  }

  async function saveBooking() {
    if (!booking) {
      return;
    }

    setSaving(true);
    setState({ type: "idle" });
    try {
      const response = await fetch("/api/bookings/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: booking.id,
          token: token.trim() || undefined,
          email: email.trim() || leadEmail.trim() || undefined,
          startDate,
          endDate,
          totalGuests,
          petCount,
          notes,
          externalLeadName: leadName || undefined,
          externalLeadEmail: leadEmail || undefined,
          externalLeadPhone: leadPhone || undefined
        })
      });
      const data = (await response.json()) as { booking?: Booking; message?: string; error?: unknown };
      if (!response.ok || !data.booking) {
        setState({ type: "error", message: errorMessage(data, "Could not save booking.") });
        return;
      }

      setBooking(data.booking);
      setStartDate(toDateInput(data.booking.startDate));
      setEndDate(toDateInput(data.booking.endDate));
      setState({
        type: "success",
        message: typeof data.message === "string" ? data.message : "Booking updated."
      });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not save booking." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="grid">
      <article className="card grid">
        <span className="kicker">Booking Management</span>
        <h1>Edit Existing Booking</h1>
        <p className="lead">Use your booking reference from email. Guests can use the manage link token or email.</p>

        <form className="grid grid-2" onSubmit={(event) => void loadBooking(event)}>
          <div className="field">
            <label htmlFor="booking-reference">Booking Reference</label>
            <input
              id="booking-reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="booking-email">Email (fallback)</label>
            <input
              id="booking-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Required if token is not provided"
            />
          </div>
          <div className="field">
            <label htmlFor="booking-token">Manage Token (from email link)</label>
            <input
              id="booking-token"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Optional if using email fallback"
            />
          </div>
          <div className="action-row">
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Loading..." : "Load Booking"}
            </button>
          </div>
        </form>

        {state.type === "error" ? <p className="notice error">{state.message}</p> : null}
        {state.type === "success" ? <p className="notice success">{state.message}</p> : null}
      </article>

      {booking ? (
        <article className="card grid">
          <div className="status-line">
            <span className={`status-pill status-${booking.status.toLowerCase()}`}>{booking.status}</span>
            <span className="lead">
              {booking.source} / {booking.scope}
            </span>
          </div>

          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="manage-start-date">Check-in</label>
              <input
                id="manage-start-date"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="manage-end-date">Check-out</label>
              <input
                id="manage-end-date"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="manage-guests">Total Guests</label>
              <input
                id="manage-guests"
                type="number"
                min={1}
                max={40}
                value={totalGuests}
                onChange={(event) => setTotalGuests(Number(event.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="manage-pets">Pets</label>
              <input
                id="manage-pets"
                type="number"
                min={0}
                max={20}
                value={petCount}
                onChange={(event) => setPetCount(Number(event.target.value))}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="manage-notes">Notes</label>
            <textarea id="manage-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>

          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="manage-lead-name">Lead Name</label>
              <input
                id="manage-lead-name"
                value={leadName}
                onChange={(event) => setLeadName(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="manage-lead-email">Lead Email</label>
              <input
                id="manage-lead-email"
                type="email"
                value={leadEmail}
                onChange={(event) => setLeadEmail(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="manage-lead-phone">Lead Phone</label>
              <input
                id="manage-lead-phone"
                value={leadPhone}
                onChange={(event) => setLeadPhone(event.target.value)}
              />
            </div>
          </div>

          <p className="lead">
            Current total: {booking.currency} {Number(booking.totalAmount ?? 0).toFixed(2)}
          </p>

          <div className="action-row">
            <button type="button" className="btn-primary" disabled={saving} onClick={() => void saveBooking()}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </article>
      ) : null}
    </section>
  );
}
