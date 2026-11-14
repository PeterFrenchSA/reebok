import { redirect } from "next/navigation";
import { getSessionUserFromCookies } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { AdminPricingManager } from "@/components/AdminPricingManager";
import { AdminRoomManager } from "@/components/AdminRoomManager";

export default async function PricingPage() {
  const user = await getSessionUserFromCookies();
  if (!user || !hasPermission(user.role, "finance:edit") || !hasPermission(user.role, "booking:manage")) redirect("/login?next=/admin/pricing");
  return <section className="grid"><header className="card grid"><span className="kicker">House configuration</span><h1>Pricing Management</h1><p className="lead">Publish accommodation rates and maintain the rooms families can reserve.</p><nav className="action-row" aria-label="Pricing sections"><a href="#pricing-configuration">Tariffs & seasons</a><a href="#room-configuration">Room inventory</a></nav></header><AdminPricingManager /><AdminRoomManager /></section>;
}
