import { AdminEmailTemplateManager } from "@/components/AdminEmailTemplateManager";

export default function AdminTemplatesPage() {
  return (
    <section className="grid">
      <article className="card grid">
        <span className="kicker">Communications</span>
        <h1>Email Templates</h1>
        <p className="lead">Manage booking email wording for request, approval-required, approved, and rejected flows.</p>
      </article>

      <AdminEmailTemplateManager />
    </section>
  );
}
