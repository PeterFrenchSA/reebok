import Link from "next/link";
export default function AdminFinancesPage() {
  return <section className="grid"><header className="card coastal-hero grid"><span className="kicker">House records</span><h1>Finances</h1><p className="lead">Contributions, payments and the cost of caring for our house, in one place.</p></header>
    <div className="quick-link-grid"><Link href="/admin/finances/fees" className="quick-link"><span className="kicker">Contributions</span><h2>Member fees</h2><p>Manage subscriptions, recorded arrears and member payments.</p></Link><Link href="/admin/finances/expenses" className="quick-link"><span className="kicker">House spending</span><h2>Expenses ledger</h2><p>Capture expenses and invoices, import records and export reports.</p></Link><Link href="/admin/integrations" className="quick-link"><span className="kicker">Reporting copy</span><h2>Google Sheets</h2><p>Sync the roster and financial records to your shared workbook.</p></Link></div>
    <p className="notice">The app is the source of truth. Booking estimates are not receipts, and recorded member arrears are not a live bank reconciliation.</p>
  </section>;
}
