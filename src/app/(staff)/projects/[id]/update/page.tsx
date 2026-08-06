"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { JournalComposer } from "@/components/progress/journal-composer";
import { SitePageHeader, SiteSpinner } from "@/components/progress/primitives";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { getProject, workspaceIdsForProfile } from "@/lib/services/projects";
import type { Project } from "@/lib/types";
import { getProjectDisplayName } from "@/lib/utils";

export default function DailyUpdatePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const { workspaceId } = useWorkspace();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tenant = workspaceIdsForProfile({
      defaultWorkspaceId:
        workspaceId || profile?.defaultWorkspaceId || profile?.companyId || "",
      companyId: profile?.companyId,
      sharedWorkspaceIds: profile?.sharedWorkspaceIds,
    });
    getProject(id, tenant)
      .then(setProject)
      .finally(() => setLoading(false));
  }, [id, workspaceId, profile]);

  if (loading) return <SiteSpinner />;
  if (!project) {
    return (
      <p style={{ color: "var(--site-text-secondary)" }}>Project not found.</p>
    );
  }

  return (
    <div>
      <SitePageHeader
        kicker="Daily journal"
        title={getProjectDisplayName(project)}
        description="Select work, upload multiple photos or videos, then publish."
      />
      <JournalComposer
        project={project}
        onPublished={async () => {
          router.push(`/projects/${project.id}?tab=journal`);
        }}
      />
    </div>
  );
}
