import { redirect } from "next/navigation";
import { AdminSidebarNav } from "@/components/AdminSidebarNav";
import { getSessionUserFromCookies } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUserFromCookies();

  if (!user) {
    redirect("/login?next=/admin");
  }

  if (!hasPermission(user.role, "booking:manage")) {
    redirect("/member");
  }

  return (
    <section className="admin-shell">
      <aside className="card admin-sidebar">
        <AdminSidebarNav />
      </aside>
      <section className="admin-content">{children}</section>
    </section>
  );
}
