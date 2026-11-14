import { redirect } from "next/navigation";
import { getSessionUserFromCookies } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { GoogleSheetsSettings } from "@/components/GoogleSheetsSettings";
export default async function IntegrationsPage() {
  const user = await getSessionUserFromCookies();
  if (!user || !hasPermission(user.role, "integrations:manage")) redirect("/login");
  return <GoogleSheetsSettings />;
}
