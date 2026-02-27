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
  updatedAt: string;
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

type ApiResponse = {
  decisions?: Decision[];
  currentUser?: { id: string };
  error?: unknown;
};

type PanelState = { type: "idle" | "success" | "error"; message?: string };

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

function fmtDate(value?: string | null): string {
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

const defaultSubmitForm = { title: "", description: "" };

export function MemberDecisionVoting() {
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<PanelState>({ type: "idle" });
  const [submitForm, setSubmitForm] = useState(defaultSubmitForm);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const mySubmissions = useMemo(
    () =>
      decisions.filter(
        (decision) =>
          decision.submittedBy?.id === currentUserId &&
          (decision.status === "PENDING_REVIEW" || decision.status === "REJECTED")
      ),
    [decisions, currentUserId]
  );

  const activePolls = useMemo(
    () => decisions.filter((decision) => decision.status === "ACTIVE"),
    [decisions]
  );

  const closedPolls = useMemo(
    () => decisions.filter((decision) => decision.status === "CLOSED"),
    [decisions]
  );

  const loadDecisions = useCallback(async () => {
    setLoading(true);
    setState({ type: "idle" });
    try {
      const response = await fetch("/api/decisions", { cache: "no-store" });
      const data = (await response.json()) as ApiResponse;
      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Could not load decisions.") });
        return;
      }

      setDecisions(data.decisions ?? []);
      setCurrentUserId(data.currentUser?.id ?? "");
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

  async function submitForReview() {
    const title = submitForm.title.trim();
    const description = submitForm.description.trim();
    if (title.length < 5 || description.length < 10) {
      setState({ type: "error", message: "Title must be 5+ chars and description 10+ chars." });
      return;
    }

    setSubmitBusy(true);
    setState({ type: "idle" });
    try {
      const response = await fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          submitForReview: true
        })
      });
      const data = (await response.json()) as ApiResponse;
      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Could not submit decision.") });
        return;
      }

      setSubmitForm(defaultSubmitForm);
      await loadDecisions();
      setState({ type: "success", message: "Decision submitted for admin review." });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not submit decision." });
    } finally {
      setSubmitBusy(false);
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
      const data = (await response.json()) as ApiResponse;
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
        <h3>Submit Decision For Review</h3>
        <p className="lead">
          Suggest a decision here. Admins can review it and launch as either admin-only or all-member poll.
        </p>
        <div className="field">
          <label htmlFor="member-decision-title">Title</label>
          <input
            id="member-decision-title"
            value={submitForm.title}
            onChange={(event) =>
              setSubmitForm((current) => ({ ...current, title: event.target.value }))
            }
          />
        </div>
        <div className="field">
          <label htmlFor="member-decision-description">Description</label>
          <textarea
            id="member-decision-description"
            value={submitForm.description}
            onChange={(event) =>
              setSubmitForm((current) => ({ ...current, description: event.target.value }))
            }
          />
        </div>
        <button type="button" className="btn-primary" disabled={submitBusy} onClick={() => void submitForReview()}>
          {submitBusy ? "Submitting..." : "Submit For Review"}
        </button>
      </article>

      <article className="card grid">
        <h3>My Submissions</h3>
        {mySubmissions.length === 0 ? (
          <p className="lead">No pending/rejected submissions from your account.</p>
        ) : (
          mySubmissions.map((decision) => (
            <article key={decision.id} className="decision-card">
              <div className="status-line">
                <span className={`status-pill status-${decision.status.toLowerCase()}`}>
                  {statusLabel(decision.status)}
                </span>
                <span className="lead">Updated: {fmtDate(decision.updatedAt)}</span>
              </div>
              <h4>{decision.title}</h4>
              <p className="lead">{decision.description}</p>
              {decision.reviewNotes ? <p className="lead">Admin note: {decision.reviewNotes}</p> : null}
            </article>
          ))
        )}
      </article>

      <article className="card grid">
        <h3>Active Polls</h3>
        {activePolls.length === 0 ? (
          <p className="lead">No active polls at the moment.</p>
        ) : (
          activePolls.map((decision) => {
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
                  Opens: {fmtDate(decision.launchedAt)} | Closes: {fmtDate(decision.closesAt)}
                </p>
                <DecisionTracking tracking={decision.tracking} />
                <p className="lead">Your vote: {decision.currentUserVote ?? "Not voted"}</p>

                {decision.canVote ? (
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
                  </div>
                ) : (
                  <p className="lead">Voting is not available for your role on this decision.</p>
                )}
              </article>
            );
          })
        )}
      </article>

      <article className="card grid">
        <h3>Closed Polls</h3>
        {closedPolls.length === 0 ? (
          <p className="lead">No closed polls yet.</p>
        ) : (
          closedPolls.map((decision) => (
            <article key={decision.id} className="decision-card">
              <div className="status-line">
                <span className={`status-pill status-${decision.status.toLowerCase()}`}>
                  {statusLabel(decision.status)}
                </span>
                <span className="lead">Closed: {fmtDate(decision.closedAt)}</span>
              </div>
              <h4>{decision.title}</h4>
              <p className="lead">{decision.description}</p>
              <DecisionTracking tracking={decision.tracking} />
            </article>
          ))
        )}
      </article>
    </section>
  );
}
