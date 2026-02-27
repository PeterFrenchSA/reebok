import { AdminMaintenanceWorkflow } from "@/components/AdminMaintenanceWorkflow";

export default function AdminMaintenancePage() {
  return (
    <section className="grid">
      <article className="card grid">
        <span className="kicker">Maintenance</span>
        <h1>Maintenance Workflow</h1>
        <p className="lead">Approve member/admin tasks and track progress through completion.</p>
      </article>

      <article className="grid">
        <AdminMaintenanceWorkflow showAssets={false} showMaintenance />
      </article>
    </section>
  );
}
