"use client";

import { FormEvent, useEffect, useId, useState } from "react";
import {
  SiteButton,
  SiteField,
  SiteInput,
  SitePageHeader,
  SiteSection,
  SiteSelect,
  SiteSpinner,
} from "@/components/progress/primitives";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { listProjects } from "@/lib/services/projects";
import {
  createInvitation,
  listWorkspaceInvitations,
  revokeInvitation,
  revokeMemberAccess,
  type PendingInvitationSummary,
  type WorkspaceMemberSummary,
} from "@/lib/services/invites";
import {
  COLLEAGUE_PERMISSION_KEYS,
  COLLEAGUE_PERMISSION_LABELS,
  permissionsForPreset,
} from "@/lib/permissions";
import type {
  ColleaguePermissions,
  ColleaguePreset,
  InviteType,
  Project,
} from "@/lib/types";
import { getProjectDisplayTitle } from "@/lib/utils";

type FormState = {
  inviteType: InviteType;
  inviteeDisplayName: string;
  inviteeEmail: string;
  projectId: string;
  colleaguePreset: ColleaguePreset;
  permissions: ColleaguePermissions;
};

type CopyPanel = {
  inviteUrl: string;
  email: string;
  displayName: string;
  inviteType: InviteType;
  projectTitle: string;
};

function emptyForm(): FormState {
  return {
    inviteType: "CLIENT",
    inviteeDisplayName: "",
    inviteeEmail: "",
    projectId: "",
    colleaguePreset: "VIEW_ONLY",
    permissions: permissionsForPreset("VIEW_ONLY"),
  };
}

