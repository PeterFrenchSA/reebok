"use client";

import { useEffect, useState } from "react";
import { DEFAULT_PET_NOTICE } from "@/lib/booking-policy";

type NoticeState = {
  type: "idle" | "success" | "error";
  message?: string;
};

function errorMessage(data: unknown, fallback: string): string {
  if (typeof data === "object" && data !== null && "error" in data) {
    const err = (data as { error?: unknown }).error;
    if (typeof err === "string") {
      return err;
    }
  }
  return fallback;
}

export function AdminBookingPolicySettings() {
  const [petNotice, setPetNotice] = useState(DEFAULT_PET_NOTICE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<NoticeState>({ type: "idle" });

  useEffect(() => {
    async function loadPolicy() {
      setLoading(true);
      setState({ type: "idle" });
      try {
        const response = await fetch("/api/bookings/policy", { cache: "no-store" });
        const data = (await response.json()) as { policy?: { petNotice?: string }; error?: unknown };
        if (!response.ok) {
          setState({ type: "error", message: errorMessage(data, "Could not load booking policy.") });
          return;
        }

        setPetNotice(data.policy?.petNotice ?? DEFAULT_PET_NOTICE);
      } catch (error) {
        console.error(error);
        setState({ type: "error", message: "Could not load booking policy." });
      } finally {
        setLoading(false);
      }
    }

    void loadPolicy();
  }, []);

  async function savePolicy() {
    const trimmed = petNotice.trim();
    if (trimmed.length < 10) {
      setState({ type: "error", message: "Pet notice must be at least 10 characters." });
      return;
    }

    setSaving(true);
    setState({ type: "idle" });
    try {
      const response = await fetch("/api/bookings/policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petNotice: trimmed })
      });
      const data = (await response.json()) as { error?: unknown };
      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Could not save pet notice.") });
        return;
      }
      setPetNotice(trimmed);
      setState({ type: "success", message: "Pet notice updated." });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not save pet notice." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="lead">Loading booking policies...</p>;
  }

  return (
    <article className="card grid">
      <h2>Booking Policies</h2>
      <p className="lead">Set the notice shown on the booking form whenever guests include pets.</p>
      {state.type === "error" ? <p className="notice error">{state.message}</p> : null}
      {state.type === "success" ? <p className="notice success">{state.message}</p> : null}
      <div className="field">
        <label htmlFor="pet-notice">Pet Notice</label>
        <textarea
          id="pet-notice"
          value={petNotice}
          onChange={(event) => setPetNotice(event.target.value)}
          rows={4}
        />
      </div>
      <div className="action-row">
        <button type="button" className="btn-primary" disabled={saving} onClick={() => void savePolicy()}>
          {saving ? "Saving..." : "Save Notice"}
        </button>
      </div>
    </article>
  );
}
