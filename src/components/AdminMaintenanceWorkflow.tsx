"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { uploadDocument } from "@/lib/client-upload";

type AssetStatus = "ACTIVE" | "OUT_OF_SERVICE" | "RETIRED";
type MaintenanceStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED";
type MaintenancePriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

type Asset = {
  id: string;
  name: string;
  category: string;
  serialNumber?: string | null;
  location?: string | null;
  status: AssetStatus;
  purchaseDate?: string | null;
  warrantyExpiry?: string | null;
  warrantyFileUrl?: string | null;
  notes?: string | null;
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
  assignedToId?: string | null;
  asset?: Asset | null;
  assignedTo?: { id: string; name: string; email: string; role: string } | null;
  createdBy?: { id: string; name: string; email: string; role: string } | null;
  createdAt: string;
};

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
};

type PanelState = { type: "idle" | "success" | "error"; message?: string };

type AssetForm = {
  name: string;
  category: string;
  serialNumber: string;
  location: string;
  status: AssetStatus;
  purchaseDate: string;
  warrantyExpiry: string;
  warrantyFileUrl: string;
  notes: string;
};

type TaskForm = {
  assetId: string;
  title: string;
  description: string;
  priority: MaintenancePriority;
  dueDate: string;
  estimatedCost: string;
  assignedToId: string;
  invoiceFileUrl: string;
};

const defaultAssetForm: AssetForm = {
  name: "",
  category: "",
  serialNumber: "",
  location: "",
  status: "ACTIVE",
  purchaseDate: "",
  warrantyExpiry: "",
  warrantyFileUrl: "",
  notes: ""
};

const defaultTaskForm: TaskForm = {
  assetId: "",
  title: "",
  description: "",
  priority: "MEDIUM",
  dueDate: "",
  estimatedCost: "",
  assignedToId: "",
  invoiceFileUrl: ""
};

function buildAssetEdit(asset: Asset): AssetForm {
  return {
    name: asset.name,
    category: asset.category,
    serialNumber: asset.serialNumber ?? "",
    location: asset.location ?? "",
    status: asset.status,
    purchaseDate: dateInputValue(asset.purchaseDate),
    warrantyExpiry: dateInputValue(asset.warrantyExpiry),
    warrantyFileUrl: asset.warrantyFileUrl ?? "",
    notes: asset.notes ?? ""
  };
}

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

function dateInputValue(value?: string | null): string {
  return value ? value.slice(0, 10) : "";
}

function amountLabel(value?: string | number | null): string {
  if (value === null || value === undefined) {
    return "Not set";
  }
  return `ZAR ${Number(value).toFixed(2)}`;
}

