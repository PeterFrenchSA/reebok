"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AppFeedbackEntryItem, AppFeedbackItem, FeedbackCategory, FeedbackStatus,
  feedbackCategories, feedbackCategoryLabels, feedbackStatuses, feedbackStatusLabels } from "@/lib/app-feedback-shared";

async function responseData(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "The request failed. Please try again.");
  return data;
}
const when = (value: string) => new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date(value));

export function AdminAppFeedback() {
  const [items, setItems] = useState<AppFeedbackItem[]>([]);
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [newCategory, setNewCategory] = useState<FeedbackCategory>("SUGGESTION");
  const refresh = () => setRevision((value) => value + 1);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    const query = new URLSearchParams({ page: String(page) });
    if (status) query.set("status", status);
    if (category) query.set("category", category);
    fetch(`/api/admin/app-feedback?${query}`, { cache: "no-store", signal: controller.signal })
      .then(responseData).then((data) => {
        setItems(data.items); setTotal(data.total); setHasMore(data.hasMore);
      }).catch((reason: Error) => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [status, category, page, revision]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setNotice("");
    try {
      const data = await responseData(await fetch("/api/admin/app-feedback", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, category: newCategory }) }));
      setTitle(""); setBody(""); setStatus(""); setCategory(""); setPage(1);
      setSelected(data.item.id); refresh(); setNotice("Feedback submitted. Only administrators can see this discussion.");
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Could not submit feedback."); }
    finally { setSaving(false); }
  }

  return <section className="grid">
    <details className="card feedback-compose">
      <summary>Share a problem, suggestion or comment</summary>
      <form className="grid" onSubmit={submit}>
        <p className="lead">Include the page, what you expected and what happened. Do not include passwords, private links or financial documents.</p>
        <div className="field"><label htmlFor="app-feedback-category">Type</label>
          <select id="app-feedback-category" value={newCategory} onChange={(e) => setNewCategory(e.target.value as FeedbackCategory)} disabled={saving}>
            {feedbackCategories.map((value) => <option key={value} value={value}>{feedbackCategoryLabels[value]}</option>)}
          </select></div>
        <div className="field"><label htmlFor="app-feedback-title">Title</label>
          <input id="app-feedback-title" required minLength={5} maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving} /></div>
        <div className="field"><label htmlFor="app-feedback-body">Details</label>
          <textarea id="app-feedback-body" required minLength={10} maxLength={4000} rows={5} value={body} onChange={(e) => setBody(e.target.value)} disabled={saving} />
          <span className="lead">{body.length}/4000 characters. Posts and replies are retained as a discussion record.</span></div>
        <button className="btn-primary" type="submit" disabled={saving}>{saving ? "Submitting..." : "Submit feedback"}</button>
      </form>
    </details>
    {notice && <p className="notice" role="status">{notice}</p>}
    <section className="card grid">
      <div className="action-row"><h2>Admin discussions</h2><button type="button" className="btn-secondary" onClick={refresh} disabled={loading}>Refresh list</button></div>
      <div className="grid grid-2">
        <div className="field"><label htmlFor="app-feedback-status-filter">Status</label><select id="app-feedback-status-filter" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>{feedbackStatuses.map((value) => <option key={value} value={value}>{feedbackStatusLabels[value]}</option>)}
        </select></div>
        <div className="field"><label htmlFor="app-feedback-type-filter">Type</label><select id="app-feedback-type-filter" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
          <option value="">All types</option>{feedbackCategories.map((value) => <option key={value} value={value}>{feedbackCategoryLabels[value]}</option>)}
        </select></div>
      </div>
      <p className="lead">New = received; Under Review = being assessed; Planned = intended work; Resolved = addressed. Status is not a delivery promise.</p>
      {error ? <p className="notice error" role="alert">{error}</p> : loading ? <p role="status">Loading discussions...</p> : <>
        <p className="lead">{total} discussion{total === 1 ? "" : "s"}. Most recently updated first.</p>
        {items.length === 0 && <p>No discussions match these filters. Start one above or choose another filter.</p>}
        <div className="feedback-list">{items.map((item) => <button key={item.id} type="button" className={`feedback-list-item ${selected === item.id ? "feedback-selected" : ""}`} aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>
          <span className="feedback-list-heading"><strong>{item.title}</strong><span className={`feedback-badge feedback-${item.status.toLowerCase()}`}>{feedbackStatusLabels[item.status]}</span></span>
          <span className="lead">{feedbackCategoryLabels[item.category]} | {item.author?.name ?? "Former administrator"} | {when(item.createdAt)}</span>
          <span className="lead">{item._count.entries} discussion updates</span>
        </button>)}</div>
        <div className="action-row"><button type="button" className="btn-secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous page</button>
          <span>Page {page}</span><button type="button" className="btn-secondary" disabled={!hasMore} onClick={() => setPage(page + 1)}>Next page</button></div>
      </>}
    </section>
    {selected ? <FeedbackDiscussion key={selected} id={selected} onChange={refresh} onClose={() => setSelected(null)} /> : <p className="lead">Select a discussion to read replies or update its status.</p>}
  </section>;
}

