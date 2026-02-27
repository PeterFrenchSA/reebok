import { redirect } from "next/navigation";
import { AdminUserManager } from "@/components/AdminUserManager";
import { getSessionUserFromCookies } from "@/lib/auth";
import { SAMPLE_ADMIN, SAMPLE_MEMBER } from "@/lib/default-users";
import { hasPermission } from "@/lib/rbac";

export default async function AdminPage() {
  const user = await getSessionUserFromCookies();

  if (!user) {
    redirect("/login?next=/admin");
  }

  if (!hasPermission(user.role, "booking:manage")) {
    redirect("/member");
  }

  return (
    <section className="grid">
      <article className="card grid">
        <span className="kicker">Admin Section</span>
        <h1>Admin Console</h1>
        <p className="lead">
          Manage user access below. You can update names, roles, activation, and passwords.
        </p>
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
        <h2>User Management</h2>
        <AdminUserManager />
      </article>
    </section>
  );
}
