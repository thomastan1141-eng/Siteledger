"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  ProjectChrome,
  ProjectChromeActions,
} from "@/components/progress/project-chrome";
import { PurchasesPanel } from "@/components/progress/purchases-panel";
import { SiteSpinner } from "@/components/progress/primitives";
import { useAuth } from "@/lib/auth-context";
import { usePageWidth } from "@/lib/page-width";
import { useWorkspace } from "@/lib/workspace-context";
import { getProject, workspaceIdsForProfile } from "@/lib/services/projects";
import type { Project } from "@/lib/types";

export default function ProjectPurchasesPage() {
  usePageWidth("data");
  const { id } = useParams<{ id: string }>();
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
      <ProjectChrome
        project={project}
        activeTab="purchases"
        actions={<ProjectChromeActions projectId={project.id} />}
      />
      <PurchasesPanel project={project} onProjectUpdated={setProject} />
    </div>
  );
}
