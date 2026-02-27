import { AdminFeedbackModeration } from "@/components/AdminFeedbackModeration";

export default function AdminFeedbackPage() {
  return (
    <section className="grid">
      <article className="card grid">
        <span className="kicker">Guest Feedback</span>
        <h1>Feedback Moderation</h1>
        <p className="lead">Review guest/member feedback and control publication and visibility.</p>
      </article>

      <article className="grid">
        <AdminFeedbackModeration />
      </article>
    </section>
  );
}
