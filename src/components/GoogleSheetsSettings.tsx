"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type SyncState = { spreadsheetId: string | null; enabled: boolean; version: number; leaseUntil: string | null; lastAttemptAt: string | null; lastSuccessAt: string | null; lastSchedulerAt: string | null; nextAttemptAt: string | null; lastError: string | null; failureCount: number; lastRowCounts: Record<string, number> | null };
type Settings = { state: SyncState; credentials: { email: string | null; configured: boolean }; tabs: string[] };
const date = (value: string | null) => value ? new Date(value).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" }) : "Not yet";
export function GoogleSheetsSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [spreadsheet, setSpreadsheet] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/google-sheets", { cache: "no-store" });
    const data = await response.json(); if (!response.ok) throw new Error(data.error);
    setSettings(data); setSpreadsheet(data.state.spreadsheetId ? `https://docs.google.com/spreadsheets/d/${data.state.spreadsheetId}/edit` : ""); setEnabled(data.state.enabled); setAcknowledged(false);
  }, []);
  useEffect(() => { void load().catch((e) => setError(e.message)); }, [load]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!settings || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/google-sheets", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spreadsheet, enabled, version: settings.state.version, acknowledgeSharing: acknowledged }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      await load(); setMessage("Settings saved. Run Sync now to verify Google access. Automatic runs require the scheduled job described below.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save settings."); }
    finally { setBusy(false); }
  }
  async function sync() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/google-sheets", { method: "POST" }); const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessage(data.synced ? "Workbook refreshed successfully. All managed tabs now reflect this snapshot." : data.skipped === "busy" ? "A sync is already running. Refresh status shortly." : "Sync is disabled. Save and enable the connection first.");
    } catch (e) { setError(e instanceof Error ? e.message : "Sync could not be confirmed. Refresh status before retrying."); }
    finally { await load().catch(() => {}); setBusy(false); }
  }
  const running = Boolean(settings?.state.leaseUntil && new Date(settings.state.leaseUntil).getTime() > Date.now());
  return <section className="grid">
    <header className="coastal-hero card grid"><span className="kicker">Connected records</span><h1>Google Sheets</h1><p className="lead">One workbook, a shared view of the house. The app remains the source of truth.</p></header>
    <p className="notice"><strong>Sharing matters.</strong> Anyone you give workbook access to can see all financial and booking tabs. Google Drive permissions are separate from app roles. Do not share this workbook with guests or members who should not see the finances.</p>
    {error && <p className="notice error" role="alert">{error}</p>}{message && <p className="notice success" role="status">{message}</p>}
    <div className="card grid"><h2>1. Prepare your personal Google Sheet</h2><ol className="guide-steps">
      <li>Create a new blank spreadsheet in your own Google account. You remain its owner and control sharing in Google Drive.</li>
      <li>Ask the operator to configure the Google service account in Coolify, enable the Sheets API, and add the five-minute scheduled job. No Gmail password is needed.</li>
      <li>Share the spreadsheet with the integration account below as <strong>Editor</strong>, then paste the sheet link here.</li>
    </ol>
      <p><strong>Integration account:</strong> {settings?.credentials.email ?? "Not configured yet"}</p>
      <p className={settings?.credentials.configured ? "notice success" : "notice"}>{settings?.credentials.configured ? "Server credentials are present. Sync now will verify access." : "Server credentials are not configured. You can save the sheet link with sync disabled."}</p>
    </div>
    {settings && <>
      <form className="card grid" onSubmit={save}><h2>2. Link the workbook</h2><fieldset className="booking-fieldset grid" disabled={busy || running}>
        <div className="field"><label htmlFor="sheets-link">Google spreadsheet link or ID</label><input id="sheets-link" type="text" maxLength={2000} required placeholder="https://docs.google.com/spreadsheets/d/.../edit" value={spreadsheet} onChange={(e) => setSpreadsheet(e.target.value)} /></div>
        <label className="check-line"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />Enable reporting sync</label>
        <label className="check-line"><input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} required={enabled} />I understand that everyone with workbook access can see its financial data, and edits in the managed report tabs will be replaced.</label>
        <p className="lead">Managed tabs: {settings.tabs.join(", ")}. Other tabs are left alone. Existing unmarked tabs with these names are never overwritten.</p>
        <button className="btn-primary">Save connection settings</button>
      </fieldset></form>
      <section className="card grid"><h2>3. Sync and monitor</h2><div className="metric-grid">
        <div className="metric"><strong>{running || busy ? "Working" : settings.state.enabled ? "Enabled" : "Disabled"}</strong><span>Connection</span></div>
        <div className="metric"><strong>{date(settings.state.lastSuccessAt)}</strong><span>Last verified success (South Africa)</span></div>
        <div className="metric"><strong>{date(settings.state.lastSchedulerAt)}</strong><span>Last scheduler check-in</span></div>
      </div>
        {(!settings.state.lastSchedulerAt || Date.now() - Date.parse(settings.state.lastSchedulerAt) > 15 * 60000) && <p className="notice">The scheduled job has not checked in recently. Automatic sync is not verified; ask the operator to configure or check it. Sync now still works when credentials and sharing are ready.</p>}
        {settings.state.lastError && <p className="notice error">{settings.state.lastError} Failures: {settings.state.failureCount}. Next scheduled attempt no earlier than {date(settings.state.nextAttemptAt)}.</p>}
        <p className="lead">Last attempt: {date(settings.state.lastAttemptAt)}. Failed runs retry on later scheduler checks, with increasing delays up to one hour. App bookings continue normally if Google is unavailable.</p>
        {settings.state.lastRowCounts && <p className="lead">Last successful report: {Object.entries(settings.state.lastRowCounts).map(([key, count]) => `${key}: ${count}`).join(" / ")}</p>}
        <div className="action-row"><button className="btn-primary" type="button" disabled={busy || running || !settings.state.enabled} onClick={() => void sync()}>Sync now</button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => void load().catch((e) => setError(e.message))}>Refresh status</button>
          {settings.state.spreadsheetId && <a className="btn-secondary inline-action" href={`https://docs.google.com/spreadsheets/d/${settings.state.spreadsheetId}/edit`} target="_blank" rel="noreferrer">Open workbook</a>}</div>
        <p className="lead">All history is included. Booking estimates are not payments, and recorded arrears are not automatically reconciled against your bank. Private contact details, booking links, internal notes and uploaded documents are excluded.</p>
      </section>
    </>}
    {!settings && <button className="btn-secondary" type="button" onClick={() => void load().catch((e) => setError(e.message))}>Reload connection settings</button>}
  </section>;
}
