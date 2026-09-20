import { redirect } from "next/navigation";
import { getSessionUserFromCookies } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { TelegramSettings } from "@/components/TelegramSettings";

export default async function TelegramPage() {
  const user = await getSessionUserFromCookies();
  if (!user) redirect("/login?next=/member");
  if (!hasPermission(user.role, "bot:use")) redirect("/guest");
  return <TelegramSettings />;
}