export default function ProjectAccessPage() {
  const { profile } = useAuth();
  const { workspaceId } = useWorkspace();
  const formKey = useId();
  const [formInstance, setFormInstance] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<WorkspaceMemberSummary[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<
    PendingInvitationSummary[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [copyPanel, setCopyPanel] = useState<CopyPanel | null>(null);
  const [copied, setCopied] = useState(false);

  const ws = workspaceId || profile?.defaultWorkspaceId || profile?.companyId || "";

  async function reload(tenant: string) {
    const [projectList, invites] = await Promise.all([
      listProjects({ workspaceId: tenant }),
      listWorkspaceInvitations(tenant),
    ]);
    setProjects(projectList);
    setMembers(invites.members);
    setPendingInvitations(invites.pendingInvitations);
  }

  useEffect(() => {
    if (profile?.role !== "admin" || !ws) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async access reload
    setLoading(true);
    void reload(ws).finally(() => setLoading(false));
  }, [profile, ws]);

  if (profile?.role !== "admin") {
    return (
      <p style={{ color: "var(--site-text-secondary)" }}>
        Only administrators can manage project access.
      </p>
    );
  }

  if (loading) return <SiteSpinner />;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onPresetChange(preset: ColleaguePreset) {
    setForm((prev) => ({
      ...prev,
      colleaguePreset: preset,
      permissions: permissionsForPreset(preset),
    }));
  }

  function togglePermission(key: keyof ColleaguePermissions) {
    setForm((prev) => ({
      ...prev,
      permissions: { ...prev.permissions, [key]: !prev.permissions[key] },
    }));
  }

  function resetForm() {
    setForm(emptyForm());
    setFormInstance((n) => n + 1);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!ws) {
      setError("Workspace is not ready yet. Refresh the page and try again.");
      return;
    }
    if (!form.projectId) {
      setError("Select a project before sending an invitation.");
      return;
    }
    if (!form.inviteeDisplayName.trim() || !form.inviteeEmail.trim()) {
      setError("Enter a display name and email.");
      return;
    }
    setBusy(true);
    try {
      const result = await createInvitation({
        workspaceId: ws,
        projectId: form.projectId,
        inviteType: form.inviteType,
        email: form.inviteeEmail,
        displayName: form.inviteeDisplayName,
        colleaguePreset: form.inviteType === "COLLEAGUE" ? form.colleaguePreset : undefined,
        permissions:
          form.inviteType === "COLLEAGUE" && form.colleaguePreset === "CUSTOM"
            ? form.permissions
            : undefined,
      });
      const projectTitle =
        getProjectDisplayTitle(projects.find((p) => p.id === form.projectId)) ||
        "Project";
      setCopyPanel({
        inviteUrl: result.inviteUrl,
        email: result.email,
        displayName: result.displayName || form.inviteeDisplayName.trim(),
        inviteType: result.inviteType,
        projectTitle,
      });
      setCopied(false);
      resetForm();
      await reload(ws);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We could not send the invitation. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onRevokeInvitation(invite: PendingInvitationSummary) {
    if (!ws) return;
    if (!confirm(`Revoke the invitation to ${invite.email}?`)) return;
    setRowBusyId(invite.id);
    try {
      await revokeInvitation({
        workspaceId: ws,
        projectId: invite.projectId,
        invitationId: invite.id,
      });
      await reload(ws);
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "We could not revoke this invitation.",
      );
    } finally {
      setRowBusyId(null);
    }
  }

  async function onRevokeMember(member: WorkspaceMemberSummary) {
    if (!ws) return;
    if (!confirm(`Revoke access for ${member.displayName || member.email}?`)) return;
    setRowBusyId(member.uid + member.projectId);
    try {
      await revokeMemberAccess({
        workspaceId: ws,
        projectId: member.projectId,
        uid: member.uid,
      });
      await reload(ws);
    } catch (err) {
      alert(err instanceof Error ? err.message : "We could not revoke this access.");
    } finally {
      setRowBusyId(null);
    }
  }

  const clients = members.filter((m) => m.memberType === "CLIENT");
  const colleagues = members.filter(
    (m) => m.memberType === "COLLEAGUE" || m.memberType === "COMPANY_MEMBER",
  );

  return (
    <div>
      <SitePageHeader
        kicker="ACCESS CONTROL"
        title="Project Access"
        description="Invite clients or colleagues, assign them to a project, and control their access."
      />

      {!projects.length ? (
        <section className="site-section" style={{ maxWidth: 560 }}>
          <h2 className="site-section-title">Create a project first</h2>
          <p className="site-section-desc">
            Invitations must be attached to a project.
          </p>
          <SiteButton href="/projects/new" variant="accent">
            Create project
          </SiteButton>
        </section>
      ) : (
        <form
          key={`${formKey}-${formInstance}`}
          autoComplete="off"
          onSubmit={onSubmit}
          style={{
            display: "grid",
            gap: 14,
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            maxWidth: 720,
            marginBottom: 40,
          }}
        >
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10 }}>
            <button
              type="button"
              className="site-choice"
              data-active={form.inviteType === "CLIENT"}
              onClick={() => set("inviteType", "CLIENT")}
              style={{ flex: 1 }}
            >
              <div>
                <strong>Client</strong>
                <span>Invite a homeowner to follow their project.</span>
              </div>
            </button>
            <button
              type="button"
              className="site-choice"
              data-active={form.inviteType === "COLLEAGUE"}
              onClick={() => set("inviteType", "COLLEAGUE")}
              style={{ flex: 1 }}
            >
              <div>
                <strong>Colleague</strong>
                <span>Invite a teammate with configurable permissions.</span>
              </div>
            </button>
          </div>

          <SiteField label="Display name">
            <SiteInput
              name="inviteeDisplayName"
              autoComplete="off"
              value={form.inviteeDisplayName}
              onChange={(e) => set("inviteeDisplayName", e.target.value)}
              required
            />
          </SiteField>
          <SiteField label="Email">
            <SiteInput
              type="email"
              name="inviteeEmail"
              autoComplete="off"
              value={form.inviteeEmail}
              onChange={(e) => set("inviteeEmail", e.target.value)}
              required
            />
          </SiteField>

          <div style={{ gridColumn: "1 / -1" }}>
            <SiteField label="Assign to project *">
              <SiteSelect
                name="projectId"
                autoComplete="off"
                value={form.projectId}
                onChange={(e) => set("projectId", e.target.value)}
                required
              >
                <option value="" disabled>
                  Select a project
                </option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {getProjectDisplayTitle(p)}
                  </option>
                ))}
              </SiteSelect>
            </SiteField>
          </div>

          {form.inviteType === "COLLEAGUE" ? (
            <div style={{ gridColumn: "1 / -1" }}>
              <SiteField label="Access level">
                <SiteSelect
                  name="colleaguePreset"
                  autoComplete="off"
                  value={form.colleaguePreset}
                  onChange={(e) => onPresetChange(e.target.value as ColleaguePreset)}
                >
                  <option value="VIEW_ONLY">View only</option>
                  <option value="UPDATE_PROGRESS">Update progress</option>
                  <option value="EDITOR">Editor</option>
                  <option value="CUSTOM">Custom</option>
                </SiteSelect>
              </SiteField>

              {form.colleaguePreset === "CUSTOM" ? (
                <div className="site-stage-check-grid" style={{ marginTop: 12 }}>
                  {COLLEAGUE_PERMISSION_KEYS.map((key) => (
                    <label key={key} className="site-stage-check">
                      <input
                        type="checkbox"
                        checked={form.permissions[key]}
                        onChange={() => togglePermission(key)}
                      />
                      <span>{COLLEAGUE_PERMISSION_LABELS[key]}</span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p style={{ gridColumn: "1 / -1", color: "var(--site-danger)" }}>
              {error}
            </p>
          ) : null}
          <div style={{ gridColumn: "1 / -1" }}>
            <SiteButton
              type="submit"
              variant="accent"
              disabled={busy}
              style={{ width: "100%", maxWidth: 280 }}
            >
              {busy ? "Sending…" : "Send invitation"}
            </SiteButton>
          </div>
        </form>
      )}

      {copyPanel ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(20,22,20,0.45)",
            display: "grid",
            placeItems: "center",
            zIndex: 70,
            padding: 20,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 440,
              background: "var(--site-surface, #fff)",
              border: "1px solid var(--site-border)",
              borderRadius: 12,
              padding: 22,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 650 }}>
              Invitation sent
            </h2>
            <p style={{ margin: "10px 0", fontSize: 14 }}>
              {copyPanel.displayName} ·{" "}
              {copyPanel.inviteType === "CLIENT" ? "Client" : "Colleague"} invited to{" "}
              {copyPanel.projectTitle}
            </p>
            <p
              style={{
                margin: "0 0 6px",
                fontSize: 13,
                color: "var(--site-text-secondary)",
              }}
            >
              Email
            </p>
            <p style={{ margin: "0 0 16px", fontWeight: 600 }}>{copyPanel.email}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <SiteButton
                type="button"
                variant="accent"
                onClick={() => {
                  void navigator.clipboard.writeText(copyPanel.inviteUrl);
                  setCopied(true);
                }}
              >
                {copied ? "Link copied" : "Copy Invitation Link"}
              </SiteButton>
              <SiteButton
                type="button"
                variant="ghost"
                onClick={() => setCopyPanel(null)}
              >
                Done
              </SiteButton>
            </div>
            <p
              style={{
                margin: "14px 0 0",
                fontSize: 12,
                color: "var(--site-text-light)",
              }}
            >
              Share this link with {copyPanel.displayName}. It expires in 7 days.
            </p>
          </div>
        </div>
      ) : null}

      <MemberList
        title="Clients"
        emptyLabel="No clients yet."
        members={clients}
        busyId={rowBusyId}
        onRevoke={onRevokeMember}
      />
      <MemberList
        title="Colleagues"
        emptyLabel="No colleagues yet."
        members={colleagues}
        busyId={rowBusyId}
        onRevoke={onRevokeMember}
      />

      <SiteSection
        title="Pending invitations"
        description="Invitations that have not been accepted yet."
      >
        {pendingInvitations.map((invite) => (
          <div
            key={invite.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              padding: "14px 0",
              borderBottom: "1px solid var(--site-border)",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontWeight: 650 }}>
                {invite.displayName || invite.email}
              </div>
              <div style={{ fontSize: 13, color: "var(--site-text-secondary)" }}>
                {invite.email}
                <br />
                {invite.inviteType === "CLIENT" ? "Client" : "Colleague"}
                {invite.colleaguePreset ? ` · ${invite.colleaguePreset}` : ""} ·{" "}
                {invite.projectTitle}
              </div>
            </div>
            <SiteButton
              type="button"
              variant="ghost"
              disabled={rowBusyId === invite.id}
              onClick={() => void onRevokeInvitation(invite)}
            >
              {rowBusyId === invite.id ? "Revoking…" : "Revoke"}
            </SiteButton>
          </div>
        ))}
        {!pendingInvitations.length ? (
          <p style={{ color: "var(--site-text-secondary)", fontSize: 14 }}>
            No pending invitations.
          </p>
        ) : null}
      </SiteSection>
    </div>
  );
}

