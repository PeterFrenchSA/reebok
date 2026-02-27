"use client";

import { useCallback, useEffect, useState } from "react";

type Subscription = {
  id: string;
  monthlyAmount: number | string;
  arrearsAmount: number | string;
  reminderEnabled: boolean;
  reminderFrequency: "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY";
  lastPaymentDate?: string | null;
  nextDueDate?: string | null;
  notes?: string | null;
};

type PanelState = {
  type: "idle" | "success" | "error";
  message?: string;
};

function parseAmount(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

function toDateLabel(value?: string | null): string {
  return value ? value.slice(0, 10) : "Not set";
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

export function MemberFeeTracker() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderFrequency, setReminderFrequency] = useState<
    "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY"
  >("MONTHLY");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<PanelState>({ type: "idle" });

  const loadSubscription = useCallback(async () => {
    setLoading(true);
    setState({ type: "idle" });
    try {
      const response = await fetch("/api/subscriptions", { cache: "no-store" });
      const data = (await response.json()) as { subscriptions?: Subscription[]; error?: unknown };

      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Could not load subscription.") });
        return;
      }

      const current = (data.subscriptions ?? [])[0] ?? null;
      setSubscription(current);
      setReminderEnabled(current?.reminderEnabled ?? true);
      setReminderFrequency(current?.reminderFrequency ?? "MONTHLY");
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not load subscription." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSubscription();
  }, [loadSubscription]);

  async function saveReminderPreferences() {
    setSaving(true);
    setState({ type: "idle" });
    try {
      const response = await fetch("/api/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reminderEnabled,
          reminderFrequency
        })
      });
      const data = (await response.json()) as { error?: unknown };

      if (!response.ok) {
        setState({
          type: "error",
          message: errorMessage(data, "Could not save reminder preferences.")
        });
        return;
      }

      await loadSubscription();
      setState({ type: "success", message: "Reminder preferences saved." });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not save reminder preferences." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="lead">Loading fee tracking...</p>;
  }

  return (
    <section className="grid">
      {state.type === "error" ? <p className="notice error">{state.message}</p> : null}
      {state.type === "success" ? <p className="notice success">{state.message}</p> : null}

      <article className="card grid">
        <h3>My Member Fee Status</h3>
        <div className="metric">
          <strong>Monthly Fee: ZAR {parseAmount(subscription?.monthlyAmount).toFixed(2)}</strong>
          <span>Arrears: ZAR {parseAmount(subscription?.arrearsAmount).toFixed(2)}</span>
          <span>Last payment: {toDateLabel(subscription?.lastPaymentDate)}</span>
          <span>Next due: {toDateLabel(subscription?.nextDueDate)}</span>
        </div>
        {subscription?.notes ? <p className="lead">Notes: {subscription.notes}</p> : null}
      </article>

      <article className="card grid">
        <h3>Reminder Preferences</h3>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="member-reminder-enabled">Reminder Enabled</label>
            <select
              id="member-reminder-enabled"
              value={reminderEnabled ? "yes" : "no"}
              onChange={(event) => setReminderEnabled(event.target.value === "yes")}
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="member-reminder-frequency">Reminder Frequency</label>
            <select
              id="member-reminder-frequency"
              value={reminderFrequency}
              onChange={(event) =>
                setReminderFrequency(event.target.value as typeof reminderFrequency)
              }
            >
              <option value="WEEKLY">WEEKLY</option>
              <option value="BIWEEKLY">BIWEEKLY</option>
              <option value="MONTHLY">MONTHLY</option>
              <option value="QUARTERLY">QUARTERLY</option>
            </select>
          </div>
        </div>

        <button
          type="button"
          className="btn-primary"
          disabled={saving}
          onClick={() => void saveReminderPreferences()}
        >
          {saving ? "Saving..." : "Save Reminder Preferences"}
        </button>
      </article>
    </section>
  );
}
