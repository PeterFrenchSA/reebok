"use client";

import { FormEvent, useEffect, useState } from "react";

type UiState = {
  type: "idle" | "error" | "success";
  message?: string;
};

export default function AcceptInvitePage() {
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [state, setState] = useState<UiState>({ type: "idle" });

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token");
    if (value) {
      setToken(value);
    }
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ type: "idle" });

    if (!token.trim()) {
      setState({ type: "error", message: "Invitation token is required." });
      return;
    }
    if (password !== confirmPassword) {
      setState({ type: "error", message: "Passwords do not match." });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token.trim(),
          name: name.trim(),
          password
        })
      });
      const data = await response.json();

      if (!response.ok) {
        setState({
          type: "error",
          message: typeof data.error === "string" ? data.error : "Could not submit registration."
        });
        return;
      }

      setState({
        type: "success",
        message:
          typeof data.message === "string"
            ? data.message
            : "Registration submitted. Await admin approval."
      });
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not submit registration." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="grid grid-2">
      <article className="card grid">
        <span className="kicker">Invitation Registration</span>
        <h1>Complete Your Registration</h1>
        <p className="lead">
          Submit your details using the invitation token from your email. An admin must approve your
          registration before you can sign in.
        </p>

        <form className="form" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="invite-token">Invitation Token</label>
            <input
              id="invite-token"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="invite-name">Full Name</label>
            <input
              id="invite-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="invite-password">Password</label>
            <input
              id="invite-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="invite-confirm-password">Confirm Password</label>
            <input
              id="invite-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Submitting..." : "Submit For Approval"}
          </button>
        </form>

        {state.type === "error" ? <p className="notice error">{state.message}</p> : null}
        {state.type === "success" ? <p className="notice success">{state.message}</p> : null}
      </article>

      <article className="card grid">
        <h2>What Happens Next</h2>
        <ul className="list">
          <li>Your registration is queued for admin review.</li>
          <li>You will receive an email once approved or if changes are requested.</li>
          <li>After approval, sign in at `/login`.</li>
        </ul>
      </article>
    </section>
  );
}
