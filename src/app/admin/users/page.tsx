import { AdminUserManager } from "@/components/AdminUserManager";
import { SAMPLE_ADMIN, SAMPLE_MEMBER } from "@/lib/default-users";

export default function AdminUsersPage() {
  return (
    <section className="grid">
      <article className="card grid">
        <span className="kicker">User Administration</span>
        <h1>Users & Access</h1>
        <p className="lead">Manage account roles, activation state, and passwords.</p>
      </article>

      <article className="card grid">
        <h2>Starter Accounts</h2>
        <p className="lead">These seeded accounts are available after `npm run prisma:seed`:</p>
        <ul className="list">
          <li>
            Admin: {SAMPLE_ADMIN.email} / {SAMPLE_ADMIN.password}
          </li>
          <li>
            Member: {SAMPLE_MEMBER.email} / {SAMPLE_MEMBER.password}
          </li>
        </ul>
      </article>

      <article className="grid">
        <AdminUserManager />
      </article>
    </section>
  );
}
