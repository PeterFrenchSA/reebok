import Link from "next/link";
import { AdminExpensesLedger } from "@/components/AdminExpensesLedger";
export default function ExpensesPage() { return <section className="grid"><header className="card coastal-hero grid"><Link href="/admin/finances" className="text-action">Back to finances</Link><h1>Expenses ledger</h1><p className="lead">Record house spending, link supporting documents and manage imports and exports.</p></header><AdminExpensesLedger /></section>; }
