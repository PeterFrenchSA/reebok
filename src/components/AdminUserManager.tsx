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

type Invitation = {
  id: string;
  email: string;
  role: UserRole;
  status: "PENDING_REGISTRATION" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
  registrationName?: string | null;
  registrationRequestedAt?: string | null;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  expiresAt: string;
  acceptedAt?: string | null;
  createdAt: string;
};

type CreateUserForm = {
  email: string;
  name: string;
  role: UserRole;
  password: string;
  isActive: boolean;
};

type InviteForm = {
  email: string;
  role: "SHAREHOLDER" | "FAMILY_MEMBER" | "GUEST";
  expiresInDays: number;
};

function toDraft(user: ManagedUser): Draft {
  return {
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    password: ""
  };
}

function dateLabel(value?: string | null): string {
  if (!value) {
    return "N/A";
  }
  return value.slice(0, 10);
}

export function AdminUserManager() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [reviewingInvitationId, setReviewingInvitationId] = useState<string | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteRejectReasons, setInviteRejectReasons] = useState<Record<string, string>>({});
  const [createUserForm, setCreateUserForm] = useState<CreateUserForm>({
    email: "",
    name: "",
    role: "FAMILY_MEMBER",
    password: "",
    isActive: true
  });
  const [inviteForm, setInviteForm] = useState<InviteForm>({
    email: "",
    role: "FAMILY_MEMBER",
    expiresInDays: 14
  });
  const [state, setState] = useState<PanelState>({ type: "idle" });

  async function loadData() {
    setLoading(true);
    setState({ type: "idle" });
    try {
      const [usersResponse, invitationsResponse] = await Promise.all([
        fetch("/api/users", { cache: "no-store" }),
        fetch("/api/invitations", { cache: "no-store" })
      ]);
      const usersData = await usersResponse.json();
      const invitationsData = await invitationsResponse.json();

      if (!usersResponse.ok) {
        setState({
          type: "error",
          message: typeof usersData.error === "string" ? usersData.error : "Could not load users."
        });
        return;
      }
      if (!invitationsResponse.ok) {
        setState({
          type: "error",
          message:
            typeof invitationsData.error === "string"
              ? invitationsData.error
              : "Could not load invitations."
        });
        return;
      }

      const list = (usersData.users ?? []) as ManagedUser[];
      setUsers(list);
      setInvitations((invitationsData.invitations ?? []) as Invitation[]);
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
    void loadData();
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

  async function createUser() {
    setCreatingUser(true);
    setState({ type: "idle" });
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createUserForm)
      });
      const data = await response.json();

      if (!response.ok) {
        setState({
          type: "error",
          message: typeof data.error === "string" ? data.error : "Could not create user."
        });
        return;
      }

      const created = data.user as ManagedUser;
      setUsers((current) => [created, ...current]);
      setDrafts((current) => ({
        ...current,
        [created.id]: toDraft(created)
      }));
      setCreateUserForm({
        email: "",
        name: "",
        role: "FAMILY_MEMBER",
        password: "",
        isActive: true
      });
      setState({ type: "success", message: `Created ${created.email}.` });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not create user." });
    } finally {
      setCreatingUser(false);
    }
  }

  async function sendInvite() {
    setSendingInvite(true);
    setState({ type: "idle" });
    try {
      const response = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inviteForm)
      });
      const data = await response.json();
      if (!response.ok) {
        setState({
          type: "error",
          message: typeof data.error === "string" ? data.error : "Could not send invite."
        });
        return;
      }

      const invitation = data.invitation as Invitation;
      setInvitations((current) => [invitation, ...current]);
      setInviteForm({
        email: "",
        role: "FAMILY_MEMBER",
        expiresInDays: 14
      });
      setState({ type: "success", message: `Invite sent to ${invitation.email}.` });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not send invite." });
    } finally {
      setSendingInvite(false);
    }
  }

  async function reviewInvitation(invitation: Invitation, action: "approve" | "reject") {
    const reason = (inviteRejectReasons[invitation.id] ?? "").trim();
    if (action === "reject" && reason.length < 3) {
      setState({ type: "error", message: "Rejection reason must be at least 3 characters." });
      return;
    }

    setReviewingInvitationId(invitation.id);
    setState({ type: "idle" });
    try {
      const response = await fetch(`/api/invitations/${encodeURIComponent(invitation.id)}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason: action === "reject" ? reason : undefined
        })
      });
      const data = await response.json();
      if (!response.ok) {
        setState({
          type: "error",
          message: typeof data.error === "string" ? data.error : "Could not review invitation."
        });
        return;
      }

      const updatedInvitation = data.invitation as Invitation;
      setInvitations((current) =>
        current.map((item) => (item.id === updatedInvitation.id ? updatedInvitation : item))
      );
      if (data.user) {
        const created = data.user as ManagedUser;
        setUsers((current) => [created, ...current]);
        setDrafts((current) => ({
          ...current,
          [created.id]: toDraft(created)
        }));
      }
      setState({
        type: "success",
        message:
          action === "approve"
            ? `Approved invitation for ${updatedInvitation.email}.`
            : `Rejected invitation for ${updatedInvitation.email}.`
      });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not review invitation." });
    } finally {
      setReviewingInvitationId(null);
    }
  }

  if (loading) {
    return <p className="lead">Loading users and invitations...</p>;
  }

  const pendingApprovals = invitations.filter((invitation) => invitation.status === "PENDING_APPROVAL");

  return (
    <section className="grid">
      {state.type === "error" ? <p className="notice error">{state.message}</p> : null}
      {state.type === "success" ? <p className="notice success">{state.message}</p> : null}

      <article className="card grid">
        <h3>Create User Directly</h3>
        <div className="grid grid-2">
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={createUserForm.email}
              onChange={(event) =>
                setCreateUserForm((current) => ({ ...current, email: event.target.value }))
              }
            />
          </div>
          <div className="field">
            <label>Name</label>
            <input
              value={createUserForm.name}
              onChange={(event) =>
                setCreateUserForm((current) => ({ ...current, name: event.target.value }))
              }
            />
          </div>
          <div className="field">
            <label>Role</label>
            <select
              value={createUserForm.role}
              onChange={(event) =>
                setCreateUserForm((current) => ({ ...current, role: event.target.value as UserRole }))
              }
            >
              <option value="SHAREHOLDER">Administrator (SHAREHOLDER)</option>
              <option value="FAMILY_MEMBER">Member (FAMILY_MEMBER)</option>
              <option value="GUEST">Guest (GUEST)</option>
              <option value="SUPER_ADMIN">Super Admin (SUPER_ADMIN)</option>
            </select>
          </div>
          <div className="field">
            <label>Active</label>
            <select
              value={createUserForm.isActive ? "yes" : "no"}
              onChange={(event) =>
                setCreateUserForm((current) => ({ ...current, isActive: event.target.value === "yes" }))
              }
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>Temporary Password</label>
          <input
            type="password"
            value={createUserForm.password}
            onChange={(event) =>
              setCreateUserForm((current) => ({ ...current, password: event.target.value }))
            }
          />
        </div>
        <button
          type="button"
          className="btn-primary"
          disabled={creatingUser}
          onClick={() => void createUser()}
        >
          {creatingUser ? "Creating..." : "Create User"}
        </button>
      </article>

      <article className="card grid">
        <h3>Send Registration Invite</h3>
        <p className="lead">
          Invitees register themselves using the link sent by email. Registration stays pending until admin approval.
        </p>
        <div className="grid grid-2">
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={inviteForm.email}
              onChange={(event) =>
                setInviteForm((current) => ({ ...current, email: event.target.value }))
              }
            />
          </div>
          <div className="field">
            <label>Role</label>
            <select
              value={inviteForm.role}
              onChange={(event) =>
                setInviteForm((current) => ({
                  ...current,
                  role: event.target.value as InviteForm["role"]
                }))
              }
            >
              <option value="SHAREHOLDER">Administrator (SHAREHOLDER)</option>
              <option value="FAMILY_MEMBER">Member (FAMILY_MEMBER)</option>
              <option value="GUEST">Guest (GUEST)</option>
            </select>
          </div>
          <div className="field">
            <label>Expires in days</label>
            <input
              type="number"
              min={1}
              max={90}
              value={inviteForm.expiresInDays}
              onChange={(event) =>
                setInviteForm((current) => ({ ...current, expiresInDays: Number(event.target.value) }))
              }
            />
          </div>
        </div>
        <button
          type="button"
          className="btn-primary"
          disabled={sendingInvite}
          onClick={() => void sendInvite()}
        >
          {sendingInvite ? "Sending..." : "Send Invite Link"}
        </button>
      </article>

      <article className="card grid">
        <h3>Invite Registrations Awaiting Approval</h3>
        {pendingApprovals.length === 0 ? (
          <p className="lead">No pending invitation registrations.</p>
        ) : (
          pendingApprovals.map((invitation) => {
            const isProcessing = reviewingInvitationId === invitation.id;
            return (
              <article key={invitation.id} className="decision-card">
                <div className="status-line">
                  <span className={`status-pill status-${invitation.status.toLowerCase()}`}>
                    {invitation.status}
                  </span>
                  <span className="lead">Requested: {dateLabel(invitation.registrationRequestedAt)}</span>
                </div>
                <p className="lead">
                  {invitation.registrationName ?? "No name"} ({invitation.email}) - {invitation.role}
                </p>
                <p className="lead">Expires: {dateLabel(invitation.expiresAt)}</p>
                <div className="field">
                  <label>Reject reason</label>
                  <input
                    value={inviteRejectReasons[invitation.id] ?? ""}
                    onChange={(event) =>
                      setInviteRejectReasons((current) => ({
                        ...current,
                        [invitation.id]: event.target.value
                      }))
                    }
                  />
                </div>
                <div className="action-row">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={isProcessing}
                    onClick={() => void reviewInvitation(invitation, "approve")}
                  >
                    {isProcessing ? "Working..." : "Approve Registration"}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={isProcessing}
                    onClick={() => void reviewInvitation(invitation, "reject")}
                  >
                    {isProcessing ? "Working..." : "Reject Registration"}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </article>

      <article className="card grid">
        <h3>Invitation History</h3>
        <div className="table-list">
          {invitations.slice(0, 20).map((invitation) => (
            <div key={invitation.id} className="table-item">
              <p className="lead">
                {invitation.email} - {invitation.role}
              </p>
              <p className="lead">
                Status: {invitation.status} | Created: {dateLabel(invitation.createdAt)} | Expires:{" "}
                {dateLabel(invitation.expiresAt)}
              </p>
              {invitation.rejectionReason ? (
                <p className="notice error">Reason: {invitation.rejectionReason}</p>
              ) : null}
            </div>
          ))}
        </div>
      </article>

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
