"use client";

import { useEffect, useMemo, useState } from "react";
import {
  SitePageHeader,
  SiteSection,
} from "@/components/progress/primitives";
import { ProgressMediaGrid } from "@/components/progress/media-grid";
import { MonthWorkCalendar } from "@/components/progress/month-calendar";
import {
  getOverviewDisplayImage,
  Overview3DPanel,
} from "@/components/progress/overview-3d";
import {
  ForecastPill,
  ProjectStatusPill,
  ScheduleStatusPill,
} from "@/components/progress/status";
import { useClientProject } from "@/lib/client-project";
import { listClientVisiblePlans } from "@/lib/services/daily-plans";
import type { DailyPlan } from "@/lib/types";
import { formatDate, formatDateTime, getProjectDisplayName, singaporeDateKey } from "@/lib/utils";

export default function ClientOverviewPage() {
  const { project, summary, clientMedia } = useClientProject();
  const latest = clientMedia.slice(0, 8);
  const [upcoming, setUpcoming] = useState<DailyPlan[]>([]);

  useEffect(() => {
    listClientVisiblePlans(project.id).then((plans) => {
      const today = singaporeDateKey();
      setUpcoming(plans.filter((p) => p.date >= today).slice(0, 6));
    });
  }, [project.id]);

  const ordered = useMemo(() => summary.ordered, [summary.ordered]);

  return (
    <div>
      <SitePageHeader
        kicker="Project overview"
        title={getProjectDisplayName(project)}
        description={project.address}
      />

      <div className="site-hero-panel">
        <div className="site-hero-visual">
          {getOverviewDisplayImage(project) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={getOverviewDisplayImage(project)}
              alt={getProjectDisplayName(project)}
            />
          ) : null}
          <div className="site-hero-visual-copy">
            <h2>{project.clientName}</h2>
            <p style={{ margin: "8px 0 0", opacity: 0.85 }}>
              Forecast completion {formatDate(project.forecastCompletionDate)}
            </p>
          </div>
        </div>
        <div className="site-stat-rail">
          <div className="site-stat">
            <span>Status</span>
            <div style={{ marginTop: 10 }}>
              <ProjectStatusPill status={project.status} />
            </div>
          </div>
          <div className="site-stat">
            <span>Schedule health</span>
            <div style={{ marginTop: 10 }}>
              <ForecastPill status={project.forecastStatus} />
            </div>
          </div>
          <div className="site-stat">
            <span>Current work</span>
            <strong style={{ fontSize: 16 }}>
              {summary.ongoing.map((i) => i.name).join(", ") || "—"}
            </strong>
          </div>
          <div className="site-stat">
            <span>Completed stages</span>
            <strong>{summary.completed.length}</strong>
          </div>
        </div>
      </div>

      <SiteSection title="Current progress">
        <div
          style={{
            display: "grid",
            gap: 1,
            background: "var(--site-border)",
            border: "1px solid var(--site-border)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {[
            [
              "Current work",
              summary.ongoing.map((i) => i.name).join(", ") || "—",
            ],
            [
              "Completed stages",
              String(summary.completed.length),
            ],
            [
              "Next stage",
              summary.next?.name || "All planned stages completed",
            ],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{ background: "var(--site-surface)", padding: "16px 18px" }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--site-text-light)",
                }}
              >
                {label}
              </div>
              <div style={{ marginTop: 8, fontSize: 16, fontWeight: 600 }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      </SiteSection>

      <SiteSection
        title="Stage list"
        description="Client-visible stages for this project only."
      >
        {!ordered.length ? (
          <p className="site-3d-empty">No stages shared yet.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {ordered.map((item) => (
              <li
                key={item.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                  padding: "12px 0",
                  borderBottom: "1px solid var(--site-border)",
                }}
              >
                <span>{item.name}</span>
                <ScheduleStatusPill status={item.status} />
              </li>
            ))}
          </ul>
        )}
      </SiteSection>

      <SiteSection
        title="Upcoming site days"
        description="Client-visible calendar items only."
      >
        {!upcoming.length ? (
          <p className="site-3d-empty">No upcoming shared days yet.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {upcoming.map((plan) => (
              <li
                key={plan.id}
                style={{
                  padding: "12px 0",
                  borderBottom: "1px solid var(--site-border)",
                }}
              >
                <strong>{formatDate(plan.date)}</strong>
                <div style={{ marginTop: 6, color: "var(--site-text-secondary)" }}>
                  {plan.items.map((i) => i.workText).join(" · ")}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div style={{ marginTop: 18 }}>
          <MonthWorkCalendar
            projectId={project.id}
            stages={ordered}
            editable={false}
            clientVisibleOnly
          />
        </div>
      </SiteSection>

      <Overview3DPanel project={project} editable={false} />

      <SiteSection
        title="Latest from site"
        description="Most recent client-visible photos and videos."
      >
        <ProgressMediaGrid
          items={latest}
          allowDownload={project.allowClientDownload}
        />
      </SiteSection>

      <p
        style={{
          fontSize: 12,
          color: "var(--site-text-light)",
          marginTop: 8,
        }}
      >
        Last update{" "}
        {formatDateTime(project.lastClientUpdateAt || project.lastUpdateAt)}
      </p>
    </div>
  );
}
