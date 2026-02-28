"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_GUEST_BULLETIN_BODY,
  DEFAULT_GUEST_BULLETIN_TITLE,
  DEFAULT_PET_NOTICE
} from "@/lib/booking-policy";

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
  const [guestBulletinTitle, setGuestBulletinTitle] = useState(DEFAULT_GUEST_BULLETIN_TITLE);
  const [guestBulletinBody, setGuestBulletinBody] = useState(DEFAULT_GUEST_BULLETIN_BODY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<NoticeState>({ type: "idle" });

  useEffect(() => {
    async function loadPolicy() {
      setLoading(true);
      setState({ type: "idle" });
      try {
        const response = await fetch("/api/bookings/policy", { cache: "no-store" });
        const data = (await response.json()) as {
          policy?: {
            petNotice?: string;
            guestBulletinTitle?: string;
            guestBulletinBody?: string;
          };
          error?: unknown;
        };
        if (!response.ok) {
          setState({ type: "error", message: errorMessage(data, "Could not load booking policy.") });
          return;
        }

        setPetNotice(data.policy?.petNotice ?? DEFAULT_PET_NOTICE);
        setGuestBulletinTitle(data.policy?.guestBulletinTitle ?? DEFAULT_GUEST_BULLETIN_TITLE);
        setGuestBulletinBody(data.policy?.guestBulletinBody ?? DEFAULT_GUEST_BULLETIN_BODY);
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
    const trimmedPetNotice = petNotice.trim();
    const trimmedBulletinTitle = guestBulletinTitle.trim();
    const trimmedBulletinBody = guestBulletinBody.trim();

    if (trimmedPetNotice.length < 10) {
      setState({ type: "error", message: "Pet notice must be at least 10 characters." });
      return;
    }
    if (trimmedBulletinTitle.length < 3) {
      setState({ type: "error", message: "Guest bulletin title must be at least 3 characters." });
      return;
    }
    if (trimmedBulletinBody.length < 10) {
      setState({ type: "error", message: "Guest bulletin content must be at least 10 characters." });
      return;
    }

    setSaving(true);
    setState({ type: "idle" });
    try {
      const response = await fetch("/api/bookings/policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petNotice: trimmedPetNotice,
          guestBulletinTitle: trimmedBulletinTitle,
          guestBulletinBody: trimmedBulletinBody
        })
      });
      const data = (await response.json()) as { error?: unknown };
      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Could not save booking policy.") });
        return;
      }
      setPetNotice(trimmedPetNotice);
      setGuestBulletinTitle(trimmedBulletinTitle);
      setGuestBulletinBody(trimmedBulletinBody);
      setState({ type: "success", message: "Booking policy and guest bulletin updated." });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not save booking policy." });
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
      <p className="lead">
        Set the pet notice shown during booking and the guest useful-info bulletin shown on the guest portal.
      </p>
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
      <div className="field">
        <label htmlFor="guest-bulletin-title">Guest Bulletin Title</label>
        <input
          id="guest-bulletin-title"
          value={guestBulletinTitle}
          onChange={(event) => setGuestBulletinTitle(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="guest-bulletin-body">Guest Bulletin Content</label>
        <textarea
          id="guest-bulletin-body"
          value={guestBulletinBody}
          onChange={(event) => setGuestBulletinBody(event.target.value)}
          rows={10}
        />
        <p className="lead">Use one line per information item, contact, or reminder.</p>
      </div>
      <div className="action-row">
        <button type="button" className="btn-primary" disabled={saving} onClick={() => void savePolicy()}>
          {saving ? "Saving..." : "Save Policy"}
        </button>
      </div>
    </article>
  );
}