function FeedbackDiscussion({ id, onChange, onClose }: { id: string; onChange: () => void; onClose: () => void }) {
  const [item, setItem] = useState<AppFeedbackItem | null>(null);
  const [entries, setEntries] = useState<AppFeedbackEntryItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [newStatus, setNewStatus] = useState<FeedbackStatus>("NEW");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);

  function apply(data: { item: AppFeedbackItem; entries: AppFeedbackEntryItem[]; page: number; hasMore: boolean }, append = false) {
    setItem(data.item); setNewStatus(data.item.status); setPage(data.page); setHasMore(data.hasMore);
    setEntries((previous) => append ? [...previous, ...data.entries.filter((entry) => !previous.some((old) => old.id === entry.id))] : data.entries);
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/app-feedback/${id}`, { cache: "no-store", signal: controller.signal }).then(responseData).then((data) => apply(data))
      .catch((reason: Error) => { if (!controller.signal.aborted) setError(reason.message); });
    heading.current?.focus();
    return () => controller.abort();
  }, [id]);

  async function load(older = false) {
    setBusy(true); setError("");
    try { apply(await responseData(await fetch(`/api/admin/app-feedback/${id}?page=${older ? page + 1 : 1}`, { cache: "no-store" })), older); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load discussion."); }
    finally { setBusy(false); }
  }
  async function mutate(event: FormEvent, method: "POST" | "PATCH") {
    event.preventDefault(); if (!item) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await responseData(await fetch(`/api/admin/app-feedback/${id}`, { method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(method === "POST" ? { body: reply } : { status: newStatus, version: item.version }) }));
      if (method === "POST") setReply("");
      setNotice(method === "POST" ? "Reply posted." : "Status saved."); onChange();
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save changes."); }
    finally { setBusy(false); }
  }

  return <article className="card grid feedback-discussion" aria-labelledby="discussion-title">
    <div className="action-row"><span className="kicker">Private admin discussion</span><button type="button" className="btn-secondary" onClick={onClose}>Close discussion</button></div>
    <h2 id="discussion-title" tabIndex={-1} ref={heading}>{item?.title ?? "Discussion"}</h2>
    {error && <p className="notice error" role="alert">{error}</p>}
    {notice && <p className="notice success" role="status">{notice}</p>}
    <button type="button" className="btn-secondary" onClick={() => void load()} disabled={busy}>Refresh discussion</button>
    {!item ? <p>{error ? "Use Refresh discussion to try again." : "Loading discussion..."}</p> : <>
      <p className="lead">{item.author?.name ?? "Former administrator"} | {when(item.createdAt)} SAST | {feedbackCategoryLabels[item.category]}</p>
      <p className="feedback-text">{item.body}</p>
      <form className="grid" onSubmit={(event) => void mutate(event, "PATCH")}>
        <div className="field"><label htmlFor="discussion-status">Discussion status</label><select id="discussion-status" value={newStatus} onChange={(e) => setNewStatus(e.target.value as FeedbackStatus)} disabled={busy}>
          {feedbackStatuses.map((value) => <option key={value} value={value}>{feedbackStatusLabels[value]}</option>)}
        </select></div>
        <button type="submit" className="btn-secondary" disabled={busy || newStatus === item.status}>Save status</button>
      </form>
      <form className="grid" onSubmit={(event) => void mutate(event, "POST")}>
        <div className="field"><label htmlFor="discussion-reply">Add a reply</label><textarea id="discussion-reply" required maxLength={2000} rows={3} value={reply} onChange={(e) => setReply(e.target.value)} disabled={busy} /></div>
        <button type="submit" className="btn-primary" disabled={busy || !reply.trim()}>{busy ? "Please wait..." : "Post reply"}</button>
      </form>
      <h3>Discussion history</h3><p className="lead">Newest first. Replies and status changes are retained; add a reply to correct earlier information.</p>
      {entries.length === 0 && <p>No replies or status changes yet.</p>}
      <ol className="feedback-history">{entries.map((entry) => <li key={entry.id}>
        <p className="lead">{entry.author?.name ?? "Former administrator"} | {when(entry.createdAt)} SAST</p>
        {entry.toStatus ? <p>Status: {entry.fromStatus && feedbackStatusLabels[entry.fromStatus]} to <strong>{feedbackStatusLabels[entry.toStatus]}</strong></p> : <p className="feedback-text">{entry.body}</p>}
      </li>)}</ol>
      {hasMore && <button type="button" className="btn-secondary" disabled={busy} onClick={() => void load(true)}>Load older updates</button>}
    </>}
  </article>;
}
