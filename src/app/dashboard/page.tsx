const roleMatrix = [
  {
    role: "Shareholder / Super Admin",
    scope: "Full finance + approvals + maintenance + assets + invite management"
  },
  {
    role: "Family Member",
    scope: "Create family bookings (whole-house or room-specific), view own bookings"
  },
  {
    role: "Guest / Visitor",
    scope: "Create external whole-house booking requests"
  }
];

export default function DashboardPage() {
  return (
    <section className="grid">
      <article className="card grid">
        <span className="kicker">Admin + Family Console</span>
        <h1>Operations Dashboard (Scaffold)</h1>
        <p className="lead">
          This screen is a functional scaffold for role-based modules. API endpoints for bookings,
          approvals, payments, imports/exports, maintenance, feedback, invitations, and OCR are already
          included in iteration 1.
        </p>
      </article>

      <div className="grid grid-2">
        <article className="card grid">
          <h2>Role Access</h2>
          <ul className="list">
            {roleMatrix.map((item) => (
              <li key={item.role}>
                <strong>{item.role}</strong>: {item.scope}
              </li>
            ))}
          </ul>
        </article>

        <article className="card grid">
          <h2>Core API Endpoints</h2>
          <ul className="list">
            <li>`POST /api/bookings` create booking (always pending approval).</li>
            <li>`POST /api/bookings/:id/approve` approve request.</li>
            <li>`POST /api/bookings/:id/reject` reject request.</li>
            <li>`GET/POST /api/rooms` manage rooms and capacities.</li>
            <li>`GET/POST /api/invitations` and `POST /api/invitations/accept` invite-only onboarding.</li>
            <li>`GET/POST /api/payments` payments + manual proofs + subscription periods.</li>
            <li>`GET/POST/PATCH /api/subscriptions` arrears + reminder settings.</li>
            <li>`GET/POST /api/expenses` editable running costs ledger.</li>
            <li>`GET/POST/PATCH /api/fees/config` fee and seasonal-rate configuration.</li>
            <li>`GET /api/finance/export` and `POST /api/finance/import` CSV/XLS transfer.</li>
            <li>`GET/POST /api/maintenance/tasks` maintenance tracker.</li>
            <li>`GET/POST /api/assets` asset tracker.</li>
            <li>`GET/POST /api/feedback` public and internal comments.</li>
            <li>`POST /api/ocr/invoice` invoice extraction via OpenAI API.</li>
            <li>`GET/POST /api/channels/sync` Booking.com/Airbnb sync scaffold.</li>
          </ul>
        </article>
      </div>

      <article className="card grid">
        <h2>Next UI Iteration</h2>
        <ol className="list">
          <li>Secure sign-in (magic link + invite token acceptance).</li>
          <li>Calendar board with pending/approved views.</li>
          <li>Finance console with arrears dashboards and reminder toggles.</li>
          <li>Maintenance board with assets, costs, and recurrence timeline.</li>
        </ol>
      </article>
    </section>
  );
}
