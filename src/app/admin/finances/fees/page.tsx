import Link from "next/link";
import { AdminFeeTracker } from "@/components/AdminFeeTracker";
export default function MemberFeesPage() { return <section className="grid"><header className="card coastal-hero grid"><Link href="/admin/finances" className="text-action">Back to finances</Link><h1>Member fee tracking</h1><p className="lead">Contributions, recorded arrears, reminders and payments.</p></header><AdminFeeTracker /></section>; }
