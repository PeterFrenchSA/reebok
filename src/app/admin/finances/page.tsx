import { AdminExpensesLedger } from "@/components/AdminExpensesLedger";
import { AdminFeeTracker } from "@/components/AdminFeeTracker";

export default function AdminFinancesPage() {
  return (
    <section className="grid">
      <article className="card grid">
        <span className="kicker">Finances</span>
        <h1>Finance Operations</h1>
        <p className="lead">Manage member fee tracking and the operational expenses ledger.</p>
      </article>

      <article className="grid">
        <h2>Member Fee Tracking</h2>
        <AdminFeeTracker />
      </article>

      <article className="grid">
        <h2>Expenses Ledger</h2>
        <AdminExpensesLedger />
      </article>
    </section>
  );
}
