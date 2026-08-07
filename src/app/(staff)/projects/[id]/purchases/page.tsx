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
import { fetchProjectResolve } from "@/lib/services/projects";
import type { ColleaguePermissions, Project } from "@/lib/types";

export default function ProjectPurchasesPage() {
  usePageWidth("data");
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [access, setAccess] = useState<{
    isOwner: boolean;
    effectivePermissions: ColleaguePermissions | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.uid) return;
    // Server-resolved: creator OR ACTIVE membership, using the Project's
    // actual workspaceId — never the current USER's defaultWorkspaceId.
    fetchProjectResolve(id)
      .then((resolved) => {
        setProject(resolved?.project ?? null);
        setAccess(
          resolved
            ? {
                isOwner: resolved.isOwner,
                effectivePermissions: resolved.effectivePermissions,
              }
            : null,
        );
      })
      .finally(() => setLoading(false));
  }, [id, profile?.uid]);

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
      <PurchasesPanel
        project={project}
        onProjectUpdated={setProject}
        access={access}
      />
    </div>
  );
}
