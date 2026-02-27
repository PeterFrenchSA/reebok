"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DecisionTracking } from "@/components/DecisionTracking";

type DecisionAudience = "ADMINS_ONLY" | "MEMBERS_AND_ADMINS";
type DecisionStatus = "PENDING_REVIEW" | "ACTIVE" | "CLOSED" | "REJECTED";
type VoteChoice = "YES" | "NO" | "ABSTAIN";

type Decision = {
  id: string;
  title: string;
  description: string;
  audience: DecisionAudience;
  status: DecisionStatus;
  submittedBy?: { id: string; name: string; email: string; role: string } | null;
  reviewedBy?: { id: string; name: string; email: string; role: string } | null;
  reviewedAt?: string | null;
  launchedAt?: string | null;
  closesAt?: string | null;
  closedAt?: string | null;
  reviewNotes?: string | null;
  currentUserVote: VoteChoice | null;
  canVote: boolean;
  tracking: {
    eligibleVoters: number;
    totalVotes: number;
    yes: number;
    no: number;
    abstain: number;
    participationPct: number;
  };
};

type PanelState = { type: "idle" | "success" | "error"; message?: string };

function fmtDate(value?: string | null): string {
  return value ? value.slice(0, 10) : "Not set";
}

function statusLabel(status: DecisionStatus): string {
  if (status === "PENDING_REVIEW") {
    return "Pending Review";
  }
  if (status === "ACTIVE") {
    return "Active";
  }
  if (status === "CLOSED") {
    return "Closed";
  }
  return "Rejected";
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

const defaultCreateForm = {
  title: "",
  description: "",
  audience: "MEMBERS_AND_ADMINS" as DecisionAudience,
  closesAt: ""
};

export function AdminDecisionVoting() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<PanelState>({ type: "idle" });
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState(defaultCreateForm);
  const [createBusy, setCreateBusy] = useState(false);
  const [reviewAudience, setReviewAudience] = useState<Record<string, DecisionAudience>>({});
  const [reviewClosesAt, setReviewClosesAt] = useState<Record<string, string>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const pending = useMemo(
    () => decisions.filter((decision) => decision.status === "PENDING_REVIEW"),
    [decisions]
  );
  const active = useMemo(
    () => decisions.filter((decision) => decision.status === "ACTIVE"),
    [decisions]
  );
  const archived = useMemo(
    () => decisions.filter((decision) => decision.status === "CLOSED" || decision.status === "REJECTED"),
    [decisions]
  );

  const loadDecisions = useCallback(async () => {
    setLoading(true);
    setState({ type: "idle" });
    try {
      const response = await fetch("/api/decisions", { cache: "no-store" });
      const data = (await response.json()) as { decisions?: Decision[]; error?: unknown };
      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Could not load decisions.") });
        return;
      }

      const nextDecisions = data.decisions ?? [];
      setDecisions(nextDecisions);
      setReviewAudience((current) => {
        const next = { ...current };
        for (const decision of nextDecisions) {
          if (!next[decision.id]) {
            next[decision.id] = decision.audience;
          }
        }
        return next;
      });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not load decisions." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDecisions();
  }, [loadDecisions]);

  async function createPoll() {
    const title = createForm.title.trim();
    const description = createForm.description.trim();
    if (title.length < 5 || description.length < 10) {
      setState({ type: "error", message: "Title must be 5+ chars and description 10+ chars." });
      return;
    }

    setCreateBusy(true);
    setState({ type: "idle" });
    try {
      const response = await fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          audience: createForm.audience,
          closesAt: createForm.closesAt || undefined,
          submitForReview: false
        })
      });
      const data = (await response.json()) as { error?: unknown };
      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Could not create poll.") });
        return;
      }

      setCreateForm(defaultCreateForm);
      await loadDecisions();
      setState({ type: "success", message: "Decision poll created." });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not create poll." });
    } finally {
      setCreateBusy(false);
    }
  }

  async function launchDecision(decisionId: string) {
    setProcessingId(decisionId);
    setState({ type: "idle" });
    try {
      const response = await fetch(`/api/decisions/${encodeURIComponent(decisionId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "launch",
          audience: reviewAudience[decisionId] ?? "MEMBERS_AND_ADMINS",
          closesAt: reviewClosesAt[decisionId] || undefined
        })
      });
      const data = (await response.json()) as { error?: unknown };
      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Could not launch decision.") });
        return;
      }

      await loadDecisions();
      setState({ type: "success", message: "Decision launched for voting." });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not launch decision." });
    } finally {
      setProcessingId(null);
    }
  }

  async function rejectDecision(decisionId: string) {
    setProcessingId(decisionId);
    setState({ type: "idle" });
    try {
      const response = await fetch(`/api/decisions/${encodeURIComponent(decisionId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          reviewNotes: reviewNotes[decisionId]?.trim() || undefined
        })
      });
      const data = (await response.json()) as { error?: unknown };
      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Could not reject decision.") });
        return;
      }

      await loadDecisions();
      setState({ type: "success", message: "Decision rejected." });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not reject decision." });
    } finally {
      setProcessingId(null);
    }
  }

  async function closeDecision(decisionId: string) {
    setProcessingId(decisionId);
    setState({ type: "idle" });
    try {
      const response = await fetch(`/api/decisions/${encodeURIComponent(decisionId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close" })
      });
      const data = (await response.json()) as { error?: unknown };
      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Could not close decision.") });
        return;
      }

      await loadDecisions();
      setState({ type: "success", message: "Decision closed." });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not close decision." });
    } finally {
      setProcessingId(null);
    }
  }

  async function castVote(decisionId: string, choice: VoteChoice) {
    setProcessingId(decisionId);
    setState({ type: "idle" });
    try {
      const response = await fetch(`/api/decisions/${encodeURIComponent(decisionId)}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choice })
      });
      const data = (await response.json()) as { error?: unknown };
      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Could not record vote.") });
        return;
      }

      await loadDecisions();
      setState({ type: "success", message: "Vote recorded." });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not record vote." });
    } finally {
      setProcessingId(null);
    }
  }

  if (loading) {
    return <p className="lead">Loading decision voting...</p>;
  }

  return (
    <section className="grid">
      {state.type === "error" ? <p className="notice error">{state.message}</p> : null}
      {state.type === "success" ? <p className="notice success">{state.message}</p> : null}

      <article className="card grid">
        <h3>Create Poll (Admin)</h3>
        <div className="field">
          <label htmlFor="decision-title">Title</label>
          <input
            id="decision-title"
            value={createForm.title}
            onChange={(event) =>
              setCreateForm((current) => ({ ...current, title: event.target.value }))
            }
          />
        </div>
        <div className="field">
          <label htmlFor="decision-description">Description</label>
          <textarea
            id="decision-description"
            value={createForm.description}
            onChange={(event) =>
              setCreateForm((current) => ({ ...current, description: event.target.value }))
            }
          />
        </div>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="decision-audience">Audience</label>
            <select
              id="decision-audience"
              value={createForm.audience}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  audience: event.target.value as DecisionAudience
                }))
              }
            >
              <option value="ADMINS_ONLY">Admins only</option>
              <option value="MEMBERS_AND_ADMINS">Members and admins</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="decision-closes">Closing date (optional)</label>
            <input
              id="decision-closes"
              type="date"
              value={createForm.closesAt}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, closesAt: event.target.value }))
              }
            />
          </div>
        </div>
        <button type="button" className="btn-primary" disabled={createBusy} onClick={() => void createPoll()}>
          {createBusy ? "Creating..." : "Create Poll"}
        </button>
      </article>

      <article className="card grid">
        <h3>Member Submissions Pending Review</h3>
        {pending.length === 0 ? (
          <p className="lead">No pending submissions.</p>
        ) : (
          pending.map((decision) => {
            const isProcessing = processingId === decision.id;
            return (
              <article key={decision.id} className="decision-card">
                <div className="status-line">
                  <span className={`status-pill status-${decision.status.toLowerCase()}`}>
                    {statusLabel(decision.status)}
                  </span>
                  <span className="lead">Submitted by {decision.submittedBy?.name ?? "Unknown"}</span>
                </div>
                <h4>{decision.title}</h4>
                <p className="lead">{decision.description}</p>

                <div className="grid grid-2">
                  <div className="field">
                    <label>Poll audience</label>
                    <select
                      value={reviewAudience[decision.id] ?? decision.audience}
                      onChange={(event) =>
                        setReviewAudience((current) => ({
                          ...current,
                          [decision.id]: event.target.value as DecisionAudience
                        }))
                      }
                    >
                      <option value="ADMINS_ONLY">Admins only</option>
                      <option value="MEMBERS_AND_ADMINS">Members and admins</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Closing date (optional)</label>
                    <input
                      type="date"
                      value={reviewClosesAt[decision.id] ?? ""}
                      onChange={(event) =>
                        setReviewClosesAt((current) => ({
                          ...current,
                          [decision.id]: event.target.value
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="field">
                  <label>Review note (optional)</label>
                  <input
                    value={reviewNotes[decision.id] ?? ""}
                    onChange={(event) =>
                      setReviewNotes((current) => ({
                        ...current,
                        [decision.id]: event.target.value
                      }))
                    }
                  />
                </div>

                <div className="action-row">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={isProcessing}
                    onClick={() => void launchDecision(decision.id)}
                  >
                    {isProcessing ? "Processing..." : "Launch Poll"}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={isProcessing}
                    onClick={() => void rejectDecision(decision.id)}
                  >
                    {isProcessing ? "Processing..." : "Reject"}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </article>

      <article className="card grid">
        <h3>Active Polls</h3>
        {active.length === 0 ? (
          <p className="lead">No active polls at the moment.</p>
        ) : (
          active.map((decision) => {
            const isProcessing = processingId === decision.id;
            return (
              <article key={decision.id} className="decision-card">
                <div className="status-line">
                  <span className={`status-pill status-${decision.status.toLowerCase()}`}>
                    {statusLabel(decision.status)}
                  </span>
                  <span className="lead">{decision.audience === "ADMINS_ONLY" ? "Admins only" : "Members and admins"}</span>
                </div>
                <h4>{decision.title}</h4>
                <p className="lead">{decision.description}</p>
                <p className="lead">
                  Launched: {fmtDate(decision.launchedAt)} | Closes: {fmtDate(decision.closesAt)}
                </p>

                <DecisionTracking tracking={decision.tracking} />
                <p className="lead">Your vote: {decision.currentUserVote ?? "Not voted"}</p>

                <div className="action-row">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={isProcessing}
                    onClick={() => void castVote(decision.id, "YES")}
                  >
                    Vote Yes
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={isProcessing}
                    onClick={() => void castVote(decision.id, "NO")}
                  >
                    Vote No
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={isProcessing}
                    onClick={() => void castVote(decision.id, "ABSTAIN")}
                  >
                    Abstain
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={isProcessing}
                    onClick={() => void closeDecision(decision.id)}
                  >
                    Close Poll
                  </button>
                </div>
              </article>
            );
          })
        )}
      </article>

      <article className="card grid">
        <h3>Closed / Rejected</h3>
        {archived.length === 0 ? (
          <p className="lead">No closed or rejected decisions yet.</p>
        ) : (
          archived.map((decision) => (
            <article key={decision.id} className="decision-card">
              <div className="status-line">
                <span className={`status-pill status-${decision.status.toLowerCase()}`}>
                  {statusLabel(decision.status)}
                </span>
                <span className="lead">Closed: {fmtDate(decision.closedAt)}</span>
              </div>
              <h4>{decision.title}</h4>
              <p className="lead">{decision.description}</p>
              {decision.reviewNotes ? <p className="lead">Review note: {decision.reviewNotes}</p> : null}
              <DecisionTracking tracking={decision.tracking} />
            </article>
          ))
        )}
      </article>
    </section>
  );
}
