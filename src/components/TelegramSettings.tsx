"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Group = { chatId: string; label: string; enabled: boolean };
type Status = { enabled: boolean; username: string; link?: { telegramUserId: string } | null; groups?: Group[]; linkedUsers?: number };

export function TelegramSettings({ admin = false }: { admin?: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [chatId, setChatId] = useState("");
  const [label, setLabel] = useState("");
  const endpoint = admin ? "/api/admin/telegram" : "/api/telegram/link";
  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load Telegram settings.");
    setStatus(data);
    if (data.link) setLink("");
  }, [endpoint]);
  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);
  async function act(method: "POST" | "DELETE", body?: Group) {
    setBusy(true); setMessage(""); setLink("");
    try {
      const response = await fetch(endpoint, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Request failed.");
      if (data.url) { setLink(data.url); setMessage("Open this link within 10 minutes, then press Start in Telegram. Do not share the link."); }
      else setMessage("Settings saved.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Request failed."); }
    finally { setBusy(false); }
  }
  function addGroup(event: FormEvent) { event.preventDefault(); void act("POST", { chatId: chatId.trim(), label: label.trim(), enabled: true }); }
  return (
    <article className="card grid">
      <span className="kicker">Telegram / No AI required</span>
      <h1>{admin ? "Telegram Administration" : "Connect Telegram"}</h1>
      <p className="lead">
        Check live room and whole-house availability. Pending bookings hold their dates.
        Booking requests still go through the website.
      </p>
      {status ? (
        <p className="notice">
          {status.enabled ? `Bot: @${status.username}` : "Not configured yet. An administrator must add the Telegram settings on the server."}
        </p>
      ) : <p>Loading settings...</p>}
      {admin ? (
        <>
          <p>{status?.linkedUsers ?? 0} linked accounts. Members connect from Member &gt; Telegram.</p>
          <Link href="/member/telegram">Connect your own Telegram account</Link>
          <p>
            Link your own account, add the bot to the group, then send /groupid@{status?.username || "your_bot"}.
            Approve that group ID below. Group commands open a private chat;
            no availability or personal records are posted to the group.
          </p>
          <form className="form" onSubmit={addGroup}>
            <div className="field">
              <label htmlFor="telegram-group-id">Telegram group ID</label>
              <input id="telegram-group-id" placeholder="-1001234567890" value={chatId}
                onChange={(event) => setChatId(event.target.value)} required pattern="-\d+" />
            </div>
            <div className="field">
              <label htmlFor="telegram-group-label">Group label</label>
              <input id="telegram-group-label" value={label}
                onChange={(event) => setLabel(event.target.value)} required maxLength={120} />
            </div>
            <button className="btn-primary" disabled={busy || !status?.enabled}>Approve Group</button>
          </form>
          {status?.groups?.length === 0 ? <p>No groups approved yet. Private linking works independently of groups.</p> : null}
          {status?.groups?.map((group) => (
            <div className="metric grid" key={group.chatId}>
              <strong>{group.label}</strong>
              <span>{group.chatId} / {group.enabled ? "Approved" : "Disabled"}</span>
              <button disabled={busy} onClick={() => void act("POST", { ...group, enabled: !group.enabled })}>
                {group.enabled ? "Disable" : "Enable"}
              </button>
            </div>
          ))}
        </>
      ) : (
        <>
          <p>Your Telegram identity must be linked to an active member or administrator account. Being in the family group alone does not grant access.</p>
          {status?.link ? (
            <>
              <p>Connected Telegram user: {status.link.telegramUserId}</p>
              <button disabled={busy} onClick={() => void act("DELETE")}>Disconnect Telegram</button>
            </>
          ) : (
            <button className="btn-primary" disabled={busy || !status?.enabled} onClick={() => void act("POST")}>Create Secure Linking Link</button>
          )}
          {link ? <a href={link} className="btn-primary inline-action" target="_blank" rel="noreferrer">Open Telegram To Connect</a> : null}
          <button disabled={busy} onClick={() => void load().catch((error: Error) => setMessage(error.message))}>Refresh Connection Status</button>
          <p>After linking, use /availability for guided room/date selection, /help for instructions, and /cancel to start over.</p>
        </>
      )}
      {message ? <p className="notice" role="status">{message}</p> : null}
    </article>
  );
}
