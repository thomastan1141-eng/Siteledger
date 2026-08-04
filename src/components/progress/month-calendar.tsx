"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  DEFAULT_WORK_ITEM_COLOR,
  WORK_ITEM_COLORS,
} from "@/lib/constants";
import {
  getDailyPlan,
  listDailyPlans,
  saveDailyPlan,
} from "@/lib/services/daily-plans";
import type { DailyPlan, DailyPlanWorkItem, ScheduleItem } from "@/lib/types";
import {
  buildMonthGrid,
  singaporeDateKey,
  singaporeYearMonth,
} from "@/lib/utils";
import {
  SiteButton,
  SiteField,
  SiteInput,
  SiteSelect,
  SiteTextarea,
} from "./primitives";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_WORK_ITEMS = 4;

export function MonthWorkCalendar({
  projectId,
  workspaceId,
  stages: _stages,
  editable = true,
  clientVisibleOnly = false,
}: {
  projectId: string;
  workspaceId?: string;
  stages: ScheduleItem[];
  editable?: boolean;
  clientVisibleOnly?: boolean;
}) {
  const today = singaporeDateKey();
  const initial = singaporeYearMonth();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [plans, setPlans] = useState<DailyPlan[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    try {
      setPlans(
        await listDailyPlans(projectId, { year, month, workspaceId }),
      );
    } catch (err) {
      console.error("[MonthWorkCalendar]", err);
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, [projectId, year, month]);

  const planByDate = useMemo(() => {
    const map = new Map<string, DailyPlan>();
    plans.forEach((p) => {
      if (!p.items?.length && clientVisibleOnly) return;
      map.set(p.date, p);
    });
    return map;
  }, [plans, clientVisibleOnly]);

  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const monthLabel = new Date(year, month - 1, 1).toLocaleString("en-SG", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Singapore",
  });

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  function goToday() {
    const t = singaporeYearMonth();
    setYear(t.year);
    setMonth(t.month);
    setSelectedDate(today);
  }

  return (
    <div className="site-month-calendar">
      <div className="site-month-calendar-toolbar">
        <SiteButton type="button" variant="ghost" onClick={() => shiftMonth(-1)}>
          <ChevronLeft size={16} /> Previous
        </SiteButton>
        <div className="site-month-calendar-title">
          <SiteSelect
            value={String(month)}
            onChange={(e) => setMonth(Number(e.target.value))}
            aria-label="Month"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(2000, i, 1).toLocaleString("en-SG", { month: "long" })}
              </option>
            ))}
          </SiteSelect>
          <SiteSelect
            value={String(year)}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label="Year"
          >
            {Array.from({ length: 8 }, (_, i) => year - 3 + i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </SiteSelect>
          <strong>{monthLabel}</strong>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <SiteButton type="button" variant="soft" onClick={goToday}>
            Today
          </SiteButton>
          <SiteButton type="button" variant="ghost" onClick={() => shiftMonth(1)}>
            Next <ChevronRight size={16} />
          </SiteButton>
        </div>
      </div>

      <div className="site-month-grid">
        {WEEKDAYS.map((d) => (
          <div key={d} className="site-month-weekday">
            {d}
          </div>
        ))}
        {cells.map((cell) => {
          const plan = planByDate.get(cell.key);
          const isToday = cell.key === today;
          return (
            <button
              key={cell.key}
              type="button"
              className="site-month-day"
              data-in-month={cell.inMonth}
              data-today={isToday}
              data-has-plan={Boolean(plan?.items?.length)}
              onClick={() => {
                if (!cell.inMonth) {
                  setYear(cell.date.getFullYear());
                  setMonth(cell.date.getMonth() + 1);
                }
                setSelectedDate(cell.key);
              }}
            >
              <span className="site-month-day-num">{cell.day}</span>
              {plan?.items?.slice(0, MAX_WORK_ITEMS).map((item, index) => (
                <span
                  key={`${cell.key}-${index}`}
                  className="site-month-day-item"
                  style={{ color: item.color || DEFAULT_WORK_ITEM_COLOR }}
                >
                  {item.workText}
                </span>
              ))}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="site-3d-empty" style={{ marginTop: 10 }}>
          Loading calendar…
        </p>
      ) : null}

      {selectedDate ? (
        <DayPlanSheet
          projectId={projectId}
          workspaceId={workspaceId}
          date={selectedDate}
          editable={editable}
          onClose={() => setSelectedDate(null)}
          onSaved={async () => {
            await reload();
            setSelectedDate(null);
          }}
        />
      ) : null}
    </div>
  );
}

function DayPlanSheet({
  projectId,
  workspaceId,
  date,
  editable,
  onClose,
  onSaved,
}: {
  projectId: string;
  workspaceId?: string;
  date: string;
  editable: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [items, setItems] = useState<DailyPlanWorkItem[]>([
    { workText: "", color: DEFAULT_WORK_ITEM_COLOR },
  ]);
  const [reminder, setReminder] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getDailyPlan(projectId, date, workspaceId).then((plan) => {
      const loaded = (plan?.items || [])
        .map((item) => ({
          workText: item.workText || "",
          color: item.color || DEFAULT_WORK_ITEM_COLOR,
        }))
        .filter((item) => item.workText)
        .slice(0, MAX_WORK_ITEMS);
      setItems(
        loaded.length
          ? loaded
          : [{ workText: "", color: DEFAULT_WORK_ITEM_COLOR }],
      );
      setReminder(plan?.reminder || "");
      setNote(plan?.note || "");
    });
  }, [projectId, date, workspaceId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editable) return;
    setBusy(true);
    setError("");
    try {
      await saveDailyPlan({
        projectId,
        date,
        items,
        reminder,
        note,
        workspaceId,
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function updateItem(
    index: number,
    patch: Partial<Pick<DailyPlanWorkItem, "workText" | "color">>,
  ) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function addItem() {
    if (items.length >= MAX_WORK_ITEMS) return;
    setItems((prev) => [
      ...prev,
      { workText: "", color: DEFAULT_WORK_ITEM_COLOR },
    ]);
  }

  function removeItem(index: number) {
    setItems((prev) => {
      if (prev.length <= 1) {
        return [{ workText: "", color: DEFAULT_WORK_ITEM_COLOR }];
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  return (
    <div className="site-sheet-backdrop" onClick={onClose}>
      <div
        className="site-sheet site-day-plan-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="site-sheet-head">
          <div>
            <div className="site-page-kicker">Daily plan</div>
            <h3>{date}</h3>
          </div>
          <SiteButton type="button" variant="ghost" onClick={onClose}>
            Close
          </SiteButton>
        </div>

        <form onSubmit={onSubmit} className="site-sheet-body">
          {items.map((item, index) => (
            <div key={index} className="site-day-work-block">
              <div className="site-day-work-head">
                <label className="site-day-work-label">
                  Work item {index + 1}
                  {index > 0 ? " (optional)" : ""}
                </label>
                {editable && items.length > 1 ? (
                  <button
                    type="button"
                    className="site-day-work-remove"
                    onClick={() => removeItem(index)}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <SiteInput
                value={item.workText}
                onChange={(e) => updateItem(index, { workText: e.target.value })}
                disabled={!editable}
                placeholder="e.g. Electrical cabling"
                style={{ color: item.color || DEFAULT_WORK_ITEM_COLOR }}
              />
              <div className="site-day-work-colors">
                <span className="site-day-work-colors-label">Font color</span>
                <div className="site-day-work-swatches" role="group" aria-label="Font color">
                  {WORK_ITEM_COLORS.map((swatch) => {
                    const active =
                      (item.color || DEFAULT_WORK_ITEM_COLOR) === swatch.value;
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
                        disabled={!editable}
                        onClick={() => updateItem(index, { color: swatch.value })}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          ))}

          {editable && items.length < MAX_WORK_ITEMS ? (
            <button
              type="button"
              className="site-day-work-add"
              onClick={addItem}
            >
              + Add work item {items.length + 1}
            </button>
          ) : null}

          <SiteField label="Reminder (optional)">
            <SiteInput
              value={reminder}
              onChange={(e) => setReminder(e.target.value)}
              disabled={!editable}
              placeholder="Tile delivery"
            />
          </SiteField>
          <SiteField label="Note (optional)">
            <SiteTextarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={!editable}
            />
          </SiteField>
          {error ? (
            <p style={{ color: "var(--site-danger)", fontSize: 13 }}>{error}</p>
          ) : null}
          {editable ? (
            <SiteButton type="submit" variant="accent" disabled={busy}>
              {busy ? "Saving…" : "Save day plan"}
            </SiteButton>
          ) : null}
        </form>
      </div>
    </div>
  );
}
