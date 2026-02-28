"use client";

import { FormEvent, useEffect, useState } from "react";

type BookingOption = {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
};

type PanelState = {
  type: "idle" | "error" | "success";
  message?: string;
};

type Props = {
  defaultName?: string | null;
  defaultEmail?: string | null;
};

function bookingLabel(booking: BookingOption): string {
  const start = booking.startDate.slice(0, 10);
  const end = booking.endDate.slice(0, 10);
  return `${booking.id} (${start} to ${end}) - ${booking.status}`;
}

export function GuestFeedbackPanel({ defaultName, defaultEmail }: Props) {
  const [bookings, setBookings] = useState<BookingOption[]>([]);
  const [selectedBookingId, setSelectedBookingId] = useState("");
  const [name, setName] = useState(defaultName ?? "");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [rating, setRating] = useState("5");
  const [message, setMessage] = useState("");
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [state, setState] = useState<PanelState>({ type: "idle" });

  useEffect(() => {
    async function loadMyBookings() {
      setLoadingBookings(true);
      try {
        const response = await fetch("/api/bookings?mineOnly=true&take=100", { cache: "no-store" });
        const data = (await response.json()) as { bookings?: BookingOption[] };
        if (!response.ok) {
          return;
        }
        setBookings(data.bookings ?? []);
      } catch (error) {
        console.error(error);
      } finally {
        setLoadingBookings(false);
      }
    }

    void loadMyBookings();
  }, []);

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ type: "idle" });

    if (message.trim().length < 3) {
      setState({ type: "error", message: "Feedback message must be at least 3 characters." });
      return;
    }

    const normalizedEmail = email.trim();
    if (normalizedEmail.length > 0 && !normalizedEmail.includes("@")) {
      setState({ type: "error", message: "Please provide a valid email address." });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: selectedBookingId || undefined,
          name: name.trim() || undefined,
          email: normalizedEmail || undefined,
          rating: Number(rating),
          message: message.trim(),
          visibility: "PUBLIC",
          isPublished: true
        })
      });
      const data = await response.json();

      if (!response.ok) {
        setState({
          type: "error",
          message: typeof data.error === "string" ? data.error : "Could not submit feedback."
        });
        return;
      }

      setMessage("");
      setSelectedBookingId("");
      setRating("5");
      setState({ type: "success", message: "Feedback submitted. Thank you." });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not submit feedback." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="card grid">
      <h2>Leave Feedback</h2>
      <p className="lead">
        Share your stay experience, report issues, or leave suggestions for the house team.
      </p>

      <form className="form" onSubmit={submitFeedback}>
        <div className="field">
          <label htmlFor="guest-feedback-booking">Booking (optional)</label>
          <select
            id="guest-feedback-booking"
            value={selectedBookingId}
            onChange={(event) => setSelectedBookingId(event.target.value)}
            disabled={loadingBookings}
          >
            <option value="">General feedback (not tied to a booking)</option>
            {bookings.map((booking) => (
              <option key={booking.id} value={booking.id}>
                {bookingLabel(booking)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="guest-feedback-name">Name (optional)</label>
            <input
              id="guest-feedback-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
            />
          </div>
          <div className="field">
            <label htmlFor="guest-feedback-email">Email (optional)</label>
            <input
              id="guest-feedback-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="guest-feedback-rating">Rating</label>
          <select
            id="guest-feedback-rating"
            value={rating}
            onChange={(event) => setRating(event.target.value)}
          >
            <option value="5">5 - Excellent</option>
            <option value="4">4 - Good</option>
            <option value="3">3 - Average</option>
            <option value="2">2 - Poor</option>
            <option value="1">1 - Very poor</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="guest-feedback-message">Message</label>
          <textarea
            id="guest-feedback-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="What went well, what needs attention, and any suggestions."
            required
          />
        </div>

        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Submitting..." : "Submit Feedback"}
        </button>
      </form>

      {state.type === "error" ? <p className="notice error">{state.message}</p> : null}
      {state.type === "success" ? <p className="notice success">{state.message}</p> : null}
    </article>
  );
}
