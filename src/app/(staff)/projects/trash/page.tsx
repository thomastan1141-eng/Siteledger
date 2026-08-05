"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import {
  SiteButton,
  SiteField,
  SiteInput,
  SitePageHeader,
  SiteSpinner,
} from "@/components/progress/primitives";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { getFirebaseAuth } from "@/lib/firebase";
import { listTrashedProjects } from "@/lib/services/projects";
import type { Project } from "@/lib/types";
import { formatDate, getProjectDisplayTitle } from "@/lib/utils";

export default function RecentlyDeletedPage() {
  const { profile, user } = useAuth();
  const { workspaceId } = useWorkspace();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [mode, setMode] = useState<"restore" | "purge" | null>(null);
  const [nowMs, setNowMs] = useState(0);

  const ws = workspaceId || profile?.defaultWorkspaceId || profile?.companyId;

  async function reload() {
    if (!profile?.uid) {
      setProjects([]);
      return;
    }
    const list = await listTrashedProjects(ws || undefined, profile.uid);
    setProjects(list);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clock for remaining days
    setNowMs(Date.now());
  }, []);

  useEffect(() => {
    if (!profile) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async list load
    void reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, ws]);

  async function reauth() {
    const auth = getFirebaseAuth();
    const current = auth.currentUser;
    if (!current?.email) throw new Error("Please sign in again.");
    const cred = EmailAuthProvider.credential(current.email, password);
    await reauthenticateWithCredential(current, cred);
    return current.getIdToken(true);
  }

  async function onConfirm(e: FormEvent) {
    e.preventDefault();
    if (!confirmId || !mode || !ws) return;
    setBusyId(confirmId);
    setError("");
    try {
      const token = await reauth();
      const path =
        mode === "restore"
          ? `/api/projects/${confirmId}/restore`
          : `/api/projects/${confirmId}/purge`;
      const res = await fetch(path, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workspaceId: ws, confirm: true }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Action failed.");
      setConfirmId(null);
      setMode(null);
      setPassword("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusyId("");
    }
  }

  if (loading) return <SiteSpinner />;

  return (
    <div>
      <SitePageHeader
        kicker="Recovery"
        title="Recently deleted"
        description="Projects you deleted are kept for 30 days. Only you can restore them."
      />

      {!projects.length ? (
        <p style={{ color: "var(--site-text-secondary)" }}>
          No recently deleted projects.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 12, maxWidth: 720 }}>
          {projects.map((p) => {
            const daysLeft =
              p.purgeAt && nowMs
                ? Math.max(
                    0,
                    Math.ceil(
                      (new Date(p.purgeAt).getTime() - nowMs) /
                        (24 * 60 * 60 * 1000),
                    ),
                  )
                : null;
            return (
              <article key={p.id} className="site-section">
                <h3 className="site-section-title">
                  {getProjectDisplayTitle(p)}
                </h3>
                <p className="site-section-desc">
                  Deleted {p.deletedAt ? formatDate(p.deletedAt) : "—"} ·
                  Permanent deletion {p.purgeAt ? formatDate(p.purgeAt) : "—"}
                  {daysLeft != null
                    ? ` · ${daysLeft} day${daysLeft === 1 ? "" : "s"} remaining`
                    : ""}
                </p>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <SiteButton
                    type="button"
                    variant="accent"
                    disabled={busyId === p.id}
                    onClick={() => {
                      setConfirmId(p.id);
                      setMode("restore");
                      setPassword("");
                      setError("");
                    }}
                  >
                    Restore
                  </SiteButton>
                  <SiteButton
                    type="button"
                    variant="ghost"
                    disabled={busyId === p.id}
                    onClick={() => {
                      setConfirmId(p.id);
                      setMode("purge");
                      setPassword("");
                      setError("");
                    }}
                  >
                    Delete permanently
                  </SiteButton>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {confirmId && mode ? (
        <form
          onSubmit={onConfirm}
          className="site-sheet-backdrop"
          style={{ display: "grid", placeItems: "center" }}
        >
          <div
            className="site-sheet"
            style={{ maxWidth: 420, padding: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="site-section-title">
              {mode === "restore" ? "Restore project" : "Delete permanently"}
            </h3>
            <p className="site-section-desc">
              {mode === "restore"
                ? "Re-enter your password to restore this project and member access."
                : "This cannot be undone. Photos, Bunny videos, and project data will be removed."}
            </p>
            <SiteField label="Current password">
              <SiteInput
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </SiteField>
            {error ? (
              <p style={{ color: "var(--site-danger)" }}>{error}</p>
            ) : null}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <SiteButton type="submit" variant="accent" disabled={!!busyId}>
                Confirm
              </SiteButton>
              <SiteButton
                type="button"
                variant="ghost"
                onClick={() => {
                  setConfirmId(null);
                  setMode(null);
                }}
              >
                Cancel
              </SiteButton>
            </div>
          </div>
        </form>
      ) : null}

      {!user ? null : null}
    </div>
  );
}
