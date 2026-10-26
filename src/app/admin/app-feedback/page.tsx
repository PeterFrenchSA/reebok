import { AdminAppFeedback } from "@/components/AdminAppFeedback";
import { getSessionUserFromCookies } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { redirect } from "next/navigation";

export default async function AppFeedbackPage() {
  const user = await getSessionUserFromCookies();
  if (!user || !hasPermission(user.role, "app-feedback:manage")) redirect("/login?next=/admin/app-feedback");
  return <section className="grid">
    <header className="card grid">
      <span className="kicker">Improve the house manager</span>
      <h1>App Feedback</h1>
      <p className="lead">A shared notebook for appointed admins and super-admins. Report problems, discuss improvements and track follow-up.</p>
      <p className="notice">Private to administrators. This is not guest feedback, a maintenance request or an emergency contact channel. No email alerts are sent.</p>
    </header>
    <AdminAppFeedback />
  </section>;
}
