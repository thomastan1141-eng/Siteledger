"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { COMMON_STAGE_OPTIONS } from "@/lib/constants";
import {
  createManyStages,
  createScheduleItem,
  deleteScheduleItem,
  listSchedule,
  reorderStages,
  updateScheduleItem,
} from "@/lib/services/schedule";
import type { ScheduleItem, ScheduleStatus } from "@/lib/types";
import {
  SiteButton,
  SiteField,
  SiteInput,
  SiteSelect,
  SiteTextarea,
} from "./primitives";
import { ScheduleStatusPill } from "./status";

export function ManageStagesDialog({
  projectId,
  workspaceId,
  open,
  onClose,
  onChanged,
}: {
  projectId: string;
  workspaceId?: string;
  open: boolean;
  onClose: () => void;
  onChanged?: (stages: ScheduleItem[]) => void;
}) {
  const [stages, setStages] = useState<ScheduleItem[]>([]);
  const [selectedPresets, setSelectedPresets] = useState<string[]>([]);
  const [customName, setCustomName] = useState("");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [customVisible, setCustomVisible] = useState(true);
  const [customNote, setCustomNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);

  async function reload() {
    const next = await listSchedule(projectId, { workspaceId });
    setStages(next);
    onChanged?.(next);
  }

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load stages when dialog opens
    void reload();
    setSelectedPresets([]);
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload closes over latest project/workspace
  }, [open, projectId, workspaceId]);

  const availablePresets = useMemo(
    () =>
      COMMON_STAGE_OPTIONS.filter(
        (name) => !stages.some((s) => s.name.toLowerCase() === name.toLowerCase()),
      ),
    [stages],
  );

  if (!open) return null;

  async function addSelectedPresets() {
    if (!selectedPresets.length) return;
    setBusy(true);
    setError("");
    try {
      await createManyStages(
        projectId,
        selectedPresets.map((name) => ({ name, source: "preset" as const })),
        undefined,
        workspaceId,
      );
      setSelectedPresets([]);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add stages");
    } finally {
      setBusy(false);
    }
  }

  async function addCustom(e: FormEvent) {
    e.preventDefault();
    if (!customName.trim()) {
      setError("Enter a custom stage name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await createScheduleItem(
        projectId,
        {
          name: customName,
          source: "custom",
          plannedStartDate: customStart || undefined,
          plannedEndDate: customEnd || undefined,
          clientVisible: customVisible,
          internalNotes: customNote || undefined,
          sortOrder: stages.length,
          workspaceId,
        },
        workspaceId,
      );
      setCustomName("");
      setCustomStart("");
      setCustomEnd("");
      setCustomNote("");
      setCustomVisible(true);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add stage");
    } finally {
      setBusy(false);
    }
  }

  async function applyOrder(next: ScheduleItem[]) {
    setStages(next);
    await reorderStages(
      projectId,
      next.map((s) => s.id),
      workspaceId,
    );
    onChanged?.(await listSchedule(projectId, { workspaceId }));
  }

  async function move(id: string, direction: -1 | 1) {
    const index = stages.findIndex((s) => s.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= stages.length) return;
    const next = [...stages];
    const [row] = next.splice(index, 1);
    next.splice(target, 0, row);
    await applyOrder(next);
  }

  async function onDropOn(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const from = stages.findIndex((s) => s.id === dragId);
    const to = stages.findIndex((s) => s.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...stages];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    setDragId(null);
    await applyOrder(next);
  }

  return (
    <div className="site-sheet-backdrop" onClick={onClose}>
      <div
        className="site-sheet site-sheet-wide"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="site-sheet-head">
          <div>
            <div className="site-page-kicker">Manage stages</div>
            <h3>Project stages</h3>
          </div>
          <button type="button" className="site-btn site-btn-ghost" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="site-sheet-body">
          <section>
            <h4 className="site-section-title">Select common stages</h4>
            <p className="site-section-desc">
              Only checked stages are added. Nothing is forced.
            </p>
            <div className="site-stage-check-grid">
              {availablePresets.map((name) => {
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
              {!availablePresets.length ? (
                <p className="site-3d-empty">All common stages already added.</p>
              ) : null}
            </div>
            <SiteButton
              type="button"
              variant="accent"
              disabled={busy || !selectedPresets.length}
              onClick={addSelectedPresets}
              style={{ marginTop: 12 }}
            >
              Add selected ({selectedPresets.length})
            </SiteButton>
          </section>

          <hr className="site-divider" />

          <section>
            <h4 className="site-section-title">Add custom stage</h4>
            <form onSubmit={addCustom} className="site-stage-composer" style={{ marginBottom: 0, maxWidth: "none" }}>
              <SiteField label="Stage name">
                <SiteInput
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Feature wall installation"
                />
              </SiteField>
              <div className="site-stage-grid">
                <SiteField label="Expected start">
                  <SiteInput
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                  />
                </SiteField>
                <SiteField label="Expected end">
                  <SiteInput
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                  />
                </SiteField>
              </div>
              <label className="site-stage-check">
                <input
                  type="checkbox"
                  checked={customVisible}
                  onChange={(e) => setCustomVisible(e.target.checked)}
                />
                <span>Client visible</span>
              </label>
              <SiteField label="Internal note">
                <SiteTextarea
                  rows={2}
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                />
              </SiteField>
              <SiteButton type="submit" variant="soft" disabled={busy}>
                + Add custom stage
              </SiteButton>
            </form>
          </section>

          <hr className="site-divider" />

          <section>
            <h4 className="site-section-title">Current order</h4>
            {!stages.length ? (
              <p className="site-3d-empty">No stages added yet.</p>
            ) : (
              stages.map((stage, index) => (
                <div
                  key={stage.id}
                  className="site-manage-stage-row"
                  draggable
                  onDragStart={() => setDragId(stage.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDropOn(stage.id)}
                  onDragEnd={() => setDragId(null)}
                  data-dragging={dragId === stage.id}
                >
                  <div className="site-manage-stage-main">
                    <span className="site-manage-stage-index">{index + 1}</span>
                    {editingId === stage.id ? (
                      <SiteInput
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                      />
                    ) : (
                      <div>
                        <strong>{stage.name}</strong>
                        <div style={{ marginTop: 4 }}>
                          <ScheduleStatusPill status={stage.status} />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="site-manage-stage-actions">
                    <button type="button" className="site-chip" onClick={() => move(stage.id, -1)}>
                      <ArrowUp size={14} />
                    </button>
                    <button type="button" className="site-chip" onClick={() => move(stage.id, 1)}>
                      <ArrowDown size={14} />
                    </button>
                    <SiteSelect
                      value={stage.status}
                      onChange={async (e) => {
                        const status = e.target.value as ScheduleStatus;
                        const patch: Partial<ScheduleItem> = { status };
                        if (status === "ongoing" && !stage.actualStartDate) {
                          patch.actualStartDate = new Date().toISOString().slice(0, 10);
                        }
                        if (status === "completed") {
                          patch.actualEndDate = new Date().toISOString().slice(0, 10);
                        }
                        await updateScheduleItem(projectId, stage.id, patch, workspaceId);
                        await reload();
                      }}
                    >
                      <option value="not_started">Not started</option>
                      <option value="ongoing">Ongoing</option>
                      <option value="on_hold">On hold</option>
                      <option value="delayed">Delayed</option>
                      <option value="completed">Completed</option>
                    </SiteSelect>
                    <label className="site-stage-check">
                      <input
                        type="checkbox"
                        checked={stage.clientVisible !== false}
                        onChange={async (e) => {
                          await updateScheduleItem(projectId, stage.id, {
                            clientVisible: e.target.checked,
                          }, workspaceId);
                          await reload();
                        }}
                      />
                      <span>Client</span>
                    </label>
                    {editingId === stage.id ? (
                      <SiteButton
                        type="button"
                        variant="accent"
                        onClick={async () => {
                          await updateScheduleItem(projectId, stage.id, {
                            name: editName,
                          }, workspaceId);
                          setEditingId(null);
                          await reload();
                        }}
                      >
                        Save
                      </SiteButton>
                    ) : (
                      <button
                        type="button"
                        className="site-chip"
                        onClick={() => {
                          setEditingId(stage.id);
                          setEditName(stage.name);
                        }}
                      >
                        Rename
                      </button>
                    )}
                    <button
                      type="button"
                      className="site-chip"
                      onClick={async () => {
                        await deleteScheduleItem(projectId, stage.id, workspaceId);
                        await reload();
                      }}
                    >
                      Delete
                    </button>
                  </div>

                  <div className="site-stage-grid" style={{ marginTop: 10 }}>
                    <SiteField label="Expected start">
                      <SiteInput
                        type="date"
                        value={stage.plannedStartDate || ""}
                        onChange={async (e) => {
                          await updateScheduleItem(projectId, stage.id, {
                            plannedStartDate: e.target.value,
                          }, workspaceId);
                          await reload();
                        }}
                      />
                    </SiteField>
                    <SiteField label="Expected end">
                      <SiteInput
                        type="date"
                        value={stage.plannedEndDate || ""}
                        onChange={async (e) => {
                          await updateScheduleItem(projectId, stage.id, {
                            plannedEndDate: e.target.value,
                          }, workspaceId);
                          await reload();
                        }}
                      />
                    </SiteField>
                    <SiteField label="Actual start">
                      <SiteInput
                        type="date"
                        value={stage.actualStartDate || ""}
                        onChange={async (e) => {
                          await updateScheduleItem(projectId, stage.id, {
                            actualStartDate: e.target.value,
                          }, workspaceId);
                          await reload();
                        }}
                      />
                    </SiteField>
                    <SiteField label="Actual completion">
                      <SiteInput
                        type="date"
                        value={stage.actualEndDate || ""}
                        onChange={async (e) => {
                          await updateScheduleItem(projectId, stage.id, {
                            actualEndDate: e.target.value,
                          }, workspaceId);
                          await reload();
                        }}
                      />
                    </SiteField>
                  </div>
                </div>
              ))
            )}
          </section>

          {error ? (
            <p style={{ color: "var(--site-danger)", fontSize: 13 }}>{error}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
