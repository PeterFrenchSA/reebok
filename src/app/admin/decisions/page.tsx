import { AdminDecisionVoting } from "@/components/AdminDecisionVoting";

export default function AdminDecisionsPage() {
  return (
    <section className="grid">
      <article className="card grid">
        <span className="kicker">Decisions</span>
        <h1>Governance Voting</h1>
        <p className="lead">Create polls, review member submissions, and track voting outcomes.</p>
      </article>

      <article className="grid">
        <AdminDecisionVoting />
      </article>
    </section>
  );
}
