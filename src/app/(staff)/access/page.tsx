"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  SiteButton,
  SiteField,
  SiteInput,
  SitePageHeader,
  SiteSelect,
  SiteSpinner,
} from "@/components/progress/primitives";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { listProjects } from "@/lib/services/projects";
import {
  createProjectAccess,
  revokeProjectAccess,
} from "@/lib/services/invites";
import { listUsersByRole } from "@/lib/services/users";
import type { AppUser, Project } from "@/lib/types";
import { getProjectDisplayTitle } from "@/lib/utils";
import { generateTemporaryPassword } from "@/lib/session";
import { sendPasswordResetEmail } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

type AccessRole = "client" | "staff";

type CreatedPanel = {
  email: string;
  password: string;
  displayName: string;
  role: AccessRole;
  projectTitle: string;
};

export default function ProjectAccessPage() {
  const { profile } = useAuth();
  const { workspaceId } = useWorkspace();
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<AppUser[]>([]);
  const [staff, setStaff] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [created, setCreated] = useState<CreatedPanel | null>(null);
  const [form, setForm] = useState({
    email: "",
    password: "",
    displayName: "",
    role: "client" as AccessRole,
    projectId: "",
  });

  const ws = workspaceId || profile?.defaultWorkspaceId || profile?.companyId;

  async function reload() {
    const [p, c, s] = await Promise.all([
      listProjects({ workspaceId: ws || undefined }),
      listUsersByRole("client", ws || undefined),
      listUsersByRole("staff", ws || undefined),
    ]);
    setProjects(p);
    setClients(c);
    setStaff(s);
  }

  useEffect(() => {
    if (profile?.role !== "admin") return;
    // Load access lists for the current workspace.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async access reload
    void reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, ws]);

  const canSubmit = useMemo(() => {
    return (
      !!form.displayName.trim() &&
      !!form.email.trim() &&
      !!form.password.trim() &&
      form.password.length >= 6 &&
      (form.role === "client" || form.role === "staff") &&
      !!form.projectId &&
      !busy
    );
  }, [form, busy]);

  if (profile?.role !== "admin") {
    return (
      <p style={{ color: "var(--site-text-secondary)" }}>
        Only administrators can manage project access.
      </p>
    );
  }

  if (loading) return <SiteSpinner />;

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!form.projectId) {
      setError("Select a project before creating access.");
      return;
    }
    if (!ws) {
      setError("Workspace is required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await createProjectAccess({
        email: form.email,
        password: form.password,
        displayName: form.displayName,
        role: form.role,
        projectId: form.projectId,
        workspaceId: ws,
      });
      const projectTitle =
        getProjectDisplayTitle(
          projects.find((p) => p.id === form.projectId),
        ) || "Project";
      setCreated({
        email: result.email,
        password: form.password,
        displayName: result.displayName,
        role: result.role,
        projectTitle,
      });
      setForm((prev) => ({
        ...prev,
        email: "",
        password: "",
        displayName: "",
      }));
      await reload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We could not create access. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <SitePageHeader
        kicker="ACCESS CONTROL"
        title="Project Access"
        description="Create access for clients and staff, assign them to a project, and revoke access."
      />

      {!projects.length ? (
        <section className="site-section" style={{ maxWidth: 560 }}>
          <h2 className="site-section-title">Create a project first</h2>
          <p className="site-section-desc">
            Temporary client and staff access must be attached to a project.
          </p>
          <SiteButton href="/projects/new" variant="accent">
            Create project
          </SiteButton>
        </section>
      ) : (
        <form
          onSubmit={onCreate}
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            maxWidth: 720,
            marginBottom: 40,
          }}
        >
          <SiteField label="Display name">
            <SiteInput
              value={form.displayName}
              onChange={(e) =>
                setForm((s) => ({ ...s, displayName: e.target.value }))
              }
              required
            />
          </SiteField>
          <SiteField label="Role">
            <SiteSelect
              value={form.role}
              onChange={(e) =>
                setForm((s) => ({
                  ...s,
                  role: e.target.value as AccessRole,
                }))
              }
            >
              <option value="client">Client</option>
              <option value="staff">Staff</option>
            </SiteSelect>
          </SiteField>
          <SiteField label="Email">
            <SiteInput
              type="email"
              value={form.email}
              onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
              required
            />
          </SiteField>
          <SiteField label="Temporary password">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <SiteInput
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(e) =>
                  setForm((s) => ({ ...s, password: e.target.value }))
                }
                required
                minLength={6}
                style={{ flex: 1, minWidth: 160 }}
              />
              <SiteButton
                type="button"
                variant="ghost"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? "Hide" : "Show"}
              </SiteButton>
              <SiteButton
                type="button"
                variant="soft"
                onClick={() =>
                  setForm((s) => ({
                    ...s,
                    password: generateTemporaryPassword(),
                  }))
                }
              >
                Generate
              </SiteButton>
            </div>
          </SiteField>
          <div style={{ gridColumn: "1 / -1" }}>
            <SiteField label="Assign to project *">
              <SiteSelect
                value={form.projectId}
                onChange={(e) =>
                  setForm((s) => ({ ...s, projectId: e.target.value }))
                }
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
            {!form.projectId ? (
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: 13,
                  color: "var(--site-danger)",
                }}
              >
                Select a project before creating access.
              </p>
            ) : null}
          </div>
          {error ? (
            <p style={{ gridColumn: "1 / -1", color: "var(--site-danger)" }}>
              {error}
            </p>
          ) : null}
          <div style={{ gridColumn: "1 / -1" }}>
            <SiteButton
              type="submit"
              variant="accent"
              disabled={!canSubmit}
              style={{ width: "100%", maxWidth: 280 }}
            >
              {busy ? "Creating…" : "Create access"}
            </SiteButton>
          </div>
        </form>
      )}

      {created ? (
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
              Access created
            </h2>
            <p style={{ margin: "10px 0", fontSize: 14 }}>
              {created.displayName} · {created.role === "client" ? "Client" : "Staff"}{" "}
              access for {created.projectTitle}
            </p>
            <p style={{ margin: "0 0 6px", fontSize: 13, color: "var(--site-text-secondary)" }}>
              Email
            </p>
            <p style={{ margin: "0 0 12px", fontWeight: 600 }}>{created.email}</p>
            <p style={{ margin: "0 0 6px", fontSize: 13, color: "var(--site-text-secondary)" }}>
              Temporary password
            </p>
            <p style={{ margin: "0 0 16px", fontWeight: 600, fontFamily: "monospace" }}>
              {created.password}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <SiteButton
                type="button"
                variant="soft"
                onClick={() => void navigator.clipboard.writeText(created.email)}
              >
                Copy email
              </SiteButton>
              <SiteButton
                type="button"
                variant="soft"
                onClick={() =>
                  void navigator.clipboard.writeText(created.password)
                }
              >
                Copy temporary password
              </SiteButton>
              <SiteButton
                type="button"
                variant="accent"
                onClick={() => setCreated(null)}
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
              This password will not be shown again.
            </p>
          </div>
        </div>
      ) : null}

      <AccessList
        title="Clients"
        users={clients}
        projects={projects}
        workspaceId={ws || ""}
        onRevoke={async (uid, projectId) => {
          if (!confirm("Revoke this client access?")) return;
          await revokeProjectAccess({
            uid,
            workspaceId: ws || "",
            projectId,
          });
          await reload();
        }}
        onResetPassword={async (email) => {
          await sendPasswordResetEmail(getFirebaseAuth(), email);
          alert("Password reset email sent.");
        }}
      />
      <AccessList
        title="Staff"
        users={staff}
        projects={projects}
        workspaceId={ws || ""}
        onRevoke={async (uid, projectId) => {
          if (!confirm("Revoke this staff access?")) return;
          await revokeProjectAccess({
            uid,
            workspaceId: ws || "",
            projectId,
          });
          await reload();
        }}
        onResetPassword={async (email) => {
          await sendPasswordResetEmail(getFirebaseAuth(), email);
          alert("Password reset email sent.");
        }}
      />
    </div>
  );
}

