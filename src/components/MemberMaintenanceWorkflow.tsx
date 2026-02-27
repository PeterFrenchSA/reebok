"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { uploadDocument } from "@/lib/client-upload";

type MaintenancePriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type MaintenanceStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED";

type Asset = {
  id: string;
  name: string;
  category: string;
  location?: string | null;
  status: "ACTIVE" | "OUT_OF_SERVICE" | "RETIRED";
  warrantyExpiry?: string | null;
  warrantyFileUrl?: string | null;
};

type Task = {
  id: string;
  assetId?: string | null;
  title: string;
  description?: string | null;
  status: MaintenanceStatus;
  priority: MaintenancePriority;
  dueDate?: string | null;
  estimatedCost?: string | number | null;
  actualCost?: string | number | null;
  invoiceFileUrl?: string | null;
  asset?: Asset | null;
  createdBy?: { id: string; name: string; email: string; role: string } | null;
  createdAt: string;
};

type PanelState = { type: "idle" | "success" | "error"; message?: string };

const defaultForm = {
  assetId: "",
  title: "",
  description: "",
  priority: "MEDIUM" as MaintenancePriority,
  dueDate: "",
  estimatedCost: "",
  invoiceFileUrl: ""
};

function errorMessage(data: unknown, fallback: string): string {
  if (typeof data === "object" && data !== null && "error" in data) {
    const err = (data as { error?: unknown }).error;
    if (typeof err === "string") {
      return err;
    }
  }
  return fallback;
}

function dateLabel(value?: string | null): string {
  return value ? value.slice(0, 10) : "Not set";
}

function amountLabel(value?: string | number | null): string {
  if (value === null || value === undefined) {
    return "Not set";
  }
  return `ZAR ${Number(value).toFixed(2)}`;
}

