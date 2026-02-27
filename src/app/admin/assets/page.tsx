import { AdminMaintenanceWorkflow } from "@/components/AdminMaintenanceWorkflow";

export default function AdminAssetsPage() {
  return (
    <section className="grid">
      <article className="card grid">
        <span className="kicker">Asset Management</span>
        <h1>Assets</h1>
        <p className="lead">Register assets, update warranty tracking, and attach supporting documents.</p>
      </article>

      <article className="grid">
        <AdminMaintenanceWorkflow showAssets showMaintenance={false} />
      </article>
    </section>
  );
}
