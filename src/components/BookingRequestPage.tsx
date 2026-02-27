"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { DEFAULT_PET_NOTICE } from "@/lib/booking-policy";
import { BookingCalendar } from "@/components/BookingCalendar";

type SubmissionState = {
  type: "idle" | "success" | "error";
  message?: string;
  bookingId?: string;
  estimate?: string;
};

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  return new Date(year, month - 1, day);
}

export function BookingRequestPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submission, setSubmission] = useState<SubmissionState>({ type: "idle" });

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [leadName, setLeadName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [adults, setAdults] = useState(2);
  const [childrenUnder6, setChildrenUnder6] = useState(0);
  const [petCount, setPetCount] = useState(0);
  const [notes, setNotes] = useState("");
  const [petNotice, setPetNotice] = useState(DEFAULT_PET_NOTICE);

  useEffect(() => {
    async function loadPolicy() {
      try {
        const response = await fetch("/api/bookings/policy", { cache: "no-store" });
        const data = (await response.json()) as { policy?: { petNotice?: string } };
        if (response.ok && typeof data.policy?.petNotice === "string" && data.policy.petNotice.trim().length > 0) {
          setPetNotice(data.policy.petNotice);
        }
      } catch (error) {
        console.error(error);
      }
    }

    void loadPolicy();
  }, []);

  const nights = useMemo(() => {
    if (!startDate || !endDate) {
      return 0;
    }

    const start = parseLocalDate(startDate);
    const end = parseLocalDate(endDate);
    const diff = Math.ceil((end.getTime() - start.getTime()) / 86400000);
    return diff > 0 ? diff : 0;
  }, [startDate, endDate]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!startDate || !endDate || nights < 1) {
      setSubmission({ type: "error", message: "Please select a valid check-in and check-out range." });
      return;
    }

    setIsSubmitting(true);
    setSubmission({ type: "idle" });

    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "EXTERNAL_PUBLIC",
          startDate,
          endDate,
          externalLeadName: leadName,
          externalLeadEmail: leadEmail,
          externalLeadPhone: leadPhone,
          petCount: Number(petCount),
          notes,
          guestBreakdown: {
            member: 0,
            dependentWithMember: 0,
            dependentWithoutMember: 0,
            guestOfMember: 0,
            guestOfDependent: 0,
            mereFamily: 0,
            visitorAdult: Number(adults),
            visitorChildUnder6: Number(childrenUnder6)
          }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setSubmission({
          type: "error",
          message: typeof data.error === "string" ? data.error : "Booking request failed"
        });
        return;
      }

      setSubmission({
        type: "success",
        message: "Booking request submitted and pending approval.",
        bookingId: data.booking?.id,
        estimate: data.feeBreakdown
          ? `${data.feeBreakdown.currency} ${Number(data.feeBreakdown.total).toFixed(2)}`
          : undefined
      });
    } catch (error) {
      console.error(error);
      setSubmission({ type: "error", message: "Could not submit booking request." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="grid grid-2">
      <article className="card grid">
        <span className="kicker">Booking Request</span>
        <h1>Book The Reebok House</h1>
        <p className="lead">
          Start with your booking details below. External visitors request whole-house stays and every
          booking is reviewed by admin before confirmation.
        </p>

        <form className="form" onSubmit={onSubmit}>
          <BookingCalendar
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />

          <div className="inline inline-3">
            <div className="field">
              <label htmlFor="adults">Adults</label>
              <input
                id="adults"
                type="number"
                min={1}
                value={adults}
                onChange={(e) => setAdults(Number(e.target.value))}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="children">Children under 6</label>
              <input
                id="children"
                type="number"
                min={0}
                value={childrenUnder6}
                onChange={(e) => setChildrenUnder6(Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="pets">Pets</label>
              <input
                id="pets"
                type="number"
                min={0}
                max={20}
                value={petCount}
                onChange={(e) => setPetCount(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="leadName">Full name</label>
            <input id="leadName" value={leadName} onChange={(e) => setLeadName(e.target.value)} required />
          </div>

          <div className="inline">
            <div className="field">
              <label htmlFor="leadEmail">Email</label>
              <input
                id="leadEmail"
                type="email"
                value={leadEmail}
                onChange={(e) => setLeadEmail(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="leadPhone">Phone</label>
              <input id="leadPhone" value={leadPhone} onChange={(e) => setLeadPhone(e.target.value)} required />
            </div>
          </div>

          <div className="field">
            <label htmlFor="notes">Notes (optional)</label>
            <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : "Submit Booking Request"}
          </button>
        </form>
      </article>

      <aside className="grid">
        <article className="card grid">
          <h2>Stay Summary</h2>
          <div className="metric">
            <strong>{nights}</strong>
            <span>Night{nights === 1 ? "" : "s"}</span>
          </div>
          <div className="metric">
            <strong>{adults + childrenUnder6}</strong>
            <span>Total Guests</span>
          </div>
          <div className="metric">
            <strong>{petCount}</strong>
            <span>Pet{petCount === 1 ? "" : "s"}</span>
          </div>
          <p className="lead">
            Seasonal rates are automatically applied for external visitors when configured by admin.
          </p>
        </article>

        {petCount > 0 ? (
          <article className="notice" role="note" aria-live="polite">
            <strong>Pet Notice</strong>
            <p>{petNotice}</p>
          </article>
        ) : null}

        <article className="card grid">
          <h2>Member and Admin</h2>
          <ul className="list">
            <li>Members can sign in and use `/member` for booking history.</li>
            <li>Admins can sign in and use `/admin` to manage users and credentials.</li>
          </ul>
        </article>

        {submission.type !== "idle" ? (
          <article
            className={`notice ${submission.type === "success" ? "success" : "error"}`}
            role="status"
            aria-live="polite"
          >
            <p>{submission.message}</p>
            {submission.bookingId ? <p>Reference: {submission.bookingId}</p> : null}
            {submission.estimate ? <p>Estimated total: {submission.estimate}</p> : null}
          </article>
        ) : null}
      </aside>
    </section>
  );
}
