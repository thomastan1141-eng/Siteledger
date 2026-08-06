"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ManageStagesDialog } from "@/components/progress/manage-stages";
import { MonthWorkCalendar } from "@/components/progress/month-calendar";
import {
  SiteButton,
  SitePageHeader,
  SiteSection,
  SiteSpinner,
} from "@/components/progress/primitives";
import { WeekTimeline } from "@/components/progress/week-timeline";
import { useAuth } from "@/lib/auth-context";
import { usePageWidth } from "@/lib/page-width";
import { useWorkspace } from "@/lib/workspace-context";
import { getProject, workspaceIdsForProfile } from "@/lib/services/projects";
import { listSchedule, summarizeSchedule } from "@/lib/services/schedule";
import type { Project, ScheduleItem } from "@/lib/types";
import { getProjectDisplayName } from "@/lib/utils";

/**
 * Kept for deep links / bookmarks. Primary schedule entry is Project Overview.
 */
export default function SchedulePage() {
  usePageWidth("wide");
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const { workspaceId } = useWorkspace();
  const [project, setProject] = useState<Project | null>(null);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [manageOpen, setManageOpen] = useState(false);

  useEffect(() => {
    const tenant = workspaceIdsForProfile({
      defaultWorkspaceId:
        workspaceId || profile?.defaultWorkspaceId || profile?.companyId || "",
      companyId: profile?.companyId,
      sharedWorkspaceIds: profile?.sharedWorkspaceIds,
    });
    Promise.all([
      getProject(id, tenant),
      // schedule uses resolved project workspace after load
      Promise.resolve([] as ScheduleItem[]),
    ])
      .then(async ([p]) => {
        setProject(p);
        if (!p) {
          setSchedule([]);
          return;
        }
        const ws = p.workspaceId || p.companyId || tenant[0];
        setSchedule(await listSchedule(id, { workspaceId: ws }));
      })
      .finally(() => setLoading(false));
  }, [id, workspaceId, profile]);

  if (loading) return <SiteSpinner />;
  if (!project) {
    return <p style={{ color: "var(--site-text-secondary)" }}>Project not found.</p>;
  }

  const summary = summarizeSchedule(schedule);

  return (
    <div>
      <SitePageHeader
        kicker={getProjectDisplayName(project)}
        title="Project schedule"
        description="Same timeline and monthly calendar as Overview. Prefer Overview for day-to-day viewing."
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <SiteButton href={`/projects/${project.id}`} variant="ghost">
              Back to overview
            </SiteButton>
            <SiteButton
              type="button"
              variant="accent"
              onClick={() => setManageOpen(true)}
            >
              Manage stages
            </SiteButton>
          </div>
        }
      />

      <SiteSection title="12-week timeline">
        <WeekTimeline
          project={project}
          stages={summary.ordered}
          editable
          onChanged={setSchedule}
        />
      </SiteSection>

      <SiteSection title="Monthly work calendar">
        <MonthWorkCalendar
          projectId={project.id}
          workspaceId={project.workspaceId || workspaceId || undefined}
          stages={summary.ordered}
          editable
        />
      </SiteSection>

      <ManageStagesDialog
        projectId={project.id}
        workspaceId={project.workspaceId || workspaceId || undefined}
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        onChanged={setSchedule}
      />
    </div>
  );
}
