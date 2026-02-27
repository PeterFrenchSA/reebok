"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type FeedbackVisibility = "PUBLIC" | "INTERNAL";

type FeedbackEntry = {
  id: string;
  bookingId?: string | null;
  visibility: FeedbackVisibility;
  isPublished: boolean;
  rating?: number | null;
  message: string;
  name?: string | null;
  email?: string | null;
  createdAt: string;
  user?: { id: string; name: string; email: string; role: string } | null;
  booking?: { id: string; startDate: string; endDate: string; status: string } | null;
};

type PanelState = { type: "idle" | "success" | "error"; message?: string };

function errorMessage(data: unknown, fallback: string): string {
  if (typeof data === "object" && data !== null && "error" in data) {
    const err = (data as { error?: unknown }).error;
    if (typeof err === "string") {
      return err;
    }
  }
  return fallback;
}

function dateLabel(value: string): string {
  return value.slice(0, 10);
}

export function AdminFeedbackModeration() {
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [filter, setFilter] = useState<"ALL" | "PUBLIC" | "INTERNAL" | "UNPUBLISHED">("ALL");
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [state, setState] = useState<PanelState>({ type: "idle" });

  const filtered = useMemo(() => {
    if (filter === "ALL") {
      return feedback;
    }
    if (filter === "UNPUBLISHED") {
      return feedback.filter((entry) => !entry.isPublished);
    }
    return feedback.filter((entry) => entry.visibility === filter);
  }, [feedback, filter]);

  const loadFeedback = useCallback(async () => {
    setLoading(true);
    setState({ type: "idle" });
    try {
      const response = await fetch("/api/feedback", { cache: "no-store" });
      const data = (await response.json()) as { feedback?: FeedbackEntry[]; error?: unknown };
      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Could not load feedback.") });
        return;
      }
      setFeedback(data.feedback ?? []);
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not load feedback." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFeedback();
  }, [loadFeedback]);

  async function moderate(entry: FeedbackEntry, update: Partial<Pick<FeedbackEntry, "visibility" | "isPublished">>) {
    setProcessingId(entry.id);
    setState({ type: "idle" });
    try {
      const response = await fetch("/api/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: entry.id,
          visibility: update.visibility ?? entry.visibility,
          isPublished: update.isPublished ?? entry.isPublished
        })
      });
      const data = (await response.json()) as { error?: unknown };
      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Moderation update failed.") });
        return;
      }

      await loadFeedback();
      setState({ type: "success", message: "Feedback entry updated." });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Moderation update failed." });
    } finally {
      setProcessingId(null);
    }
  }

  if (loading) {
    return <p className="lead">Loading feedback moderation...</p>;
  }

  return (
    <section className="grid">
      {state.type === "error" ? <p className="notice error">{state.message}</p> : null}
      {state.type === "success" ? <p className="notice success">{state.message}</p> : null}

      <article className="card grid">
        <h3>Feedback Moderation Queue</h3>
        <div className="field">
          <label htmlFor="feedback-filter">Filter</label>
          <select id="feedback-filter" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
            <option value="ALL">All</option>
            <option value="UNPUBLISHED">Unpublished</option>
            <option value="PUBLIC">Public</option>
            <option value="INTERNAL">Internal</option>
          </select>
        </div>
      </article>

      {filtered.length === 0 ? (
        <article className="card">
          <p className="lead">No feedback entries for this filter.</p>
        </article>
      ) : (
        filtered.map((entry) => {
          const isProcessing = processingId === entry.id;
          return (
            <article key={entry.id} className="card grid">
              <div className="status-line">
                <span className={`status-pill ${entry.isPublished ? "status-active" : "status-pending_review"}`}>
                  {entry.isPublished ? "Published" : "Unpublished"}
                </span>
                <span className="lead">{dateLabel(entry.createdAt)}</span>
              </div>
              <p className="lead">
                Visibility: {entry.visibility} | Rating: {entry.rating ?? "Not rated"}
              </p>
              <p className="lead">
                From: {entry.user?.name ?? entry.name ?? "Anonymous"} ({entry.user?.email ?? entry.email ?? "No email"})
              </p>
              {entry.booking ? (
                <p className="lead">
                  Booking: {entry.booking.id} ({dateLabel(entry.booking.startDate)} to {dateLabel(entry.booking.endDate)})
                </p>
              ) : null}
              <p>{entry.message}</p>
              <div className="action-row">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={isProcessing}
                  onClick={() => void moderate(entry, { isPublished: !entry.isPublished })}
                >
                  {entry.isPublished ? "Unpublish" : "Publish"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={isProcessing}
                  onClick={() =>
                    void moderate(entry, {
                      visibility: entry.visibility === "PUBLIC" ? "INTERNAL" : "PUBLIC"
                    })
                  }
                >
                  Move to {entry.visibility === "PUBLIC" ? "Internal" : "Public"}
                </button>
              </div>
            </article>
          );
        })
      )}
    </section>
  );
}
