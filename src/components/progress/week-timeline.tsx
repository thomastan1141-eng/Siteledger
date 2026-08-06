"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from "lucide-react";
import {
  COMMON_STAGE_OPTIONS,
  DEFAULT_STAGE_BAR_COLOR,
  STAGE_BAR_COLORS,
  STAGE_BAR_COLOR_SWATCHES,
} from "@/lib/constants";
import {
  createScheduleItem,
  deleteScheduleItem,
  listSchedule,
  reorderStages,
  setAllBarColors,
  updateScheduleItem,
} from "@/lib/services/schedule";
import type { Project, ScheduleItem } from "@/lib/types";
import {
  dateKeyFromWeekEnd,
  dateKeyFromWeekIndex,
  getTimelineOrigin,
  weekIndexFromOrigin,
} from "@/lib/utils";

/** Bars without a saved barColor keep showing the original default grey. */
function barColorFor(stage: ScheduleItem) {
  return stage.barColor || DEFAULT_STAGE_BAR_COLOR;
}

const CUSTOM_VALUE = "__custom__";

type DragMode = "move" | "resize-start" | "resize-end";

type DragState = {
  stageId: string;
  mode: DragMode;
  startX: number;
  startY: number;
  originStart: number;
  originEnd: number;
  trackWidth: number;
  moved: boolean;
};

type Range = { start: number; end: number };

function stageRange(origin: string, stage: ScheduleItem): Range {
  const start =
    weekIndexFromOrigin(origin, stage.plannedStartDate) ??
    weekIndexFromOrigin(origin, stage.actualStartDate) ??
    0;
  const endRaw =
    weekIndexFromOrigin(origin, stage.plannedEndDate) ??
    weekIndexFromOrigin(origin, stage.actualEndDate) ??
    start;
  return { start, end: Math.max(start, endRaw) };
}