function AccessList({
  title,
  users,
  projects,
  onRevoke,
  onResetPassword,
}: {
  title: string;
  users: AppUser[];
  projects: Project[];
  workspaceId: string;
  onRevoke: (uid: string, projectId?: string) => Promise<void>;
  onResetPassword: (email: string) => Promise<void>;
}) {
  return (
    <section className="site-section">
      <h2 className="site-section-title">{title}</h2>
      {users.map((user) => {
        const linkedProjects = projects.filter(
          (p) =>
            p.clientUserIds?.includes(user.uid) ||
            p.staffIds?.includes(user.uid),
        );
        const linked = linkedProjects
          .map((p) => getProjectDisplayTitle(p))
          .join(", ");
        return (
          <div
            key={user.uid}
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
              <div style={{ fontWeight: 650 }}>{user.displayName}</div>
              <div style={{ fontSize: 13, color: "var(--site-text-secondary)" }}>
                {user.email}
                <br />
                Assigned project: {linked || "—"}
                <br />
                Access status: {user.active ? "Active" : "Revoked"}
                {user.mustChangePassword ? " · Must change password" : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <SiteButton
                type="button"
                variant="ghost"
                onClick={() => void onResetPassword(user.email)}
              >
                Reset password
              </SiteButton>
              <SiteButton
                type="button"
                variant="ghost"
                onClick={() =>
                  void onRevoke(user.uid, linkedProjects[0]?.id)
                }
              >
                Revoke access
              </SiteButton>
            </div>
          </div>
        );
      })}
      {!users.length ? (
        <p style={{ color: "var(--site-text-secondary)", fontSize: 14 }}>
          No {title.toLowerCase()} access yet.
        </p>
      ) : null}
    </section>
  );
}
