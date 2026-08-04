"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SiteButton,
  SiteField,
  SiteInput,
  SitePageHeader,
  SiteSelect,
  SiteTextarea,
} from "@/components/progress/primitives";
import { COMMON_STAGE_OPTIONS } from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { createManyStages } from "@/lib/services/schedule";
import { getFirebaseAuth } from "@/lib/firebase";
import type { ProjectStatus } from "@/lib/types";

type CustomDraft = {
  name: string;
  plannedStartDate: string;
  plannedEndDate: string;
  clientVisible: boolean;
  internalNotes: string;
};

type FormState = {
  clientName: string;
  manager: string;
  address: string;
  startDate: string;
  contractCompletionDate: string;
  forecastCompletionDate: string;
  status: ProjectStatus;
  internalNotes: string;
  allowStaffPublish: boolean;
};

const emptyCustom = (): CustomDraft => ({
  name: "",
  plannedStartDate: "",
  plannedEndDate: "",
  clientVisible: true,
  internalNotes: "",
});

const emptyForm = (): FormState => ({
  clientName: "",
  manager: "",
  address: "",
  startDate: "",
  contractCompletionDate: "",
  forecastCompletionDate: "",
  status: "upcoming",
  internalNotes: "",
  allowStaffPublish: false,
});

export default function NewProjectPage() {
  const { profile } = useAuth();
  const { workspaceId } = useWorkspace();
  const router = useRouter();
  const formKey = useId();
  const submittingRef = useRef(false);
  const [formInstance, setFormInstance] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [selectedPresets, setSelectedPresets] = useState<string[]>([]);
  const [customs, setCustoms] = useState<CustomDraft[]>([]);
  const [customDraft, setCustomDraft] = useState<CustomDraft>(emptyCustom());
  const [form, setForm] = useState<FormState>(emptyForm);

  // Always remount as a fresh form — never restore drafts.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fresh mount reset
    setForm(emptyForm());
    setSelectedPresets([]);
    setCustoms([]);
    setCustomDraft(emptyCustom());
    setError("");
    setWarning("");
    setBusy(false);
    submittingRef.current = false;
    setFormInstance((n) => n + 1);
  }, []);

  useEffect(() => {
    if (profile?.role !== "admin") {
      router.replace("/projects");
    }
  }, [profile, router]);

  function resetAll() {
    setForm(emptyForm());
    setSelectedPresets([]);
    setCustoms([]);
    setCustomDraft(emptyCustom());
    setError("");
    setWarning("");
    setFormInstance((n) => n + 1);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    setError("");
    setWarning("");

    const clientRequestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
      const tenant =
        workspaceId || profile?.defaultWorkspaceId || profile?.companyId || "";
      if (!tenant) {
        throw new Error(
          "Workspace is not ready yet. Refresh the page and try again.",
        );
      }

      const auth = getFirebaseAuth();
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Please sign in again.");

      const res = await fetch("/api/projects/create", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientRequestId,
          workspaceId: tenant,
          clientName: form.clientName,
          manager: form.manager,
          address: form.address,
          startDate: form.startDate || null,
          contractCompletionDate: form.contractCompletionDate || null,
          forecastCompletionDate: form.forecastCompletionDate || null,
          status: form.status || "upcoming",
          internalNotes: form.internalNotes,
          allowStaffPublish: form.allowStaffPublish,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        project?: { id: string; workspaceId?: string };
      };
      if (!res.ok || !data.project?.id) {
        throw new Error(data.error || "We could not create the project.");
      }

      const project = data.project;
      const stageInputs = [
        ...selectedPresets.map((name) => ({
          name,
          source: "preset" as const,
        })),
        ...customs
          .filter((c) => c.name.trim())
          .map((c) => ({
            name: c.name.trim(),
            source: "custom" as const,
            plannedStartDate: c.plannedStartDate || undefined,
            plannedEndDate: c.plannedEndDate || undefined,
            clientVisible: c.clientVisible,
            internalNotes: c.internalNotes || undefined,
          })),
      ];

      if (stageInputs.length) {
        try {
          await createManyStages(
            project.id,
            stageInputs,
            profile?.uid,
            project.workspaceId || tenant,
          );
        } catch (stageErr) {
          console.error("[createProject stages]", stageErr);
          setWarning("Stages could not be saved. You can add them later.");
        }
      }

      resetAll();
      router.push(`/projects/${project.id}`);
    } catch (err) {
      submittingRef.current = false;
      setBusy(false);
      setError(
        err instanceof Error
          ? err.message
          : "We could not create the project. Please try again.",
      );
    }
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addCustomDraft() {
    if (!customDraft.name.trim()) {
      setError("Enter a custom stage name before adding.");
      return;
    }
    setCustoms((prev) => [...prev, { ...customDraft }]);
    setCustomDraft(emptyCustom());
    setError("");
  }

  return (
    <div>
      <SitePageHeader
        kicker="New site"
        title="Open a project journal"
        description="You can create the project now and complete the details later."
      />

      <form
        key={`${formKey}-${formInstance}`}
        autoComplete="off"
        onSubmit={onSubmit}
        style={{
          maxWidth: 720,
          display: "grid",
          gap: 14,
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        }}
      >
        <SiteField label="Client name">
          <SiteInput
            name="projectClientName"
            autoComplete="off"
            value={form.clientName}
            onChange={(e) => set("clientName", e.target.value)}
            placeholder="Optional"
          />
        </SiteField>
        <SiteField label="Manager">
          <SiteInput
            name="projectManager"
            autoComplete="off"
            value={form.manager}
            onChange={(e) => set("manager", e.target.value)}
            placeholder="Enter manager name"
          />
        </SiteField>
        <div style={{ gridColumn: "1 / -1" }}>
          <SiteField label="Address">
            <SiteInput
              name="projectAddress"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="e.g. 19 Burnfoot Terrace"
            />
          </SiteField>
        </div>
        <SiteField label="Start date">
          <SiteInput
            type="date"
            name="projectStartDate"
            autoComplete="off"
            value={form.startDate}
            onChange={(e) => set("startDate", e.target.value)}
          />
        </SiteField>
        <SiteField label="Contract completion">
          <SiteInput
            type="date"
            name="projectContractCompletion"
            autoComplete="off"
            value={form.contractCompletionDate}
            onChange={(e) => set("contractCompletionDate", e.target.value)}
          />
        </SiteField>
        <SiteField label="Current forecast">
          <SiteInput
            type="date"
            name="projectForecastCompletion"
            autoComplete="off"
            value={form.forecastCompletionDate}
            onChange={(e) => set("forecastCompletionDate", e.target.value)}
          />
        </SiteField>
        <SiteField label="Status">
          <SiteSelect
            name="projectStatus"
            autoComplete="off"
            value={form.status}
            onChange={(e) => set("status", e.target.value as ProjectStatus)}
          >
            <option value="upcoming">Upcoming</option>
            <option value="in_progress">In Progress</option>
            <option value="on_hold">On Hold</option>
          </SiteSelect>
        </SiteField>
        <div style={{ gridColumn: "1 / -1" }}>
          <SiteField label="Internal notes">
            <SiteTextarea
              name="projectInternalNotes"
              autoComplete="off"
              rows={3}
              value={form.internalNotes}
              onChange={(e) => set("internalNotes", e.target.value)}
            />
          </SiteField>
        </div>
        <label
          style={{
            gridColumn: "1 / -1",
            display: "flex",
            gap: 8,
            fontSize: 14,
            alignItems: "center",
          }}
        >
          <input
            type="checkbox"
            checked={form.allowStaffPublish}
            onChange={(e) => set("allowStaffPublish", e.target.checked)}
          />
          Allow staff to publish client-visible updates
        </label>

        <div style={{ gridColumn: "1 / -1" }} className="site-new-stages">
          <h3 className="site-section-title">Project stages</h3>
          <p className="site-section-desc">
            Optional. Select common stages, add custom ones, or leave empty and
            manage later.
          </p>

          <h4 className="site-section-title" style={{ fontSize: 15, marginTop: 18 }}>
            Select common stages
          </h4>
          <div className="site-stage-check-grid">
            {COMMON_STAGE_OPTIONS.map((name) => {
              const checked = selectedPresets.includes(name);
              return (
                <label key={name} className="site-stage-check">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setSelectedPresets((prev) =>
                        checked
                          ? prev.filter((n) => n !== name)
                          : [...prev, name],
                      )
                    }
                  />
                  <span>{name}</span>
                </label>
              );
            })}
          </div>

          <h4 className="site-section-title" style={{ fontSize: 15, marginTop: 22 }}>
            Add custom stage
          </h4>
          <div className="site-stage-composer" style={{ marginBottom: 0, maxWidth: "none" }}>
            <SiteField label="Stage name">
              <SiteInput
                name="customStageName"
                autoComplete="off"
                value={customDraft.name}
                onChange={(e) =>
                  setCustomDraft((s) => ({ ...s, name: e.target.value }))
                }
                placeholder="Feature wall installation"
              />
            </SiteField>
            <div className="site-stage-grid">
              <SiteField label="Expected start (optional)">
                <SiteInput
                  type="date"
                  autoComplete="off"
                  value={customDraft.plannedStartDate}
                  onChange={(e) =>
                    setCustomDraft((s) => ({
                      ...s,
                      plannedStartDate: e.target.value,
                    }))
                  }
                />
              </SiteField>
              <SiteField label="Expected end (optional)">
                <SiteInput
                  type="date"
                  autoComplete="off"
                  value={customDraft.plannedEndDate}
                  onChange={(e) =>
                    setCustomDraft((s) => ({
                      ...s,
                      plannedEndDate: e.target.value,
                    }))
                  }
                />
              </SiteField>
            </div>
            <label className="site-stage-check">
              <input
                type="checkbox"
                checked={customDraft.clientVisible}
                onChange={(e) =>
                  setCustomDraft((s) => ({
                    ...s,
                    clientVisible: e.target.checked,
                  }))
                }
              />
              <span>Client visible</span>
            </label>
            <SiteField label="Internal note (optional)">
              <SiteTextarea
                rows={2}
                autoComplete="off"
                value={customDraft.internalNotes}
                onChange={(e) =>
                  setCustomDraft((s) => ({
                    ...s,
                    internalNotes: e.target.value,
                  }))
                }
              />
            </SiteField>
            <SiteButton type="button" variant="soft" onClick={addCustomDraft}>
              + Add custom stage
            </SiteButton>
          </div>

          {customs.length ? (
            <ul className="site-new-custom-list">
              {customs.map((c, index) => (
                <li key={`${c.name}-${index}`}>
                  <span>
                    <strong>{c.name}</strong>
                    {!c.clientVisible ? " · Internal" : ""}
                  </span>
                  <button
                    type="button"
                    className="site-chip"
                    onClick={() =>
                      setCustoms((prev) => prev.filter((_, i) => i !== index))
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {error ? (
          <p style={{ gridColumn: "1 / -1", color: "var(--site-danger)" }}>
            {error}
          </p>
        ) : null}
        {warning ? (
          <p style={{ gridColumn: "1 / -1", color: "var(--site-text-secondary)" }}>
            {warning}
          </p>
        ) : null}
        <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10 }}>
          <SiteButton type="submit" variant="accent" disabled={busy}>
            {busy ? "Creating…" : "Create project"}
          </SiteButton>
          <SiteButton type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </SiteButton>
        </div>
      </form>
    </div>
  );
}