export function WeekTimeline({
  project,
  stages,
  editable = false,
  onChanged,
}: {
  project: Project;
  stages: ScheduleItem[];
  editable?: boolean;
  onChanged?: (stages: ScheduleItem[]) => void;
}) {
  const workspaceId = project.workspaceId || project.companyId;
  const [localStages, setLocalStages] = useState(stages);
  const [customEditingId, setCustomEditingId] = useState<string | null>(null);
  const [customName, setCustomName] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [colorPickerId, setColorPickerId] = useState<string | null>(null);
  const [applyingAllColor, setApplyingAllColor] = useState(false);
  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const liveRangeRef = useRef<Record<string, Range>>({});
  const [liveRange, setLiveRange] = useState<Record<string, Range>>({});
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLocalStages(stages);
  }, [stages]);

  useEffect(() => {
    if (!colorPickerId) return;
    function onDocPointerDown(e: PointerEvent) {
      const root = rootRef.current;
      if (!root) return;
      const target = e.target as Node;
      if (root.contains(target)) {
        const el = target as HTMLElement;
        if (
          el.closest(".site-week-timeline-color-pop") ||
          el.closest(".site-week-timeline-bar")
        ) {
          return;
        }
      }
      setColorPickerId(null);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [colorPickerId]);

  const origin = useMemo(
    () => getTimelineOrigin(project, localStages),
    [project, localStages],
  );
  const weeks = Array.from({ length: 12 }, (_, i) => i + 1);

  const refresh = useCallback(async () => {
    const next = await listSchedule(project.id, { workspaceId });
    setLocalStages(next);
    onChanged?.(next);
  }, [project.id, workspaceId, onChanged]);

  function setRangeFor(stageId: string, range: Range | null) {
    if (!range) {
      delete liveRangeRef.current[stageId];
    } else {
      liveRangeRef.current[stageId] = range;
    }
    setLiveRange({ ...liveRangeRef.current });
  }

  async function addStageRow() {
    if (!editable || adding) return;
    setAdding(true);
    try {
      const used = new Set(localStages.map((s) => s.name.toLowerCase()));
      const preset = COMMON_STAGE_OPTIONS.find(
        (name) => !used.has(name.toLowerCase()),
      );
      const name = preset || `Custom stage ${localStages.length + 1}`;
      const plannedStartDate = dateKeyFromWeekIndex(origin, 0);
      const plannedEndDate = dateKeyFromWeekEnd(origin, 0);
      const barColor =
        STAGE_BAR_COLORS[localStages.length % STAGE_BAR_COLORS.length].value;
      await createScheduleItem(
        project.id,
        {
          name,
          source: preset ? "preset" : "custom",
          plannedStartDate,
          plannedEndDate,
          status: "not_started",
          barColor,
          sortOrder: localStages.length,
        },
        workspaceId,
      );
      await refresh();
    } finally {
      setAdding(false);
    }
  }

  async function setBarColor(stage: ScheduleItem, barColor: string) {
    setSavingId(stage.id);
    try {
      await updateScheduleItem(
        project.id,
        stage.id,
        { barColor },
        workspaceId,
      );
      setLocalStages((prev) =>
        prev.map((s) => (s.id === stage.id ? { ...s, barColor } : s)),
      );
      setColorPickerId(null);
      await refresh();
    } finally {
      setSavingId(null);
    }
  }

  async function applyColorToAll(barColor: string) {
    if (!localStages.length) return;
    setApplyingAllColor(true);
    try {
      await setAllBarColors(
        project.id,
        localStages.map((s) => s.id),
        barColor,
        workspaceId,
      );
      setLocalStages((prev) => prev.map((s) => ({ ...s, barColor })));
      setColorPickerId(null);
      await refresh();
    } finally {
      setApplyingAllColor(false);
    }
  }

  async function renameStage(stage: ScheduleItem, nextName: string) {
    const name = nextName.trim();
    if (!name || name === stage.name) return;
    if (
      localStages.some(
        (s) =>
          s.id !== stage.id && s.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      return;
    }
    setSavingId(stage.id);
    try {
      const isPreset = (COMMON_STAGE_OPTIONS as readonly string[]).includes(
        name,
      );
      await updateScheduleItem(
        project.id,
        stage.id,
        {
          name,
          source: isPreset ? "preset" : "custom",
        },
        workspaceId,
      );
      await refresh();
    } finally {
      setSavingId(null);
    }
  }

  async function applyOrder(next: ScheduleItem[]) {
    setLocalStages(next);
    await reorderStages(
      project.id,
      next.map((s) => s.id),
      workspaceId,
    );
    await refresh();
  }

  async function moveStage(id: string, direction: -1 | 1) {
    const index = localStages.findIndex((s) => s.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= localStages.length) return;
    const next = [...localStages];
    const [row] = next.splice(index, 1);
    next.splice(target, 0, row);
    await applyOrder(next);
  }

  async function onDropOnRow(targetId: string) {
    const sourceId = dragRowId;
    setDragRowId(null);
    if (!sourceId || sourceId === targetId) return;
    const from = localStages.findIndex((s) => s.id === sourceId);
    const to = localStages.findIndex((s) => s.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...localStages];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    await applyOrder(next);
  }

  async function deleteStage(stage: ScheduleItem) {
    if (!editable) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete "${stage.name}"? This cannot be undone.`)
    ) {
      return;
    }
    setSavingId(stage.id);
    try {
      await deleteScheduleItem(project.id, stage.id, workspaceId);
      await refresh();
    } finally {
      setSavingId(null);
    }
  }

  async function persistRange(stageId: string, start: number, end: number) {
    const plannedStartDate = dateKeyFromWeekIndex(origin, start);
    const plannedEndDate = dateKeyFromWeekEnd(origin, end);
    setSavingId(stageId);
    try {
      await updateScheduleItem(
        project.id,
        stageId,
        {
          plannedStartDate,
          plannedEndDate,
        },
        workspaceId,
      );
      setLocalStages((prev) =>
        prev.map((s) =>
          s.id === stageId ? { ...s, plannedStartDate, plannedEndDate } : s,
        ),
      );
      await refresh();
    } finally {
      setSavingId(null);
      setRangeFor(stageId, null);
    }
  }

  function weekFromPointer(track: HTMLElement, clientX: number) {
    const rect = track.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width - 0.001);
    return Math.min(11, Math.max(0, Math.floor((x / rect.width) * 12)));
  }

  function onBarPointerDown(
    e: ReactPointerEvent<Element>,
    stage: ScheduleItem,
    mode: DragMode,
  ) {
    if (!editable) return;
    const track = (e.currentTarget as HTMLElement).closest(
      ".site-week-timeline-track",
    ) as HTMLElement | null;
    if (!track) return;
    e.preventDefault();
    e.stopPropagation();
    const { start, end } = stageRange(origin, stage);
    if (mode === "move") {
      setColorPickerId(null);
    }
    dragRef.current = {
      stageId: stage.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      originStart: start,
      originEnd: end,
      trackWidth: track.getBoundingClientRect().width || 1,
      moved: false,
    };
    setRangeFor(stage.id, { start, end });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onBarPointerMove(e: ReactPointerEvent<Element>) {
    const drag = dragRef.current;
    if (!drag) return;
    const track = (e.currentTarget as HTMLElement).closest(
      ".site-week-timeline-track",
    ) as HTMLElement | null;
    if (!track) return;

    const dist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
    if (dist > 5) drag.moved = true;

    const week = weekFromPointer(track, e.clientX);
    let start = drag.originStart;
    let end = drag.originEnd;

    if (drag.mode === "resize-start") {
      start = Math.min(week, end);
    } else if (drag.mode === "resize-end") {
      end = Math.max(week, start);
    } else {
      const deltaWeeks = Math.round(
        ((e.clientX - drag.startX) / drag.trackWidth) * 12,
      );
      const span = drag.originEnd - drag.originStart;
      start = drag.originStart + deltaWeeks;
      end = start + span;
      if (start < 0) {
        end -= start;
        start = 0;
      }
      if (end > 11) {
        start -= end - 11;
        end = 11;
      }
      start = Math.max(0, start);
      end = Math.min(11, end);
    }

    setRangeFor(drag.stageId, { start, end });
  }

  async function onBarPointerUp(e: ReactPointerEvent<Element>) {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const range = liveRangeRef.current[drag.stageId];
    if (!range) return;

    const unchanged =
      range.start === drag.originStart && range.end === drag.originEnd;

    if (unchanged) {
      setRangeFor(drag.stageId, null);
      if (drag.mode === "move" && !drag.moved) {
        setColorPickerId((id) =>
          id === drag.stageId ? null : drag.stageId,
        );
      }
      return;
    }
    setColorPickerId(null);
    await persistRange(drag.stageId, range.start, range.end);
  }

  return (
    <div className="site-week-timeline" ref={rootRef}>
      {editable ? (
        <p className="site-week-timeline-hint">
          Add stages as needed. Drag bars to move/resize; click a bar to change
          its color.
        </p>
      ) : null}

      <div className="site-week-timeline-header">
        <div className="site-week-timeline-name-spacer" aria-hidden />
        {weeks.map((week) => (
          <div key={week} className="site-week-timeline-col-label">
            Week {week}
          </div>
        ))}
      </div>

      {!localStages.length ? (
        <div className="site-empty" style={{ marginTop: 12 }}>
          <strong>No stages yet</strong>
          <p style={{ marginTop: 8 }}>
            Add stages one by one — there is no fixed limit.
          </p>
          {editable ? (
            <div style={{ marginTop: 14 }}>
              <button
                type="button"
                className="site-btn site-btn-accent"
                onClick={() => void addStageRow()}
                disabled={adding}
              >
                {adding ? "Adding…" : "+ Add stage"}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="site-week-timeline-body">
          {localStages.map((stage, rowIndex) => {
            const base = stageRange(origin, stage);
            const range = liveRange[stage.id] || base;
            const span = range.end - range.start + 1;
            const popBelow = rowIndex < 2;
            const usedNames = new Set(
              localStages
                .filter((s) => s.id !== stage.id)
                .map((s) => s.name.toLowerCase()),
            );
            const selectOptions = COMMON_STAGE_OPTIONS.filter(
              (name) => !usedNames.has(name.toLowerCase()),
            );
            const nameInPresets = (
              COMMON_STAGE_OPTIONS as readonly string[]
            ).includes(stage.name);
            const selectValue =
              customEditingId === stage.id
                ? CUSTOM_VALUE
                : nameInPresets
                  ? stage.name
                  : CUSTOM_VALUE;

            return (
              <div
                key={stage.id}
                className="site-week-timeline-row"
                data-row-dragging={dragRowId === stage.id}
                onDragOver={
                  editable ? (e: ReactDragEvent) => e.preventDefault() : undefined
                }
                onDrop={editable ? () => void onDropOnRow(stage.id) : undefined}
              >
                <div className="site-week-timeline-name">
                  {editable ? (
                    <>
                      <div className="site-week-timeline-name-row">
                        <div className="site-week-timeline-name-controls">
                          <span
                            className="site-week-timeline-drag-handle"
                            draggable
                            onDragStart={(e: ReactDragEvent) => {
                              e.stopPropagation();
                              setDragRowId(stage.id);
                            }}
                            onDragEnd={() => setDragRowId(null)}
                            title="Drag to reorder"
                            aria-label="Drag to reorder"
                          >
                            <GripVertical size={12} />
                          </span>
                          <button
                            type="button"
                            className="site-week-timeline-icon-btn"
                            onClick={() => void moveStage(stage.id, -1)}
                            disabled={rowIndex === 0 || savingId === stage.id}
                            title="Move up"
                            aria-label="Move up"
                          >
                            <ArrowUp size={12} />
                          </button>
                          <button
                            type="button"
                            className="site-week-timeline-icon-btn"
                            onClick={() => void moveStage(stage.id, 1)}
                            disabled={
                              rowIndex === localStages.length - 1 ||
                              savingId === stage.id
                            }
                            title="Move down"
                            aria-label="Move down"
                          >
                            <ArrowDown size={12} />
                          </button>
                          <button
                            type="button"
                            className="site-week-timeline-icon-btn site-week-timeline-icon-btn-danger"
                            onClick={() => void deleteStage(stage)}
                            disabled={savingId === stage.id}
                            title="Delete stage"
                            aria-label="Delete stage"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <select
                          className="site-week-timeline-select"
                          value={selectValue}
                          disabled={savingId === stage.id}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === CUSTOM_VALUE) {
                              setCustomEditingId(stage.id);
                              setCustomName(nameInPresets ? "" : stage.name);
                              return;
                            }
                            setCustomEditingId(null);
                            void renameStage(stage, value);
                          }}
                          aria-label="Stage"
                        >
                          {!nameInPresets && customEditingId !== stage.id ? (
                            <option value={CUSTOM_VALUE}>{stage.name}</option>
                          ) : null}
                          {selectOptions.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                          <option value={CUSTOM_VALUE}>Custom stage…</option>
                        </select>
                      </div>
                      {customEditingId === stage.id ? (
                        <div className="site-week-timeline-custom">
                          <input
                            className="site-input"
                            value={customName}
                            placeholder="Custom stage name"
                            onChange={(e) => setCustomName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void renameStage(stage, customName).then(() =>
                                  setCustomEditingId(null),
                                );
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="site-chip"
                            onClick={() => {
                              void renameStage(stage, customName).then(() =>
                                setCustomEditingId(null),
                              );
                            }}
                          >
                            Save
                          </button>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    stage.name
                  )}
                </div>

                <div className="site-week-timeline-track" data-editable={editable}>
                  <div
                    className="site-week-timeline-bar"
                    data-editable={editable}
                    data-dragging={Boolean(liveRange[stage.id])}
                    data-color-open={colorPickerId === stage.id}
                    style={{
                      gridColumn: `${range.start + 1} / span ${span}`,
                      background: barColorFor(stage),
                    }}
                    title={`${stage.name} · Week ${range.start + 1}–${range.end + 1}. Click to change color.`}
                    onPointerDown={
                      editable
                        ? (e) => onBarPointerDown(e, stage, "move")
                        : undefined
                    }
                    onPointerMove={editable ? onBarPointerMove : undefined}
                    onPointerUp={editable ? onBarPointerUp : undefined}
                    onPointerCancel={editable ? onBarPointerUp : undefined}
                  >
                    {editable ? (
                      <>
                        <span
                          className="site-week-timeline-handle site-week-timeline-handle-start"
                          onPointerDown={(e) =>
                            onBarPointerDown(e, stage, "resize-start")
                          }
                          aria-label="Resize start"
                        />
                        <span
                          className="site-week-timeline-handle site-week-timeline-handle-end"
                          onPointerDown={(e) =>
                            onBarPointerDown(e, stage, "resize-end")
                          }
                          aria-label="Resize end"
                        />
                      </>
                    ) : null}
                    {editable && colorPickerId === stage.id ? (
                      <div
                        className="site-week-timeline-color-pop"
                        data-placement={popBelow ? "below" : "above"}
                        onPointerDown={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-label="Bar color"
                      >
                        <span className="site-week-timeline-color-pop-label">
                          Color
                        </span>
                        <div className="site-week-timeline-color-pop-swatches">
                          {STAGE_BAR_COLOR_SWATCHES.map((swatch) => {
                            const active = barColorFor(stage) === swatch.value;
                            return (
                              <button
                                key={swatch.id}
                                type="button"
                                className="site-day-work-swatch"
                                data-active={active}
                                style={{ background: swatch.value }}
                                title={swatch.label}
                                aria-label={swatch.label}
                                aria-pressed={active}
                                disabled={savingId === stage.id || applyingAllColor}
                                onClick={() =>
                                  void setBarColor(stage, swatch.value)
                                }
                              />
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          className="site-chip site-week-timeline-color-pop-apply-all"
                          disabled={savingId === stage.id || applyingAllColor}
                          onClick={() =>
                            void applyColorToAll(barColorFor(stage))
                          }
                        >
                          {applyingAllColor
                            ? "Applying to all bars…"
                            : "Apply to all bars"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
          {editable ? (
            <div className="site-week-timeline-add-row">
              <button
                type="button"
                className="site-day-work-add"
                onClick={() => void addStageRow()}
                disabled={adding}
              >
                {adding ? "Adding…" : "+ Add stage"}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
