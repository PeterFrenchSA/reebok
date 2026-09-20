import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUserFromCookies } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

const money = (value: unknown, currency = "ZAR") => `${currency} ${Number(value).toFixed(2)}`;
const date = (value: Date | null) => value?.toISOString().slice(0, 10) ?? "-";
export default async function ShareholderFinances({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await getSessionUserFromCookies();
  if (!user) redirect("/login?next=/member");
  if (!hasPermission(user.role, "finance:view")) redirect("/member");
  const input = Number((await searchParams).page ?? 1);
  const page = Number.isInteger(input) && input > 0 && input <= 10000 ? input : 1;
  const [subscriptions, expenses, payments] = await Promise.all([
    prisma.subscription.findMany({ include: { user: { select: { name: true, email: true } } }, orderBy: { user: { name: "asc" } } }),
    prisma.expense.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * 100, take: 101 }),
    prisma.payment.findMany({ include: { payer: { select: { name: true } }, subscriptionLinks: { include: { subscription: { include: { user: { select: { name: true } } } } } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * 100, take: 101 })
  ]);
  return (
    <section className="grid">
      <article className="card grid">
        <span className="kicker">Shareholder Access</span>
        <h1>Financial Records</h1>
        <p className="lead">Full financial visibility, read-only. Only appointed administrators can change records or confirm payments.</p>
        <div className="finance-export-actions">
          {["expenses", "payments", "subscriptions", "bookings"].map((entity) => (
            <a className="btn-secondary inline-action" key={entity} href={`/api/finance/export?entity=${entity}&format=xlsx`}>Export {entity}</a>
          ))}
        </div>
      </article>
      <article className="card grid">
        <h2>All Member Fees</h2>
        {subscriptions.length === 0 ? <p>No member fee records yet.</p> : null}
        {subscriptions.map((sub) => (
          <details key={sub.id}>
            <summary>{sub.user.name}: arrears {money(sub.arrearsAmount)}</summary>
            <p>{sub.user.email} | Monthly {money(sub.monthlyAmount)} | Next due {date(sub.nextDueDate)} | Last payment {date(sub.lastPaymentDate)}</p>
            <p>{sub.notes}</p>
          </details>
        ))}
      </article>
      <article className="card grid">
        <h2>Expenses</h2>
        {expenses.length === 0 ? <p>No expenses on this page.</p> : null}
        {expenses.slice(0, 100).map((expense) => (
          <details key={expense.id}>
            <summary>{expense.title}: {money(expense.amount, expense.currency)}</summary>
            <p>{expense.category} | {expense.supplier} | Invoice {expense.invoiceNumber} | Paid {date(expense.paidDate)}</p>
            <p>{expense.description}</p>
            {expense.invoiceFileUrl ? <a href={expense.invoiceFileUrl} target="_blank" rel="noreferrer">Supporting document</a> : null}
          </details>
        ))}
      </article>
      <article className="card grid">
        <h2>Payments</h2>
        {payments.length === 0 ? <p>No payments on this page.</p> : null}
        {payments.slice(0, 100).map((payment) => (
          <details key={payment.id}>
            <summary>
              {payment.subscriptionLinks.map((entry) => entry.subscription.user.name).join(", ") || payment.payer?.name || "Unassigned"}:
              {" "}{money(payment.amount, payment.currency)} / {payment.status}
            </summary>
            <p>{payment.method} | Reference {payment.reference ?? "-"} | Paid {date(payment.paidAt)} | Booking {payment.bookingId ?? "-"}</p>
            {payment.proofFileUrl ? <a href={payment.proofFileUrl} target="_blank" rel="noreferrer">Proof of payment</a> : null}
          </details>
        ))}
      </article>
      <nav aria-label="Financial record pages">
        {page > 1 ? <Link href={`/member/finances?page=${page - 1}`}>Previous</Link> : null}
        {" "}<span>Page {page}</span>{" "}
        {expenses.length > 100 || payments.length > 100 ? <Link href={`/member/finances?page=${page + 1}`}>Next</Link> : null}
      </nav>
    </section>
  );
}
