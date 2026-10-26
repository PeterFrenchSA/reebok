"use client";

import { useState } from "react";
import { guideReviewDate, guideSections } from "@/lib/user-guide";

export function AdminUserGuide() {
  const [query, setQuery] = useState("");
  const search = query.trim().toLowerCase();
  const sections = guideSections.filter((section) => [section.title, section.audience, section.intro, ...section.steps, section.caution ?? ""].join(" ").toLowerCase().includes(search));
  return <section className="grid user-guide">
    <header className="card grid guide-hero">
      <span className="kicker">House handbook</span><h1>User Guide</h1>
      <p>How the house manager works, who can do what, and where human review still matters.</p>
      <p className="guide-meta">Reviewed against this release: {guideReviewDate}. Guide access is admin-only; the one-page overview is safe to share with family.</p>
      <div className="action-row"><a href="/docs/reebok-family-overview.pdf" download className="btn-secondary inline-action">Download family overview (PDF)</a></div>
    </header>
    <aside className="notice"><strong>Read this first.</strong> The website currently uses the public whole-house booking form. Member room booking needs admin assistance. Email and Telegram require separate setup; their live configuration is not confirmed by this guide.</aside>
    <section className="card grid guide-index" aria-label="Find a guide topic">
      <div className="field"><label htmlFor="guide-search">Find a topic</label><input id="guide-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try pets, fees, voting or invitations" /></div>
      <p role="status" className="lead">{sections.length} topic{sections.length === 1 ? "" : "s"}{search ? " matching your search" : " in this guide"}.</p>
      <nav className="guide-toc" aria-label="User guide contents">{sections.map((section) => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}</nav>
      {sections.length === 0 && <button type="button" className="btn-secondary" onClick={() => setQuery("")}>Clear search</button>}
    </section>
    {sections.map((section, index) => <article key={section.id} id={section.id} className="card grid guide-section" aria-labelledby={`guide-${section.id}`}>
      <span className="kicker">{String(index + 1).padStart(2, "0")} / {section.audience}</span>
      <h2 id={`guide-${section.id}`}>{section.title}</h2><p className="lead">{section.intro}</p>
      <ol className="guide-steps">{section.steps.map((step) => <li key={step}>{step}</li>)}</ol>
      {section.caution && <p className="notice"><strong>Keep in mind: </strong>{section.caution}</p>}
      <a className="guide-back" href="#guide-search">Back to topics</a>
    </article>)}
  </section>;
}
