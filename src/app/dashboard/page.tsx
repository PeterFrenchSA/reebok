import { redirect } from "next/navigation";
import { getSessionUserFromCookies } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

export default async function DashboardPage() {
  const user = await getSessionUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  if (hasPermission(user.role, "booking:manage")) {
    redirect("/admin");
  }

  if (hasPermission(user.role, "booking:create:family")) {
    redirect("/member");
  }

  redirect("/guest");
}
