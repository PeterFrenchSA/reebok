"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type User = {
  id: string;
  email: string;
  name: string;
  role: "SUPER_ADMIN" | "SHAREHOLDER" | "FAMILY_MEMBER" | "GUEST";
  isActive: boolean;
};

type Subscription = {
  id: string;
  userId: string;
  monthlyAmount: number | string;
  arrearsAmount: number | string;
  reminderEnabled: boolean;
  reminderFrequency: "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY";
  lastPaymentDate?: string | null;
  nextDueDate?: string | null;
  notes?: string | null;
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
};

type PanelState = {
  type: "idle" | "success" | "error";
  message?: string;
};

type FeeForm = {
  monthlyAmount: string;
  arrearsAmount: string;
  reminderEnabled: boolean;
  reminderFrequency: "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY";
  nextDueDate: string;
  notes: string;
};

type PaymentForm = {
  amount: string;
  method: "MANUAL_PROOF" | "EFT" | "YOCO" | "OZOW" | "STRIPE" | "OTHER";
  status: "PENDING" | "CONFIRMED";
  monthsCovered: string;
  periodStart: string;
  reference: string;
};

function parseAmount(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

function toDateInput(value?: string | null): string {
  if (!value) {
    return "";
  }
  return value.slice(0, 10);
}

function todayDateInput(): string {
  return new Date().toISOString().slice(0, 10);
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

export function AdminFeeTracker() {
  const [users, setUsers] = useState<User[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [feeForm, setFeeForm] = useState<FeeForm>({
    monthlyAmount: "100",
    arrearsAmount: "0",
    reminderEnabled: true,
    reminderFrequency: "MONTHLY",
    nextDueDate: "",
    notes: ""
  });
  const [paymentForm, setPaymentForm] = useState<PaymentForm>({
    amount: "100",
    method: "EFT",
    status: "CONFIRMED",
    monthsCovered: "1",
    periodStart: todayDateInput(),
    reference: ""
  });
  const [loading, setLoading] = useState(true);
  const [savingFees, setSavingFees] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [state, setState] = useState<PanelState>({ type: "idle" });

  const trackedUsers = useMemo(
    () => users.filter((user) => user.isActive && user.role !== "GUEST"),
    [users]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setState({ type: "idle" });
    try {
      const [usersResponse, subscriptionsResponse] = await Promise.all([
        fetch("/api/users", { cache: "no-store" }),
        fetch("/api/subscriptions", { cache: "no-store" })
      ]);

      const usersData = (await usersResponse.json()) as { users?: User[]; error?: unknown };
      if (!usersResponse.ok) {
        setState({ type: "error", message: errorMessage(usersData, "Could not load users.") });
        return;
      }

      const subscriptionsData = (await subscriptionsResponse.json()) as {
        subscriptions?: Subscription[];
        error?: unknown;
      };
      if (!subscriptionsResponse.ok) {
        setState({
          type: "error",
          message: errorMessage(subscriptionsData, "Could not load subscriptions.")
        });
        return;
      }

      const nextUsers = usersData.users ?? [];
      const nextSubscriptions = subscriptionsData.subscriptions ?? [];
      const nextTrackedUsers = nextUsers.filter((user) => user.isActive && user.role !== "GUEST");

      setUsers(nextUsers);
      setSubscriptions(nextSubscriptions);

      setSelectedUserId((currentUserId) => {
        const defaultUser =
          nextTrackedUsers.find((user) => user.id === currentUserId) ??
          nextTrackedUsers[0] ??
          nextUsers[0];

        return defaultUser?.id ?? "";
      });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not load fee tracking data." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedUserId) {
      return;
    }

    const subscription = subscriptions.find((item) => item.userId === selectedUserId);
    const monthlyAmount = subscription ? parseAmount(subscription.monthlyAmount) : 100;

    setFeeForm({
      monthlyAmount: monthlyAmount.toFixed(2),
      arrearsAmount: parseAmount(subscription?.arrearsAmount).toFixed(2),
      reminderEnabled: subscription?.reminderEnabled ?? true,
      reminderFrequency: subscription?.reminderFrequency ?? "MONTHLY",
      nextDueDate: toDateInput(subscription?.nextDueDate),
      notes: subscription?.notes ?? ""
    });

    setPaymentForm((current) => ({
      ...current,
      amount: monthlyAmount.toFixed(2)
    }));
  }, [selectedUserId, subscriptions]);

  async function saveFeeSettings() {
    if (!selectedUserId) {
      setState({ type: "error", message: "Select a user first." });
      return;
    }

    const monthlyAmount = Number(feeForm.monthlyAmount);
    const arrearsAmount = Number(feeForm.arrearsAmount);
    if (!Number.isFinite(monthlyAmount) || monthlyAmount <= 0) {
      setState({ type: "error", message: "Monthly amount must be greater than 0." });
      return;
    }
    if (!Number.isFinite(arrearsAmount) || arrearsAmount < 0) {
      setState({ type: "error", message: "Arrears amount cannot be negative." });
      return;
    }

    setSavingFees(true);
    setState({ type: "idle" });
    try {
      const response = await fetch("/api/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserId,
          monthlyAmount,
          arrearsAmount,
          reminderEnabled: feeForm.reminderEnabled,
          reminderFrequency: feeForm.reminderFrequency,
          nextDueDate: feeForm.nextDueDate || undefined,
          notes: feeForm.notes.trim() || undefined
        })
      });
      const data = (await response.json()) as { error?: unknown };

      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Could not save fee settings.") });
        return;
      }

      await loadData();
      setState({ type: "success", message: "Fee settings updated." });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not save fee settings." });
    } finally {
      setSavingFees(false);
    }
  }

  async function recordPayment() {
    if (!selectedUserId) {
      setState({ type: "error", message: "Select a user first." });
      return;
    }

    const amount = Number(paymentForm.amount);
    const monthsCovered = Number(paymentForm.monthsCovered);
    if (!Number.isFinite(amount) || amount <= 0) {
      setState({ type: "error", message: "Payment amount must be greater than 0." });
      return;
    }
    if (!Number.isFinite(monthsCovered) || monthsCovered <= 0 || monthsCovered > 24) {
      setState({ type: "error", message: "Months covered must be between 1 and 24." });
      return;
    }

    setSavingPayment(true);
    setState({ type: "idle" });
    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionUserId: selectedUserId,
          amount,
          currency: "ZAR",
          method: paymentForm.method,
          status: paymentForm.status,
          reference: paymentForm.reference.trim() || undefined,
          monthsCovered,
          periodStart: paymentForm.periodStart || undefined,
          paidAt: paymentForm.status === "CONFIRMED" ? new Date().toISOString() : undefined
        })
      });
      const data = (await response.json()) as { error?: unknown };

      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Could not record payment.") });
        return;
      }

      await loadData();
      setState({ type: "success", message: "Payment recorded." });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not record payment." });
    } finally {
      setSavingPayment(false);
    }
  }

  if (loading) {
    return <p className="lead">Loading member fee tracking...</p>;
  }

  return (
    <section className="grid">
      {state.type === "error" ? <p className="notice error">{state.message}</p> : null}
      {state.type === "success" ? <p className="notice success">{state.message}</p> : null}

      <article className="card grid">
        <h3>Current Subscription Overview</h3>
        {subscriptions.length === 0 ? (
          <p className="lead">No subscriptions found yet.</p>
        ) : (
          <div className="grid">
            {subscriptions.map((subscription) => (
              <div key={subscription.id} className="metric">
                <strong>{subscription.user?.name ?? subscription.user?.email ?? subscription.userId}</strong>
                <span>Monthly: ZAR {parseAmount(subscription.monthlyAmount).toFixed(2)}</span>
                <span>Arrears: ZAR {parseAmount(subscription.arrearsAmount).toFixed(2)}</span>
                <span>Last payment: {toDateInput(subscription.lastPaymentDate) || "Not set"}</span>
                <span>Next due: {toDateInput(subscription.nextDueDate) || "Not set"}</span>
              </div>
            ))}
          </div>
        )}
      </article>

      <article className="card grid">
        <h3>Edit Member Fee Settings</h3>
        <div className="field">
          <label htmlFor="fee-user">Member</label>
          <select
            id="fee-user"
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
          >
            <option value="">Select member</option>
            {trackedUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} ({user.email}) - {user.role}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="monthlyAmount">Monthly Amount (ZAR)</label>
            <input
              id="monthlyAmount"
              type="number"
              step="0.01"
              min="0.01"
              value={feeForm.monthlyAmount}
              onChange={(event) => setFeeForm((current) => ({ ...current, monthlyAmount: event.target.value }))}
            />
          </div>

          <div className="field">
            <label htmlFor="arrearsAmount">Arrears Amount (ZAR)</label>
            <input
              id="arrearsAmount"
              type="number"
              step="0.01"
              min="0"
              value={feeForm.arrearsAmount}
              onChange={(event) => setFeeForm((current) => ({ ...current, arrearsAmount: event.target.value }))}
            />
          </div>

          <div className="field">
            <label htmlFor="reminderEnabled">Reminder Enabled</label>
            <select
              id="reminderEnabled"
              value={feeForm.reminderEnabled ? "yes" : "no"}
              onChange={(event) =>
                setFeeForm((current) => ({ ...current, reminderEnabled: event.target.value === "yes" }))
              }
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="reminderFrequency">Reminder Frequency</label>
            <select
              id="reminderFrequency"
              value={feeForm.reminderFrequency}
              onChange={(event) =>
                setFeeForm((current) => ({
                  ...current,
                  reminderFrequency: event.target.value as FeeForm["reminderFrequency"]
                }))
              }
            >
              <option value="WEEKLY">WEEKLY</option>
              <option value="BIWEEKLY">BIWEEKLY</option>
              <option value="MONTHLY">MONTHLY</option>
              <option value="QUARTERLY">QUARTERLY</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="nextDueDate">Next Due Date</label>
            <input
              id="nextDueDate"
              type="date"
              value={feeForm.nextDueDate}
              onChange={(event) => setFeeForm((current) => ({ ...current, nextDueDate: event.target.value }))}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="subscriptionNotes">Notes</label>
          <textarea
            id="subscriptionNotes"
            value={feeForm.notes}
            onChange={(event) => setFeeForm((current) => ({ ...current, notes: event.target.value }))}
          />
        </div>

        <button type="button" className="btn-primary" disabled={savingFees} onClick={() => void saveFeeSettings()}>
          {savingFees ? "Saving..." : "Save Fee Settings"}
        </button>
      </article>

      <article className="card grid">
        <h3>Record Member Fee Payment</h3>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="paymentAmount">Amount (ZAR)</label>
            <input
              id="paymentAmount"
              type="number"
              step="0.01"
              min="0.01"
              value={paymentForm.amount}
              onChange={(event) =>
                setPaymentForm((current) => ({ ...current, amount: event.target.value }))
              }
            />
          </div>

          <div className="field">
            <label htmlFor="paymentMethod">Method</label>
            <select
              id="paymentMethod"
              value={paymentForm.method}
              onChange={(event) =>
                setPaymentForm((current) => ({
                  ...current,
                  method: event.target.value as PaymentForm["method"]
                }))
              }
            >
              <option value="EFT">EFT</option>
              <option value="MANUAL_PROOF">MANUAL_PROOF</option>
              <option value="YOCO">YOCO</option>
              <option value="OZOW">OZOW</option>
              <option value="STRIPE">STRIPE</option>
              <option value="OTHER">OTHER</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="paymentStatus">Status</label>
            <select
              id="paymentStatus"
              value={paymentForm.status}
              onChange={(event) =>
                setPaymentForm((current) => ({
                  ...current,
                  status: event.target.value as PaymentForm["status"]
                }))
              }
            >
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="PENDING">PENDING</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="monthsCovered">Months Covered</label>
            <input
              id="monthsCovered"
              type="number"
              min="1"
              max="24"
              value={paymentForm.monthsCovered}
              onChange={(event) =>
                setPaymentForm((current) => ({ ...current, monthsCovered: event.target.value }))
              }
            />
          </div>

          <div className="field">
            <label htmlFor="periodStart">Period Start</label>
            <input
              id="periodStart"
              type="date"
              value={paymentForm.periodStart}
              onChange={(event) =>
                setPaymentForm((current) => ({ ...current, periodStart: event.target.value }))
              }
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="paymentReference">Reference (optional)</label>
          <input
            id="paymentReference"
            value={paymentForm.reference}
            onChange={(event) =>
              setPaymentForm((current) => ({ ...current, reference: event.target.value }))
            }
          />
        </div>

        <button type="button" className="btn-primary" disabled={savingPayment} onClick={() => void recordPayment()}>
          {savingPayment ? "Recording..." : "Record Payment"}
        </button>
      </article>
    </section>
  );
}
