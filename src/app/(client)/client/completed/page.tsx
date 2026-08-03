"use client";

import { SitePageHeader, SiteSection } from "@/components/progress/primitives";
import { ScheduleStatusPill } from "@/components/progress/status";
import { useClientProject } from "@/lib/client-project";
import { formatDate } from "@/lib/utils";

export default function ClientCompletedPage() {
  const { schedule, summary } = useClientProject();

  return (
    <div>
      <SitePageHeader
        kicker="Stages"
        title="Work completed"
        description="Finished stages and what is still underway."
      />

      <SiteSection title="Completed">
        {!summary.completed.length ? (
          <p style={{ color: "var(--site-text-secondary)", fontSize: 14 }}>
            No stages marked completed yet.
          </p>
        ) : (
          summary.completed.map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                padding: "14px 0",
                borderBottom: "1px solid var(--site-border)",
              }}
            >
              <div>
                <div style={{ fontWeight: 650 }}>{item.name}</div>
                <div style={{ fontSize: 13, color: "var(--site-text-secondary)" }}>
                  Completed {formatDate(item.actualEndDate)}
                </div>
              </div>
              <ScheduleStatusPill status={item.status} />
            </div>
          ))
        )}
      </SiteSection>

      <SiteSection title="Currently ongoing">
        {!summary.ongoing.length ? (
          <p style={{ color: "var(--site-text-secondary)", fontSize: 14 }}>
            No ongoing work listed.
          </p>
        ) : (
          summary.ongoing.map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                padding: "14px 0",
                borderBottom: "1px solid var(--site-border)",
              }}
            >
              <div>
                <div style={{ fontWeight: 650 }}>{item.name}</div>
                <div style={{ fontSize: 13, color: "var(--site-text-secondary)" }}>
                  Started {formatDate(item.actualStartDate)}
                </div>
              </div>
              <ScheduleStatusPill status={item.status} />
            </div>
          ))
        )}
      </SiteSection>

      <SiteSection title="All stages">
        {schedule.map((item) => (
          <div
            key={item.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              padding: "12px 0",
              borderBottom: "1px solid var(--site-border)",
            }}
          >
            <span style={{ fontSize: 14 }}>{item.name}</span>
            <ScheduleStatusPill status={item.status} />
          </div>
        ))}
      </SiteSection>
    </div>
  );
}
