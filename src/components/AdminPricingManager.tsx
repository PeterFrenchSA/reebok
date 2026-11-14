"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { memberCategories } from "@/lib/booking-options";

const priceFields = [
  ...memberCategories.map(({ rate, label }) => ({ key: rate, label: `${label} / person / night` })),
  { key: "externalAdultNightRate", label: "External adult / person / night" },
  { key: "externalChildNightRate", label: "External child under 6 / person / night" },
  { key: "externalWholeHouseMinRate", label: "External whole-house minimum / entire stay (0 = none)" },
  { key: "monthlyMemberSubscription", label: "Default monthly member subscription" }
];
type Season = { name: string; startMonth: number; startDay: number; endMonth: number; endDay: number; priority: number; externalAdultNightRate: number | string; externalChildNightRate: number | string; enabled: boolean };
type Config = { id: string; effectiveFrom: string; effectiveTo: string | null; isActive: boolean; currency: string; overdueReminderEnabled: boolean; seasonalRates: Season[] } & Record<string, unknown>;
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export function AdminPricingManager() {
  const [history, setHistory] = useState<Config[]>([]);
  const [current, setCurrent] = useState<Config | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [currency, setCurrency] = useState("ZAR");
  const [effective, setEffective] = useState(today);
  const [reminders, setReminders] = useState(true);
  const [basedOnId, setBasedOnId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  function draft(config: Config | null) {
    setValues(Object.fromEntries(priceFields.map(({ key }) => [key, config?.[key] == null ? (key === "externalWholeHouseMinRate" ? "0" : "") : String(config[key])])));
    setCurrency(config?.currency ?? "ZAR"); setReminders(config?.overdueReminderEnabled ?? true);
    setSeasons((config?.seasonalRates ?? []).map((s) => ({ name: s.name, startMonth: s.startMonth, startDay: s.startDay, endMonth: s.endMonth, endDay: s.endDay, priority: s.priority, externalAdultNightRate: s.externalAdultNightRate, externalChildNightRate: s.externalChildNightRate, enabled: s.enabled })));
  }
  const load = useCallback(async () => {
    const response = await fetch("/api/fees/config?history=true", { cache: "no-store" }); const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load pricing.");
    setCurrent(data.feeConfig); setHistory(data.history); setBasedOnId(data.history[0]?.id ?? null);
    draft(data.feeConfig ?? data.history[0] ?? null); setLoaded(true);
  }, []);
  useEffect(() => { void load().catch((e) => setMessage(e.message)); }, [load]);
  async function publish(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/fees/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        ...Object.fromEntries(priceFields.map(({ key }) => [key, Number(values[key])])), currency, effectiveFrom: effective,
        overdueReminderEnabled: reminders, basedOnId, seasonalRates: seasons.map((s) => ({ ...s, externalAdultNightRate: Number(s.externalAdultNightRate), externalChildNightRate: Number(s.externalChildNightRate) }))
      }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not publish pricing.");
      await load(); setMessage("New pricing version published. Existing booking totals and individual member subscriptions were not changed.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not publish pricing."); }
    finally { setBusy(false); }
  }
  return <section id="pricing-configuration" className="card grid"><h2>Accommodation tariffs</h2>
    <p className="lead">Member prices apply per person per night for both shared rooms and exclusive whole-house stays. Publishing creates a dated version, never rewrites old bookings.</p>
    {message && <p className="notice" role="status">{message}</p>}
    {loaded ? <>
      <p className="notice">{current ? `Current tariff: ${current.currency}, effective ${current.effectiveFrom.slice(0, 10)}.` : "No active tariff today. Bookings without a published tariff for check-in are blocked."} The latest applicable version at check-in governs the stay. External seasonal rates apply to each night individually; the highest priority wins.</p>
      <form className="grid" onSubmit={publish}><fieldset disabled={busy} className="booking-fieldset grid"><legend>Publish a pricing version</legend>
        <div className="grid grid-2"><div className="field"><label htmlFor="tariff-effective">Effective from (check-in date)</label><input id="tariff-effective" type="date" min={today()} required value={effective} onChange={(e) => setEffective(e.target.value)} /></div>
          <div className="field"><label htmlFor="tariff-currency">Currency code</label><input id="tariff-currency" pattern="[A-Za-z]{3}" maxLength={3} required value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} /></div></div>
        <div className="grid grid-2">{priceFields.map(({ key, label }) => <div className="field" key={key}><label htmlFor={`tariff-${key}`}>{label}</label><input id={`tariff-${key}`} type="number" min={0} max={1000000} step="0.01" required value={values[key] ?? ""} onChange={(e) => setValues({ ...values, [key]: e.target.value })} /></div>)}</div>
        <label className="check-line"><input type="checkbox" checked={reminders} onChange={(e) => setReminders(e.target.checked)} />Enable subscription reminder policy (SMTP and a scheduled job are still required)</label>
        <p className="lead">The subscription default does not alter existing monthly member amounts. Use Member Fee Tracking for individual subscriptions.</p>
        <h3>External seasonal rates</h3><p className="lead">Annual inclusive month/day ranges, including year-end ranges such as 1 December to 15 January. These do not change member rates.</p>
        {seasons.map((season, index) => <fieldset key={index} className="booking-fieldset grid"><legend>Season {index + 1}</legend>
          <div className="field"><label htmlFor={`season-name-${index}`}>Season name</label><input id={`season-name-${index}`} required minLength={2} maxLength={120} value={season.name} onChange={(e) => setSeasons(seasons.map((s, i) => i === index ? { ...s, name: e.target.value } : s))} /></div>
          <div className="grid grid-2">{([
            ["startMonth", "Start month", 1, 12], ["startDay", "Start day", 1, 31], ["endMonth", "End month", 1, 12], ["endDay", "End day", 1, 31],
            ["priority", "Priority (higher wins; unique per enabled season)", 0, 1000], ["externalAdultNightRate", "Adult / night", 0, 1000000], ["externalChildNightRate", "Child under 6 / night", 0, 1000000]
          ] as const).map(([key, label, min, max]) => <div className="field" key={key}><label htmlFor={`season-${index}-${key}`}>{label}</label><input id={`season-${index}-${key}`} type="number" min={min} max={max} step={key.includes("Rate") ? "0.01" : "1"} required value={season[key]} onChange={(e) => setSeasons(seasons.map((s, i) => i === index ? { ...s, [key]: key.includes("Rate") ? e.target.value : Number(e.target.value) } : s))} /></div>)}</div>
          <label className="check-line"><input type="checkbox" checked={season.enabled} onChange={(e) => setSeasons(seasons.map((s, i) => i === index ? { ...s, enabled: e.target.checked } : s))} />Enabled</label>
          <button type="button" className="btn-secondary" onClick={() => setSeasons(seasons.filter((_, i) => i !== index))}>Remove season from draft</button>
        </fieldset>)}
        <button type="button" className="btn-secondary" disabled={seasons.length >= 24} onClick={() => setSeasons([...seasons, { name: "", startMonth: 12, startDay: 1, endMonth: 1, endDay: 15, priority: Math.min(1000, Math.max(0, ...seasons.map((s) => s.priority)) + 1), externalAdultNightRate: "", externalChildNightRate: "", enabled: true }])}>Add seasonal rate</button>
        <button type="submit" className="btn-primary">{busy ? "Publishing..." : "Publish new pricing version"}</button>
        <button type="button" className="btn-secondary" onClick={() => void load().catch((e) => setMessage(e.message))}>Discard draft and reload current rates</button>
      </fieldset></form>
      <h3>Pricing versions</h3><p className="lead">Latest 50 versions. Saved booking estimates remain unchanged. Loading a version only fills your draft.</p>
      {history.map((config) => <details key={config.id} className="pricing-history"><summary>{config.effectiveFrom.slice(0, 10)} / {config.currency} / {config.isActive ? "Active version" : "Inactive"}{config.id === current?.id ? " / applies today" : ""}</summary>
        <dl className="pricing-values">{priceFields.map(({ key, label }) => <div key={key}><dt>{label}</dt><dd>{config.currency} {Number(config[key] ?? 0).toFixed(2)}</dd></div>)}</dl>
        <p className="lead">{config.seasonalRates.length} seasonal rates</p><button type="button" className="btn-secondary" disabled={busy} onClick={() => draft(config)}>Use this version as a draft</button></details>)}
    </> : <p>Loading pricing...</p>}
  </section>;
}