function MemberList({
  title,
  emptyLabel,
  members,
  busyId,
  onRevoke,
}: {
  title: string;
  emptyLabel: string;
  members: WorkspaceMemberSummary[];
  busyId: string | null;
  onRevoke: (member: WorkspaceMemberSummary) => Promise<void>;
}) {
  return (
    <section className="site-section">
      <h2 className="site-section-title">{title}</h2>
      {members.map((member) => {
        const rowKey = member.uid + member.projectId;
        return (
          <div
            key={rowKey}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              padding: "14px 0",
              borderBottom: "1px solid var(--site-border)",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontWeight: 650 }}>
                {member.displayName || member.email}
              </div>
              <div style={{ fontSize: 13, color: "var(--site-text-secondary)" }}>
                {member.email}
                <br />
                Project: {member.projectTitle}
                {member.permissionPreset ? ` · ${member.permissionPreset}` : ""}
                <br />
                Access status: {member.status === "ACTIVE" ? "Active" : member.status}
              </div>
            </div>
            <SiteButton
              type="button"
              variant="ghost"
              disabled={busyId === rowKey}
              onClick={() => void onRevoke(member)}
            >
              {busyId === rowKey ? "Revoking…" : "Revoke access"}
            </SiteButton>
          </div>
        );
      })}
      {!members.length ? (
        <p style={{ color: "var(--site-text-secondary)", fontSize: 14 }}>
          {emptyLabel}
        </p>
      ) : null}
    </section>
  );
}
