"use client";

import { FormEvent, useEffect, useState } from "react";
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
import { createProject } from "@/lib/services/projects";
import { createManyStages } from "@/lib/services/schedule";
import type { ProjectStatus } from "@/lib/types";

type CustomDraft = {
  name: string;
  plannedStartDate: string;
  plannedEndDate: string;
  clientVisible: boolean;
  internalNotes: string;
};

const emptyCustom = (): CustomDraft => ({
  name: "",
  plannedStartDate: "",
  plannedEndDate: "",
  clientVisible: true,
  internalNotes: "",
});

export default function NewProjectPage() {
  const { profile } = useAuth();
  const { workspaceId } = useWorkspace();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [selectedPresets, setSelectedPresets] = useState<string[]>([]);
  const [customs, setCustoms] = useState<CustomDraft[]>([]);
  const [customDraft, setCustomDraft] = useState<CustomDraft>(emptyCustom());
  const [form, setForm] = useState({
    clientName: "",
    manager: "",
    address: "",
    startDate: "",
    contractCompletionDate: "",
    forecastCompletionDate: "",
    status: "upcoming" as ProjectStatus,
    internalNotes: "",
    allowStaffPublish: false,
  });

  useEffect(() => {
    if (profile?.role !== "admin") {
      router.replace("/projects");
    }
  }, [profile, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setWarning("");
    try {
      const tenant =
        workspaceId || profile?.defaultWorkspaceId || profile?.companyId || "";
      if (!tenant) {
        throw new Error(
          "Workspace is not ready yet. Refresh the page and try again.",
        );
      }
      const { project, photoWarning } = await createProject({
        workspaceId: tenant,
        createdBy: profile?.uid || null,
        updatedBy: profile?.uid || null,
        clientName: form.clientName,
        manager: form.manager,
        address: form.address,
        startDate: form.startDate || null,
        contractCompletionDate: form.contractCompletionDate || null,
        forecastCompletionDate: form.forecastCompletionDate || null,
        status: form.status || "upcoming",
        internalNotes: form.internalNotes,
        allowStaffPublish: form.allowStaffPublish,
      });

      if (photoWarning) setWarning(photoWarning);

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
          setWarning(
            (photoWarning ? `${photoWarning} ` : "") +
              "Stages could not be saved. You can add them later.",
          );
        }
      }

      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We could not create the project. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
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
            value={form.clientName}
            onChange={(e) => set("clientName", e.target.value)}
            placeholder="Optional"
          />
        </SiteField>
        <SiteField label="Manager">
          <SiteInput
            value={form.manager}
            onChange={(e) => set("manager", e.target.value)}
            placeholder="Enter manager name"
          />
        </SiteField>
        <div style={{ gridColumn: "1 / -1" }}>
          <SiteField label="Address">
            <SiteInput
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="e.g. 19 Burnfoot Terrace"
            />
          </SiteField>
        </div>
        <SiteField label="Start date">
          <SiteInput
            type="date"
            value={form.startDate}
            onChange={(e) => set("startDate", e.target.value)}
          />
        </SiteField>
        <SiteField label="Contract completion">
          <SiteInput
            type="date"
            value={form.contractCompletionDate}
            onChange={(e) => set("contractCompletionDate", e.target.value)}
          />
        </SiteField>
        <SiteField label="Current forecast">
          <SiteInput
            type="date"
            value={form.forecastCompletionDate}
            onChange={(e) => set("forecastCompletionDate", e.target.value)}
          />
        </SiteField>
        <SiteField label="Status">
          <SiteSelect
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

          <p className="site-section-desc" style={{ marginTop: 12 }}>
            Selected: {selectedPresets.length} common
            {customs.length ? ` · ${customs.length} custom` : ""}
            {!selectedPresets.length && !customs.length
              ? " · none (you can add stages later)"
              : ""}
          </p>
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
