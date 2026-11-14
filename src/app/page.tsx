import { BookingRequestPage } from "@/components/BookingRequestPage";
import { getSessionUserFromCookies } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const user = await getSessionUserFromCookies();
  if (user && hasPermission(user.role, "booking:create:family")) redirect("/member/book");
  return <BookingRequestPage />;
}
