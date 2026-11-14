import { redirect } from "next/navigation";
import { getSessionUserFromCookies } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { MemberSidebarNav } from "@/components/MemberSidebarNav";
export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUserFromCookies();
  if (!user) redirect("/login?next=/member");
  if (!hasPermission(user.role, "booking:create:family")) redirect("/guest");
  return <section className="admin-shell member-shell"><aside className="card admin-sidebar"><MemberSidebarNav finances={hasPermission(user.role, "finance:view")} /></aside><section className="admin-content">{children}</section></section>;
}
