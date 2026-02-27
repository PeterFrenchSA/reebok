"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SAMPLE_ADMIN, SAMPLE_MEMBER } from "@/lib/default-users";

type LoginState = {
  type: "idle" | "error";
  message?: string;
};

function isAllowedNextPath(value: string | null): value is "/admin" | "/member" {
  return value === "/admin" || value === "/member";
}

export default function LoginPage() {
  const params = useSearchParams();
  const nextPath = useMemo(() => {
    const value = params.get("next");
    return isAllowedNextPath(value) ? value : null;
  }, [params]);

  const [email, setEmail] = useState(SAMPLE_MEMBER.email);
  const [password, setPassword] = useState(SAMPLE_MEMBER.password);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [state, setState] = useState<LoginState>({ type: "idle" });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setState({ type: "idle" });

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();

      if (!response.ok) {
        setState({
          type: "error",
          message: typeof data.error === "string" ? data.error : "Sign in failed."
        });
        return;
      }

      const destination =
        nextPath ?? (typeof data.redirectTo === "string" ? data.redirectTo : "/member");
      window.location.assign(destination);
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Sign in failed due to a network error." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="grid grid-2">
      <article className="card grid">
        <span className="kicker">Sign In</span>
        <h1>Member and Admin Login</h1>
        <p className="lead">Use your email and password to access `/member` or `/admin` sections.</p>

        <form className="form" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {state.type === "error" ? <p className="notice error">{state.message}</p> : null}
      </article>

      <article className="card grid">
        <h2>Sample Users (Seeded)</h2>
        <p className="lead">
          These are starter credentials for now. You can change passwords from the `/admin` section.
        </p>
        <div className="metric">
          <strong>Admin</strong>
          <span>{SAMPLE_ADMIN.email}</span>
          <span>Password: {SAMPLE_ADMIN.password}</span>
        </div>
        <div className="metric">
          <strong>Member</strong>
          <span>{SAMPLE_MEMBER.email}</span>
          <span>Password: {SAMPLE_MEMBER.password}</span>
        </div>
      </article>
    </section>
  );
}
