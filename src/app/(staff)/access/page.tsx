"use client";

import { FormEvent, useEffect, useId, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
  listWorkspaceInvitations,
  revokeInvitation,
  revokeMemberAccess,
  shareProjectAccess,
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

function emptyForm(projectId = ""): FormState {
  return {
    inviteType: "CLIENT",
    inviteeDisplayName: "",
    inviteeEmail: "",
    projectId,
    colleaguePreset: "VIEW_ONLY",
    permissions: permissionsForPreset("VIEW_ONLY"),
  };
}

export default function ProjectAccessPage() {
  const { profile } = useAuth();
  const { workspaceId } = useWorkspace();
  const searchParams = useSearchParams();
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
  const [success, setSuccess] = useState("");
  const initialProjectId = searchParams.get("projectId") || "";
  const [form, setForm] = useState<FormState>(() =>
    emptyForm(initialProjectId),
  );

  const ws = workspaceId || profile?.defaultWorkspaceId || profile?.companyId || "";

  const filteredMembers = useMemo(() => {
    if (!form.projectId) return members;
    return members.filter((m) => m.projectId === form.projectId);
  }, [members, form.projectId]);

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

  useEffect(() => {
    const fromQuery = searchParams.get("projectId") || "";
    if (!fromQuery) return;
    setForm((prev) =>
      prev.projectId === fromQuery ? prev : { ...prev, projectId: fromQuery },
    );
  }, [searchParams]);

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

  function resetForm(keepProjectId = true) {
    setForm(emptyForm(keepProjectId ? form.projectId : ""));
    setFormInstance((n) => n + 1);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!ws) {
      setError("Workspace is not ready yet. Refresh the page and try again.");
      return;
    }
    if (!form.projectId) {
      setError("Select a project before sharing.");
      return;
    }
    if (!form.inviteeEmail.trim()) {
      setError("Enter the registered email address.");
      return;
    }
    setBusy(true);
    try {
      const result = await shareProjectAccess({
        workspaceId: ws,
        projectId: form.projectId,
        inviteType: form.inviteType,
        email: form.inviteeEmail,
        displayName: form.inviteeDisplayName,
        colleaguePreset:
          form.inviteType === "COLLEAGUE" ? form.colleaguePreset : undefined,
        permissions:
          form.inviteType === "COLLEAGUE" && form.colleaguePreset === "CUSTOM"
            ? form.permissions
            : undefined,
      });
      const projectTitle =
        getProjectDisplayTitle(projects.find((p) => p.id === form.projectId)) ||
        "Project";
      setSuccess(
        result.alreadyShared
          ? `${result.email} already has access to ${projectTitle}.`
          : `Shared ${projectTitle} with ${result.email}. Access is active immediately.`,
      );
      resetForm(true);
      await reload(ws);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We could not share this project. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onRevokeInvitation(invite: PendingInvitationSummary) {
    if (!ws) return;
    if (!confirm(`Revoke the legacy invitation to ${invite.email}?`)) return;
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
    if (!confirm(`Remove access for ${member.displayName || member.email}?`))
      return;
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

  const clients = filteredMembers.filter((m) => m.memberType === "CLIENT");
  const colleagues = filteredMembers.filter(
    (m) => m.memberType === "COLLEAGUE" || m.memberType === "COMPANY_MEMBER",
  );

  return (
    <div>
      <SitePageHeader
        kicker="ACCESS CONTROL"
        title="Project Access"
        description="Share a project with an existing, email-verified SiteLedger account. Access is granted immediately."
      />

      {!projects.length ? (
        <section className="site-section" style={{ maxWidth: 560 }}>
          <h2 className="site-section-title">Create a project first</h2>
          <p className="site-section-desc">
            Sharing must be attached to a project.
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
                <span>Share with a homeowner for this project only.</span>
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
                <span>Share with a teammate for this project only.</span>
              </div>
            </button>
          </div>

          <SiteField label="Display name (optional)">
            <SiteInput
              name="inviteeDisplayName"
              autoComplete="off"
              value={form.inviteeDisplayName}
              onChange={(e) => set("inviteeDisplayName", e.target.value)}
            />
          </SiteField>
          <SiteField label="Registered email">
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
                  onChange={(e) =>
                    onPresetChange(e.target.value as ColleaguePreset)
                  }
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
          {success ? (
            <p style={{ gridColumn: "1 / -1", color: "var(--site-text-secondary)" }}>
              {success}
            </p>
          ) : null}
          <div style={{ gridColumn: "1 / -1" }}>
            <SiteButton
              type="submit"
              variant="accent"
              disabled={busy}
              style={{ width: "100%", maxWidth: 280 }}
            >
              {busy ? "Sharing…" : "Share"}
            </SiteButton>
          </div>
        </form>
      )}

      <MemberList
        title="Clients"
        emptyLabel="No clients shared yet."
        members={clients}
        busyId={rowBusyId}
        onRevoke={onRevokeMember}
      />
      <MemberList
        title="Colleagues"
        emptyLabel="No colleagues shared yet."
        members={colleagues}
        busyId={rowBusyId}
        onRevoke={onRevokeMember}
      />

      {pendingInvitations.length ? (
        <SiteSection
          title="Legacy pending invitations"
          description="Old invitation links no longer grant access. Revoke them to clean up."
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
        </SiteSection>
      ) : null}
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
              {busyId === rowKey ? "Removing…" : "Remove access"}
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
