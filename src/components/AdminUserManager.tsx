"use client";

import type { UserRole } from "@prisma/client";
import { useEffect, useState } from "react";

type ManagedUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type Draft = {
  name: string;
  role: UserRole;
  isActive: boolean;
  password: string;
};

type PanelState = {
  type: "idle" | "error" | "success";
  message?: string;
};

function toDraft(user: ManagedUser): Draft {
  return {
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    password: ""
  };
}

export function AdminUserManager() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [state, setState] = useState<PanelState>({ type: "idle" });

  async function loadUsers() {
    setLoading(true);
    setState({ type: "idle" });
    try {
      const response = await fetch("/api/users", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        setState({
          type: "error",
          message: typeof data.error === "string" ? data.error : "Could not load users."
        });
        return;
      }

      const list = (data.users ?? []) as ManagedUser[];
      setUsers(list);
      setDrafts(
        Object.fromEntries(list.map((user) => [user.id, toDraft(user)]))
      );
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not load users." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  function updateDraft(userId: string, updates: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [userId]: {
        ...current[userId],
        ...updates
      }
    }));
  }

  async function saveUser(user: ManagedUser) {
    const draft = drafts[user.id];
    if (!draft) {
      return;
    }

    const payload: Record<string, unknown> = { userId: user.id };

    if (draft.name !== user.name) {
      payload.name = draft.name;
    }
    if (draft.role !== user.role) {
      payload.role = draft.role;
    }
    if (draft.isActive !== user.isActive) {
      payload.isActive = draft.isActive;
    }
    if (draft.password.trim().length > 0) {
      payload.password = draft.password.trim();
    }

    if (Object.keys(payload).length === 1) {
      setState({ type: "error", message: `No changes to save for ${user.email}.` });
      return;
    }

    setSavingUserId(user.id);
    setState({ type: "idle" });
    try {
      const response = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (!response.ok) {
        setState({
          type: "error",
          message: typeof data.error === "string" ? data.error : "Update failed."
        });
        return;
      }

      const updated = data.user as ManagedUser;
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setDrafts((current) => ({
        ...current,
        [updated.id]: toDraft(updated)
      }));
      setState({ type: "success", message: `Updated ${updated.email}.` });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Update failed." });
    } finally {
      setSavingUserId(null);
    }
  }

  if (loading) {
    return <p className="lead">Loading users...</p>;
  }

  return (
    <section className="grid">
      {state.type === "error" ? <p className="notice error">{state.message}</p> : null}
      {state.type === "success" ? <p className="notice success">{state.message}</p> : null}

      <div className="grid">
        {users.map((user) => {
          const draft = drafts[user.id] ?? toDraft(user);
          const isSaving = savingUserId === user.id;

          return (
            <article key={user.id} className="card grid">
              <div className="grid grid-2">
                <div className="field">
                  <label>Name</label>
                  <input
                    value={draft.name}
                    onChange={(event) => updateDraft(user.id, { name: event.target.value })}
                  />
                </div>

                <div className="field">
                  <label>Email</label>
                  <input value={user.email} readOnly />
                </div>

                <div className="field">
                  <label>Role</label>
                  <select
                    value={draft.role}
                    onChange={(event) => updateDraft(user.id, { role: event.target.value as UserRole })}
                  >
                    <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                    <option value="SHAREHOLDER">SHAREHOLDER</option>
                    <option value="FAMILY_MEMBER">FAMILY_MEMBER</option>
                    <option value="GUEST">GUEST</option>
                  </select>
                </div>

                <div className="field">
                  <label>Active</label>
                  <select
                    value={draft.isActive ? "yes" : "no"}
                    onChange={(event) => updateDraft(user.id, { isActive: event.target.value === "yes" })}
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
              </div>

              <div className="field">
                <label>Set New Password (optional)</label>
                <input
                  type="password"
                  value={draft.password}
                  placeholder="Leave blank to keep current password"
                  onChange={(event) => updateDraft(user.id, { password: event.target.value })}
                />
              </div>

              <button
                type="button"
                className="btn-primary"
                disabled={isSaving}
                onClick={() => void saveUser(user)}
              >
                {isSaving ? "Saving..." : "Save User Changes"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
