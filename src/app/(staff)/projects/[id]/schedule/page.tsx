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
import { fetchProjectResolve } from "@/lib/services/projects";
import { listSchedule, summarizeSchedule } from "@/lib/services/schedule";
import type { ColleaguePermissions, Project, ScheduleItem } from "@/lib/types";
import { getProjectDisplayName } from "@/lib/utils";

/**
 * Kept for deep links / bookmarks. Primary schedule entry is Project Overview.
 */
export default function SchedulePage() {
  usePageWidth("wide");
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [manageOpen, setManageOpen] = useState(false);
  const [access, setAccess] = useState<{
    isOwner: boolean;
    memberType: string | null;
    effectivePermissions: ColleaguePermissions | null;
  }>({
    isOwner: false,
    memberType: null,
    effectivePermissions: null,
  });

  useEffect(() => {
    if (!profile?.uid) return;
    // Server-resolved: creator OR ACTIVE membership, using the Project's
    // actual workspaceId — never the current USER's defaultWorkspaceId.
    fetchProjectResolve(id)
      .then(async (resolved) => {
        const p = resolved?.project ?? null;
        const memberType = resolved?.memberType ?? null;
        const clientOnly = memberType === "CLIENT";
        setAccess({
          isOwner: Boolean(resolved?.isOwner),
          memberType,
          effectivePermissions: resolved?.effectivePermissions ?? null,
        });
        setProject(p);
        if (!p || !resolved?.workspaceId) {
          setSchedule([]);
          return;
        }
        try {
          setSchedule(
            await listSchedule(id, {
              workspaceId: resolved.workspaceId,
              clientOnly,
            }),
          );
        } catch (err) {
          console.error("[schedule page]", err);
          setSchedule([]);
        }
      })
      .finally(() => setLoading(false));
  }, [id, profile?.uid]);

  if (loading) return <SiteSpinner />;
  if (!project) {
    return <p style={{ color: "var(--site-text-secondary)" }}>Project not found.</p>;
  }

  const summary = summarizeSchedule(schedule);
  const canEditSchedule =
    access.isOwner || access.effectivePermissions?.updateSchedule === true;
  const isClientMember = access.memberType === "CLIENT";

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
            {canEditSchedule ? (
              <SiteButton
                type="button"
                variant="accent"
                onClick={() => setManageOpen(true)}
              >
                Manage stages
              </SiteButton>
            ) : null}
          </div>
        }
      />

      <SiteSection title="12-week timeline">
        <WeekTimeline
          project={project}
          stages={summary.ordered}
          editable={canEditSchedule}
          onChanged={setSchedule}
        />
      </SiteSection>

      <SiteSection title="Monthly work calendar">
        <MonthWorkCalendar
          projectId={project.id}
          workspaceId={project.workspaceId}
          stages={summary.ordered}
          editable={canEditSchedule}
          clientVisibleOnly={isClientMember}
        />
      </SiteSection>

      {canEditSchedule ? (
        <ManageStagesDialog
          projectId={project.id}
          workspaceId={project.workspaceId}
          open={manageOpen}
          onClose={() => setManageOpen(false)}
          onChanged={setSchedule}
        />
      ) : null}
    </div>
  );
}
