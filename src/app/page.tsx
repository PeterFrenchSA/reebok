const firstIteration = [
  "Invite-only users with role model (shareholder, family member, guest)",
  "Booking workflow with mandatory approval",
  "External whole-house bookings + family room-specific option",
  "Fee engine based on agreed Reebok structure",
  "Finance entities with CSV/XLS import and export APIs",
  "Manual and gateway-ready payment records (Yoco/Ozow scaffolding)",
  "Asset and maintenance tracking",
  "Public and internal feedback capture",
  "Invoice OCR extraction endpoint using OpenAI API",
  "Booking.com/Airbnb channel sync scaffolding (calendar-first)"
];

export default function HomePage() {
  return (
    <section className="grid">
      <article className="card grid">
        <span className="kicker">Iteration 1</span>
        <h1>Beach House Operations Platform</h1>
        <p className="lead">
          This first build establishes the core backend and workflow foundations for Sandeney Pty Ltd to
          manage family usage, public lets, finances, and maintenance in a single system.
        </p>
      </article>

      <div className="grid grid-2">
        <article className="card grid">
          <h2>What Is Included</h2>
          <ul className="list">
            {firstIteration.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="card grid">
          <h2>Primary Workflow</h2>
          <ol className="list">
            <li>Invite users and assign roles.</li>
            <li>Create booking requests (family or public).</li>
            <li>Shareholder approves or rejects each request.</li>
            <li>Capture payments and proofs, including multi-month subscriptions.</li>
            <li>Track expenses, assets, and maintenance tasks.</li>
            <li>Import/export finance records via CSV/XLS.</li>
          </ol>
        </article>
      </div>

      <div className="grid grid-2">
        <article className="card grid">
          <h3>Proposal Rules Captured</h3>
          <div className="metric">
            <strong>R100 / month</strong>
            <span>Member subscription tracking</span>
          </div>
          <div className="metric">
            <strong>Tiered nightly rates</strong>
            <span>Members, dependents, guests, mere family, external visitors</span>
          </div>
          <div className="metric">
            <strong>Seasonal external pricing</strong>
            <span>Configurable by date windows</span>
          </div>
        </article>

        <article className="card grid">
          <h3>Quick Start</h3>
          <p className="lead">Use Public Booking to test external demand capture. Use Dashboard for admin and family operations.</p>
        </article>
      </div>
    </section>
  );
}