export function AdminMaintenanceWorkflow() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [assetForm, setAssetForm] = useState<AssetForm>(defaultAssetForm);
  const [taskForm, setTaskForm] = useState<TaskForm>(defaultTaskForm);
  const [assetEdits, setAssetEdits] = useState<Record<string, AssetForm>>({});
  const [taskAssignments, setTaskAssignments] = useState<Record<string, string>>({});
  const [taskRejectReasons, setTaskRejectReasons] = useState<Record<string, string>>({});
  const [taskCompletionCost, setTaskCompletionCost] = useState<Record<string, string>>({});
  const [taskCompletionDocs, setTaskCompletionDocs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [state, setState] = useState<PanelState>({ type: "idle" });

  const pendingApproval = useMemo(
    () => tasks.filter((task) => task.status === "OPEN"),
    [tasks]
  );
  const inProgress = useMemo(
    () => tasks.filter((task) => task.status === "IN_PROGRESS"),
    [tasks]
  );
  const closed = useMemo(
    () => tasks.filter((task) => task.status === "DONE" || task.status === "CANCELLED"),
    [tasks]
  );

  const assignableUsers = useMemo(
    () => users.filter((user) => user.isActive && user.role !== "GUEST"),
    [users]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setState({ type: "idle" });
    try {
      const [assetsRes, tasksRes, usersRes] = await Promise.all([
        fetch("/api/assets", { cache: "no-store" }),
        fetch("/api/maintenance/tasks", { cache: "no-store" }),
        fetch("/api/users", { cache: "no-store" })
      ]);

      const assetsData = (await assetsRes.json()) as { assets?: Asset[]; error?: unknown };
      const tasksData = (await tasksRes.json()) as { tasks?: Task[]; error?: unknown };
      const usersData = (await usersRes.json()) as { users?: User[]; error?: unknown };

      if (!assetsRes.ok) {
        setState({ type: "error", message: errorMessage(assetsData, "Could not load assets.") });
        return;
      }
      if (!tasksRes.ok) {
        setState({ type: "error", message: errorMessage(tasksData, "Could not load maintenance tasks.") });
        return;
      }
      if (!usersRes.ok) {
        setState({ type: "error", message: errorMessage(usersData, "Could not load users.") });
        return;
      }

      const nextAssets = assetsData.assets ?? [];
      const nextTasks = tasksData.tasks ?? [];
      const nextUsers = usersData.users ?? [];

      setAssets(nextAssets);
      setTasks(nextTasks);
      setUsers(nextUsers);

      setAssetEdits((current) => {
        const next = { ...current };
        for (const asset of nextAssets) {
          if (!next[asset.id]) {
            next[asset.id] = buildAssetEdit(asset);
          }
        }
        return next;
      });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not load maintenance workflow." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function createAsset() {
    if (assetForm.name.trim().length < 2 || assetForm.category.trim().length < 2) {
      setState({ type: "error", message: "Asset name and category are required." });
      return;
    }

    setSaving(true);
    setState({ type: "idle" });
    try {
      const response = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: assetForm.name.trim(),
          category: assetForm.category.trim(),
          serialNumber: assetForm.serialNumber.trim() || undefined,
          location: assetForm.location.trim() || undefined,
          status: assetForm.status,
          purchaseDate: assetForm.purchaseDate || undefined,
          warrantyExpiry: assetForm.warrantyExpiry || undefined,
          warrantyFileUrl: assetForm.warrantyFileUrl.trim() || undefined,
          notes: assetForm.notes.trim() || undefined
        })
      });
      const data = (await response.json()) as { error?: unknown };
      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Could not create asset.") });
        return;
      }

      setAssetForm(defaultAssetForm);
      await loadData();
      setState({ type: "success", message: "Asset created." });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not create asset." });
    } finally {
      setSaving(false);
    }
  }

  async function saveAsset(assetId: string) {
    const edit = assetEdits[assetId];
    if (!edit) {
      return;
    }

    setProcessingId(assetId);
    setState({ type: "idle" });
    try {
      const response = await fetch("/api/assets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: assetId,
          name: edit.name.trim(),
          category: edit.category.trim(),
          serialNumber: edit.serialNumber.trim() || undefined,
          location: edit.location.trim() || undefined,
          status: edit.status,
          purchaseDate: edit.purchaseDate || undefined,
          warrantyExpiry: edit.warrantyExpiry || undefined,
          warrantyFileUrl: edit.warrantyFileUrl.trim() || undefined,
          notes: edit.notes.trim() || undefined
        })
      });
      const data = (await response.json()) as { error?: unknown };
      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Could not update asset.") });
        return;
      }

      await loadData();
      setState({ type: "success", message: "Asset updated." });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not update asset." });
    } finally {
      setProcessingId(null);
    }
  }

  async function uploadAssetWarranty(assetId: string, file: File) {
    setProcessingId(assetId);
    try {
      const uploaded = await uploadDocument(file);
      setAssetEdits((current) => ({
        ...current,
        [assetId]: {
          ...(current[assetId] ?? defaultAssetForm),
          warrantyFileUrl: uploaded.url
        }
      }));
      setState({ type: "success", message: `Uploaded ${uploaded.name}. Save asset to persist.` });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: error instanceof Error ? error.message : "Upload failed." });
    } finally {
      setProcessingId(null);
    }
  }

  async function createTask() {
    if (taskForm.title.trim().length < 3) {
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
          assetId: taskForm.assetId || undefined,
          title: taskForm.title.trim(),
          description: taskForm.description.trim() || undefined,
          priority: taskForm.priority,
          dueDate: taskForm.dueDate || undefined,
          estimatedCost: taskForm.estimatedCost ? Number(taskForm.estimatedCost) : undefined,
          assignedToId: taskForm.assignedToId || undefined,
          invoiceFileUrl: taskForm.invoiceFileUrl || undefined
        })
      });
      const data = (await response.json()) as { error?: unknown };
      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Could not create task.") });
        return;
      }

      setTaskForm(defaultTaskForm);
      await loadData();
      setState({ type: "success", message: "Task logged and queued for approval." });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not create task." });
    } finally {
      setSaving(false);
    }
  }

  async function approveTask(taskId: string) {
    setProcessingId(taskId);
    setState({ type: "idle" });
    try {
      const response = await fetch("/api/maintenance/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: taskId,
          status: "IN_PROGRESS",
          assignedToId: taskAssignments[taskId] || undefined
        })
      });
      const data = (await response.json()) as { error?: unknown };
      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Could not approve task.") });
        return;
      }
      await loadData();
      setState({ type: "success", message: "Task approved and moved to in progress." });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not approve task." });
    } finally {
      setProcessingId(null);
    }
  }

  async function rejectTask(task: Task) {
    const reason = (taskRejectReasons[task.id] ?? "").trim();
    if (reason.length < 3) {
      setState({ type: "error", message: "Rejection reason must be at least 3 characters." });
      return;
    }

    setProcessingId(task.id);
    setState({ type: "idle" });
    try {
      const response = await fetch("/api/maintenance/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: task.id,
          status: "CANCELLED",
          description: `${task.description ?? ""}\n\nAdmin rejection: ${reason}`.trim()
        })
      });
      const data = (await response.json()) as { error?: unknown };
      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Could not reject task.") });
        return;
      }
      await loadData();
      setState({ type: "success", message: "Task rejected." });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not reject task." });
    } finally {
      setProcessingId(null);
    }
  }

  async function completeTask(taskId: string) {
    setProcessingId(taskId);
    setState({ type: "idle" });
    try {
      const response = await fetch("/api/maintenance/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: taskId,
          status: "DONE",
          actualCost: taskCompletionCost[taskId] ? Number(taskCompletionCost[taskId]) : undefined,
          invoiceFileUrl: taskCompletionDocs[taskId] || undefined
        })
      });
      const data = (await response.json()) as { error?: unknown };
      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Could not complete task.") });
        return;
      }
      await loadData();
      setState({ type: "success", message: "Task marked complete." });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not complete task." });
    } finally {
      setProcessingId(null);
    }
  }

  async function uploadTaskDoc(taskId: string, file: File) {
    setProcessingId(taskId);
    try {
      const uploaded = await uploadDocument(file);
      setTaskCompletionDocs((current) => ({ ...current, [taskId]: uploaded.url }));
      setState({ type: "success", message: `Uploaded ${uploaded.name}. Complete task to persist.` });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: error instanceof Error ? error.message : "Upload failed." });
    } finally {
      setProcessingId(null);
    }
  }

  if (loading) {
    return <p className="lead">Loading assets and maintenance workflow...</p>;
  }

  return (
    <section className="grid">
      {state.type === "error" ? <p className="notice error">{state.message}</p> : null}
      {state.type === "success" ? <p className="notice success">{state.message}</p> : null}

      <article className="card grid">
        <h3>Register Asset</h3>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="asset-name">Name</label>
            <input id="asset-name" value={assetForm.name} onChange={(event) => setAssetForm((c) => ({ ...c, name: event.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="asset-category">Category</label>
            <input id="asset-category" value={assetForm.category} onChange={(event) => setAssetForm((c) => ({ ...c, category: event.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="asset-serial">Serial Number</label>
            <input id="asset-serial" value={assetForm.serialNumber} onChange={(event) => setAssetForm((c) => ({ ...c, serialNumber: event.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="asset-location">Location</label>
            <input id="asset-location" value={assetForm.location} onChange={(event) => setAssetForm((c) => ({ ...c, location: event.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="asset-status">Status</label>
            <select id="asset-status" value={assetForm.status} onChange={(event) => setAssetForm((c) => ({ ...c, status: event.target.value as AssetStatus }))}>
              <option value="ACTIVE">ACTIVE</option>
              <option value="OUT_OF_SERVICE">OUT_OF_SERVICE</option>
              <option value="RETIRED">RETIRED</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="asset-warranty-date">Warranty Expiry</label>
            <input id="asset-warranty-date" type="date" value={assetForm.warrantyExpiry} onChange={(event) => setAssetForm((c) => ({ ...c, warrantyExpiry: event.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="asset-purchase-date">Purchase Date</label>
            <input id="asset-purchase-date" type="date" value={assetForm.purchaseDate} onChange={(event) => setAssetForm((c) => ({ ...c, purchaseDate: event.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="asset-warranty-file">Warranty Document URL</label>
            <input id="asset-warranty-file" value={assetForm.warrantyFileUrl} onChange={(event) => setAssetForm((c) => ({ ...c, warrantyFileUrl: event.target.value }))} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="asset-notes">Notes</label>
          <textarea id="asset-notes" value={assetForm.notes} onChange={(event) => setAssetForm((c) => ({ ...c, notes: event.target.value }))} />
        </div>
        <button type="button" className="btn-primary" disabled={saving} onClick={() => void createAsset()}>
          {saving ? "Saving..." : "Create Asset"}
        </button>
      </article>

      <article className="card grid">
        <h3>Log Maintenance Task</h3>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="task-asset">Asset</label>
            <select id="task-asset" value={taskForm.assetId} onChange={(event) => setTaskForm((c) => ({ ...c, assetId: event.target.value }))}>
              <option value="">No specific asset</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name} ({asset.category})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="task-title">Title</label>
            <input id="task-title" value={taskForm.title} onChange={(event) => setTaskForm((c) => ({ ...c, title: event.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="task-priority">Priority</label>
            <select id="task-priority" value={taskForm.priority} onChange={(event) => setTaskForm((c) => ({ ...c, priority: event.target.value as MaintenancePriority }))}>
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
              <option value="URGENT">URGENT</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="task-due">Due Date</label>
            <input id="task-due" type="date" value={taskForm.dueDate} onChange={(event) => setTaskForm((c) => ({ ...c, dueDate: event.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="task-estimated">Estimated Cost</label>
            <input id="task-estimated" type="number" step="0.01" min="0" value={taskForm.estimatedCost} onChange={(event) => setTaskForm((c) => ({ ...c, estimatedCost: event.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="task-assigned">Assign To</label>
            <select id="task-assigned" value={taskForm.assignedToId} onChange={(event) => setTaskForm((c) => ({ ...c, assignedToId: event.target.value }))}>
              <option value="">Unassigned</option>
              {assignableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.role})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="task-doc-url">Supporting Document URL</label>
            <input id="task-doc-url" value={taskForm.invoiceFileUrl} onChange={(event) => setTaskForm((c) => ({ ...c, invoiceFileUrl: event.target.value }))} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="task-description">Description</label>
          <textarea id="task-description" value={taskForm.description} onChange={(event) => setTaskForm((c) => ({ ...c, description: event.target.value }))} />
        </div>
        <button type="button" className="btn-primary" disabled={saving} onClick={() => void createTask()}>
          {saving ? "Saving..." : "Create Task"}
        </button>
      </article>

      <article className="card grid">
        <h3>Pending Approval</h3>
        {pendingApproval.length === 0 ? (
          <p className="lead">No tasks waiting for approval.</p>
        ) : (
          pendingApproval.map((task) => {
            const isProcessing = processingId === task.id;
            return (
              <article key={task.id} className="decision-card">
                <div className="status-line">
                  <span className="status-pill status-pending_review">OPEN</span>
                  <span className="lead">{task.priority}</span>
                </div>
                <h4>{task.title}</h4>
                <p className="lead">{task.description ?? "No description"}</p>
                <p className="lead">
                  Asset: {task.asset?.name ?? "None"} | Due: {dateLabel(task.dueDate)}
                </p>
                <p className="lead">
                  Logged by: {task.createdBy?.name ?? "Unknown"} ({task.createdBy?.role ?? "Unknown"})
                </p>
                <div className="grid grid-2">
                  <div className="field">
                    <label>Assign To</label>
                    <select
                      value={taskAssignments[task.id] ?? task.assignedToId ?? ""}
                      onChange={(event) =>
                        setTaskAssignments((current) => ({
                          ...current,
                          [task.id]: event.target.value
                        }))
                      }
                    >
                      <option value="">Unassigned</option>
                      {assignableUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name} ({user.role})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Reject Reason</label>
                    <input
                      value={taskRejectReasons[task.id] ?? ""}
                      onChange={(event) =>
                        setTaskRejectReasons((current) => ({
                          ...current,
                          [task.id]: event.target.value
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="action-row">
                  <button type="button" className="btn-primary" disabled={isProcessing} onClick={() => void approveTask(task.id)}>
                    {isProcessing ? "Processing..." : "Approve Task"}
                  </button>
                  <button type="button" className="btn-secondary" disabled={isProcessing} onClick={() => void rejectTask(task)}>
                    {isProcessing ? "Processing..." : "Reject Task"}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </article>

      <article className="card grid">
        <h3>In Progress</h3>
        {inProgress.length === 0 ? (
          <p className="lead">No tasks in progress.</p>
        ) : (
          inProgress.map((task) => {
            const isProcessing = processingId === task.id;
            return (
              <article key={task.id} className="decision-card">
                <div className="status-line">
                  <span className="status-pill status-active">IN_PROGRESS</span>
                  <span className="lead">{task.assignedTo?.name ?? "Unassigned"}</span>
                </div>
                <h4>{task.title}</h4>
                <p className="lead">Estimated: {amountLabel(task.estimatedCost)} | Due: {dateLabel(task.dueDate)}</p>
                <div className="grid grid-2">
                  <div className="field">
                    <label>Actual Cost</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={taskCompletionCost[task.id] ?? ""}
                      onChange={(event) =>
                        setTaskCompletionCost((current) => ({
                          ...current,
                          [task.id]: event.target.value
                        }))
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Supporting Document URL</label>
                    <input
                      value={taskCompletionDocs[task.id] ?? task.invoiceFileUrl ?? ""}
                      onChange={(event) =>
                        setTaskCompletionDocs((current) => ({
                          ...current,
                          [task.id]: event.target.value
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="field">
                  <label>Upload Supporting Document</label>
                  <input
                    type="file"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void uploadTaskDoc(task.id, file);
                      }
                    }}
                  />
                </div>
                <div className="action-row">
                  <button type="button" className="btn-primary" disabled={isProcessing} onClick={() => void completeTask(task.id)}>
                    {isProcessing ? "Processing..." : "Mark Complete"}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </article>

      <article className="card grid">
        <h3>Assets Registry</h3>
        {assets.length === 0 ? (
          <p className="lead">No assets registered yet.</p>
        ) : (
          assets.map((asset) => {
            const edit = assetEdits[asset.id];
            const isProcessing = processingId === asset.id;
            return (
              <article key={asset.id} className="decision-card">
                <div className="status-line">
                  <strong>{asset.name}</strong>
                  <span className={`status-pill status-${asset.status.toLowerCase()}`}>{asset.status}</span>
                </div>
                <p className="lead">
                  Category: {asset.category} | Serial: {asset.serialNumber ?? "Not set"} | Location: {asset.location ?? "Not set"}
                </p>
                <div className="grid grid-2">
                  <div className="field">
                    <label>Warranty Expiry</label>
                    <input
                      type="date"
                      value={edit?.warrantyExpiry ?? ""}
                      onChange={(event) =>
                        setAssetEdits((current) => ({
                          ...current,
                          [asset.id]: { ...(current[asset.id] ?? buildAssetEdit(asset)), warrantyExpiry: event.target.value }
                        }))
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Status</label>
                    <select
                      value={edit?.status ?? asset.status}
                      onChange={(event) =>
                        setAssetEdits((current) => ({
                          ...current,
                          [asset.id]: { ...(current[asset.id] ?? buildAssetEdit(asset)), status: event.target.value as AssetStatus }
                        }))
                      }
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="OUT_OF_SERVICE">OUT_OF_SERVICE</option>
                      <option value="RETIRED">RETIRED</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>Warranty Document URL</label>
                  <input
                    value={edit?.warrantyFileUrl ?? asset.warrantyFileUrl ?? ""}
                    onChange={(event) =>
                      setAssetEdits((current) => ({
                        ...current,
                        [asset.id]: { ...(current[asset.id] ?? buildAssetEdit(asset)), warrantyFileUrl: event.target.value }
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label>Upload Warranty Document</label>
                  <input
                    type="file"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void uploadAssetWarranty(asset.id, file);
                      }
                    }}
                  />
                </div>
                <div className="action-row">
                  <button type="button" className="btn-primary" disabled={isProcessing} onClick={() => void saveAsset(asset.id)}>
                    {isProcessing ? "Saving..." : "Save Asset"}
                  </button>
                  {(edit?.warrantyFileUrl ?? asset.warrantyFileUrl) ? (
                    <a
                      className="btn-secondary inline-action"
                      href={edit?.warrantyFileUrl ?? asset.warrantyFileUrl ?? ""}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open Warranty Document
                    </a>
                  ) : null}
                </div>
              </article>
            );
          })
        )}
      </article>

      <article className="card grid">
        <h3>Completed / Rejected Tasks</h3>
        {closed.length === 0 ? (
          <p className="lead">No closed tasks yet.</p>
        ) : (
          closed.map((task) => (
            <article key={task.id} className="decision-card">
              <div className="status-line">
                <span className={`status-pill status-${task.status.toLowerCase()}`}>{task.status}</span>
                <span className="lead">{task.asset?.name ?? "No asset"}</span>
              </div>
              <h4>{task.title}</h4>
              <p className="lead">Actual cost: {amountLabel(task.actualCost)} | Due: {dateLabel(task.dueDate)}</p>
              {task.invoiceFileUrl ? (
                <p>
                  <a className="doc-link" href={task.invoiceFileUrl} target="_blank" rel="noreferrer">
                    Open task document
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
