import { redirect } from "next/navigation";
import { getSessionUserFromCookies } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { MemberBookingPage } from "@/components/MemberBookingPage";

export default async function MemberBookPage() {
  const user = await getSessionUserFromCookies();
  if (!user) redirect("/login?next=/member/book");
  if (!hasPermission(user.role, "booking:create:family")) redirect("/guest");
  return <MemberBookingPage name={user.name} email={user.email} />;
}
