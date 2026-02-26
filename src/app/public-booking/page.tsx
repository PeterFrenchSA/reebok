"use client";

import { FormEvent, useMemo, useState } from "react";

type SubmissionState = {
  type: "idle" | "success" | "error";
  message?: string;
  bookingId?: string;
  estimate?: string;
};

export default function PublicBookingPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submission, setSubmission] = useState<SubmissionState>({ type: "idle" });

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [leadName, setLeadName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [adults, setAdults] = useState(2);
  const [childrenUnder6, setChildrenUnder6] = useState(0);
  const [notes, setNotes] = useState("");

  const nights = useMemo(() => {
    if (!startDate || !endDate) {
      return 0;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const diff = Math.ceil((end.getTime() - start.getTime()) / 86400000);
    return diff > 0 ? diff : 0;
  }, [startDate, endDate]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
        <span className="kicker">Public Letting</span>
        <h1>Request Whole-House Booking</h1>
        <p className="lead">
          External visitors can only request full-house stays. All bookings are reviewed and approved by
          shareholders/super-admin before confirmation.
        </p>

        <form className="form" onSubmit={onSubmit}>
          <div className="inline">
            <div className="field">
              <label htmlFor="startDate">Check-in</label>
              <input id="startDate" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="endDate">Check-out</label>
              <input id="endDate" type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="inline">
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
          <p className="lead">
            Seasonal rates are automatically applied for external visitors when configured by admin.
          </p>
        </article>

        <article className="card grid">
          <h2>Payment Options</h2>
          <ul className="list">
            <li>Manual proof of payment (supported in v1).</li>
            <li>Gateway-ready records for Yoco and Ozow.</li>
            <li>Additional gateway adapters can be added next.</li>
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