export function MemberMaintenanceWorkflow() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [state, setState] = useState<PanelState>({ type: "idle" });

  const myTasks = useMemo(
    () => tasks.filter((task) => task.createdBy?.id === currentUserId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [tasks, currentUserId]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setState({ type: "idle" });
    try {
      const [assetsRes, tasksRes] = await Promise.all([
        fetch("/api/assets", { cache: "no-store" }),
        fetch("/api/maintenance/tasks", { cache: "no-store" })
      ]);

      const assetsData = (await assetsRes.json()) as { assets?: Asset[]; error?: unknown };
      const tasksData = (await tasksRes.json()) as {
        tasks?: Task[];
        currentUser?: { id: string };
        error?: unknown;
      };

      if (!assetsRes.ok) {
        setState({ type: "error", message: errorMessage(assetsData, "Could not load assets.") });
        return;
      }
      if (!tasksRes.ok) {
        setState({ type: "error", message: errorMessage(tasksData, "Could not load tasks.") });
        return;
      }

      setAssets(assetsData.assets ?? []);
      setTasks(tasksData.tasks ?? []);
      setCurrentUserId(tasksData.currentUser?.id ?? "");
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not load maintenance data." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function createTask() {
    if (form.title.trim().length < 3) {
      setState({ type: "error", message: "Task title must be at least 3 characters." });
      return;
    }

    setSaving(true);
    setState({ type: "idle" });
    try {
      const response = await fetch("/api/maintenance/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: form.assetId || undefined,
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          priority: form.priority,
          dueDate: form.dueDate || undefined,
          estimatedCost: form.estimatedCost ? Number(form.estimatedCost) : undefined,
          invoiceFileUrl: form.invoiceFileUrl || undefined
        })
      });
      const data = (await response.json()) as { error?: unknown };
      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Could not create task.") });
        return;
      }

      setForm(defaultForm);
      await loadData();
      setState({ type: "success", message: "Task submitted for admin approval." });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not create task." });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setState({ type: "idle" });
    try {
      const uploaded = await uploadDocument(file);
      setForm((current) => ({ ...current, invoiceFileUrl: uploaded.url }));
      setState({ type: "success", message: `Uploaded ${uploaded.name}.` });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: error instanceof Error ? error.message : "Upload failed." });
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return <p className="lead">Loading maintenance workflow...</p>;
  }

  return (
    <section className="grid">
      {state.type === "error" ? <p className="notice error">{state.message}</p> : null}
      {state.type === "success" ? <p className="notice success">{state.message}</p> : null}

      <article className="card grid">
        <h3>Report Maintenance Task</h3>
        <p className="lead">Tasks you submit go to admin approval, then move to in-progress/completed workflow.</p>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="member-task-asset">Asset</label>
            <select id="member-task-asset" value={form.assetId} onChange={(event) => setForm((c) => ({ ...c, assetId: event.target.value }))}>
              <option value="">General task</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name} ({asset.category})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="member-task-title">Title</label>
            <input id="member-task-title" value={form.title} onChange={(event) => setForm((c) => ({ ...c, title: event.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="member-task-priority">Priority</label>
            <select id="member-task-priority" value={form.priority} onChange={(event) => setForm((c) => ({ ...c, priority: event.target.value as MaintenancePriority }))}>
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
              <option value="URGENT">URGENT</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="member-task-due">Due Date</label>
            <input id="member-task-due" type="date" value={form.dueDate} onChange={(event) => setForm((c) => ({ ...c, dueDate: event.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="member-task-estimate">Estimated Cost</label>
            <input id="member-task-estimate" type="number" step="0.01" min="0" value={form.estimatedCost} onChange={(event) => setForm((c) => ({ ...c, estimatedCost: event.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="member-task-doc">Supporting Document URL</label>
            <input id="member-task-doc" value={form.invoiceFileUrl} onChange={(event) => setForm((c) => ({ ...c, invoiceFileUrl: event.target.value }))} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="member-task-description">Description</label>
          <textarea id="member-task-description" value={form.description} onChange={(event) => setForm((c) => ({ ...c, description: event.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="member-task-upload">Upload Supporting Document</label>
          <input
            id="member-task-upload"
            type="file"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleUpload(file);
              }
            }}
          />
        </div>
        <button type="button" className="btn-primary" disabled={saving || uploading} onClick={() => void createTask()}>
          {saving ? "Submitting..." : uploading ? "Uploading..." : "Submit Task"}
        </button>
      </article>

      <article className="card grid">
        <h3>My Maintenance Tasks</h3>
        {myTasks.length === 0 ? (
          <p className="lead">No tasks submitted from your account yet.</p>
        ) : (
          myTasks.map((task) => (
            <article key={task.id} className="decision-card">
              <div className="status-line">
                <span className={`status-pill status-${task.status.toLowerCase()}`}>{task.status}</span>
                <span className="lead">Logged: {dateLabel(task.createdAt)}</span>
              </div>
              <h4>{task.title}</h4>
              <p className="lead">{task.description ?? "No description"}</p>
              <p className="lead">
                Asset: {task.asset?.name ?? "General"} | Priority: {task.priority} | Due: {dateLabel(task.dueDate)}
              </p>
              <p className="lead">
                Estimated: {amountLabel(task.estimatedCost)} | Actual: {amountLabel(task.actualCost)}
              </p>
              {task.invoiceFileUrl ? (
                <p>
                  <a className="doc-link" href={task.invoiceFileUrl} target="_blank" rel="noreferrer">
                    Open supporting document
                  </a>
                </p>
              ) : null}
            </article>
          ))
        )}
      </article>

      <article className="card grid">
        <h3>Assets Registry</h3>
        {assets.length === 0 ? (
          <p className="lead">No assets registered yet.</p>
        ) : (
          assets.map((asset) => (
            <article key={asset.id} className="decision-card">
              <div className="status-line">
                <strong>{asset.name}</strong>
                <span className={`status-pill status-${asset.status.toLowerCase()}`}>{asset.status}</span>
              </div>
              <p className="lead">
                Category: {asset.category} | Location: {asset.location ?? "Not set"}
              </p>
              <p className="lead">Warranty expiry: {dateLabel(asset.warrantyExpiry)}</p>
              {asset.warrantyFileUrl ? (
                <p>
                  <a className="doc-link" href={asset.warrantyFileUrl} target="_blank" rel="noreferrer">
                    Open warranty document
                  </a>
                </p>
              ) : null}
            </article>
          ))
        )}
      </article>
    </section>
  );
}
