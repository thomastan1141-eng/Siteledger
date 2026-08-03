"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  SiteButton,
  SiteField,
  SiteInput,
  SitePageHeader,
  SiteSelect,
  SiteSpinner,
} from "@/components/progress/primitives";
import { useAuth } from "@/lib/auth-context";
import { listProjects } from "@/lib/services/projects";
import { inviteUser } from "@/lib/services/invites";
import { listUsersByRole, setClientAccess } from "@/lib/services/users";
import type { AppUser, Project, UserRole } from "@/lib/types";

export default function ClientAccessPage() {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<AppUser[]>([]);
  const [staff, setStaff] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    email: "",
    password: "",
    displayName: "",
    role: "client" as UserRole,
    projectId: "",
  });

  async function reload() {
    const [p, c, s] = await Promise.all([
      listProjects(),
      listUsersByRole("client"),
      listUsersByRole("staff"),
    ]);
    setProjects(p);
    setClients(c);
    setStaff(s);
    if (!form.projectId && p[0]) {
      setForm((prev) => ({ ...prev, projectId: p[0].id }));
    }
  }

  useEffect(() => {
    if (profile?.role !== "admin") return;
    reload().finally(() => setLoading(false));
  }, [profile]);

  if (profile?.role !== "admin") {
    return (
      <p style={{ color: "var(--site-text-secondary)" }}>
        Only administrators can manage access.
      </p>
    );
  }

  if (loading) return <SiteSpinner />;

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await inviteUser({
        email: form.email,
        password: form.password,
        displayName: form.displayName,
        role: form.role,
        projectIds: form.projectId ? [form.projectId] : [],
      });
      setMessage(`${form.role} account created for ${form.email}`);
      setForm((prev) => ({
        ...prev,
        email: "",
        password: "",
        displayName: "",
      }));
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <SitePageHeader
        kicker="Access"
        title="People"
        description="Invite clients and staff, attach them to a project, revoke access."
      />

      <form
        onSubmit={onInvite}
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
              setForm((s) => ({ ...s, role: e.target.value as UserRole }))
            }
          >
            <option value="client">Client</option>
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
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
          <SiteInput
            type="text"
            value={form.password}
            onChange={(e) =>
              setForm((s) => ({ ...s, password: e.target.value }))
            }
            required
            minLength={6}
          />
        </SiteField>
        <div style={{ gridColumn: "1 / -1" }}>
          <SiteField label="Attach to project">
            <SiteSelect
              value={form.projectId}
              onChange={(e) =>
                setForm((s) => ({ ...s, projectId: e.target.value }))
              }
            >
              <option value="">No project yet</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </SiteSelect>
          </SiteField>
        </div>
        {error ? (
          <p style={{ gridColumn: "1 / -1", color: "var(--site-danger)" }}>
            {error}
          </p>
        ) : null}
        {message ? (
          <p style={{ gridColumn: "1 / -1", color: "var(--site-success)" }}>
            {message}
          </p>
        ) : null}
        <div style={{ gridColumn: "1 / -1" }}>
          <SiteButton type="submit" variant="accent" disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </SiteButton>
        </div>
      </form>

      <UserList
        title="Clients"
        users={clients}
        projects={projects}
        onToggle={async (uid, active) => {
          await setClientAccess(uid, active);
          await reload();
        }}
      />
      <UserList title="Staff" users={staff} projects={projects} />
    </div>
  );
}

function UserList({
  title,
  users,
  projects,
  onToggle,
}: {
  title: string;
  users: AppUser[];
  projects: Project[];
  onToggle?: (uid: string, active: boolean) => Promise<void>;
}) {
  return (
    <section className="site-section">
      <h2 className="site-section-title">{title}</h2>
      {users.map((user) => {
        const linked = projects
          .filter(
            (p) =>
              p.clientUserIds?.includes(user.uid) ||
              p.staffIds?.includes(user.uid),
          )
          .map((p) => p.name)
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
                {linked ? ` · ${linked}` : ""}
              </div>
            </div>
            {onToggle ? (
              <SiteButton
                variant={user.active ? "ghost" : "primary"}
                onClick={() => onToggle(user.uid, !user.active)}
              >
                {user.active ? "Disable" : "Enable"}
              </SiteButton>
            ) : (
              <span style={{ fontSize: 12, color: "var(--site-text-light)" }}>
                {user.active ? "Active" : "Inactive"}
              </span>
            )}
          </div>
        );
      })}
      {!users.length ? (
        <p style={{ color: "var(--site-text-secondary)", fontSize: 14 }}>
          No {title.toLowerCase()} yet.
        </p>
      ) : null}
    </section>
  );
}
