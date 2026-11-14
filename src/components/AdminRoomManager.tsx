"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { RoomOption } from "@/lib/booking-options";
import { houseRooms } from "@/lib/room-catalog";

const blank = { name: "", code: "", capacity: 2, notes: "", isBookable: true };
export function AdminRoomManager() {
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState<{ id?: string; name: string; code: string; capacity: number; notes: string; isBookable: boolean }>(blank);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/rooms", { cache: "no-store" }); const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load rooms.");
    setRooms(data.rooms); setLoaded(true);
  }, []);
  useEffect(() => { void load().catch((e) => setMessage(e.message)); }, [load]);
  async function save(event?: FormEvent, initialize = false) {
    event?.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(initialize ? { action: "initialize-house" } : form) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Room save failed.");
      setForm(blank); await load(); setMessage(initialize ? "Seven rooms installed. Review the descriptions and capacities below." : "Room saved. Existing reservations were checked.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Room save failed."); }
    finally { setBusy(false); }
  }
  return <section id="room-configuration" className="card grid"><h2>Room inventory</h2>
    <p className="lead">Capacity counts everyone, including children. Changes that invalidate active reservations are blocked. Room 5 is capped at two until the extra bed is confirmed.</p>
    {message && <p role="status" className="notice">{message}</p>}
    {!loaded && <p>Loading rooms...</p>}
    {loaded && !rooms.length && <div className="notice grid"><h3>Set up the seven house rooms</h3><ul className="list">{houseRooms.map((room) => <li key={room.code}>{room.name}: sleeps {room.capacity}. {room.notes}</li>)}</ul>
      <button type="button" className="btn-primary" disabled={busy} onClick={() => void save(undefined, true)}>Install the seven confirmed rooms</button><p>This only works with an empty inventory. It does not replace old rooms or change bookings.</p></div>}
    <div className="room-options">{rooms.map((room) => <article key={room.id} className="room-option grid"><h3>{room.name}</h3><p>{room.notes}</p><p className="lead">{room.code} | Sleeps {room.capacity} | {room.isBookable ? "Bookable" : "Not bookable"}</p>
      <button type="button" className="btn-secondary" disabled={busy} onClick={() => setForm({ id: room.id, name: room.name, code: room.code ?? "", capacity: room.capacity, notes: room.notes ?? "", isBookable: room.isBookable !== false })}>Edit {room.name}</button></article>)}</div>
    <form className="grid" onSubmit={(event) => void save(event)}><fieldset className="booking-fieldset grid" disabled={busy}><legend>{form.id ? "Edit room" : "Add a room manually"}</legend>
      <div className="grid grid-2"><div className="field"><label htmlFor="room-name">Room name</label><input id="room-name" required minLength={2} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="field"><label htmlFor="room-code">Unique room code</label><input id="room-code" required minLength={2} maxLength={40} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
        <div className="field"><label htmlFor="room-capacity">Maximum guests</label><input id="room-capacity" type="number" required min={1} max={50} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} /></div>
        <label className="check-line"><input type="checkbox" checked={form.isBookable} onChange={(e) => setForm({ ...form, isBookable: e.target.checked })} />Available to book</label></div>
      <div className="field"><label htmlFor="room-description">Bedding / description (visible to members)</label><textarea id="room-description" maxLength={1000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      <div className="action-row"><button className="btn-primary">Save room</button><button type="button" className="btn-secondary" onClick={() => setForm(blank)}>Clear / new room</button></div>
    </fieldset></form>
  </section>;
}
