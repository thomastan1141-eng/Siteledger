"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { JournalComposer } from "@/components/progress/journal-composer";
import { SitePageHeader, SiteSpinner } from "@/components/progress/primitives";
import { useAuth } from "@/lib/auth-context";
import { fetchProjectResolve } from "@/lib/services/projects";
import type { Project } from "@/lib/types";
import { getProjectDisplayName } from "@/lib/utils";

export default function DailyUpdatePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [canPublishToClient, setCanPublishToClient] = useState(false);
  const [canAddJournal, setCanAddJournal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.uid) return;
    // Server-resolved: creator OR ACTIVE membership, using the Project's
    // actual workspaceId — never the current USER's defaultWorkspaceId.
    fetchProjectResolve(id)
      .then((resolved) => {
        setProject(resolved?.project ?? null);
        const allowed =
          Boolean(resolved?.isOwner) ||
          resolved?.effectivePermissions?.addJournal === true;
        setCanAddJournal(allowed);
        // Same gate as the main Project page: creator, or a colleague whose
        // effectivePermissions grant publishMediaToClient AND the Project
        // allows staff publish. Never a bare allowStaffPublish check.
        setCanPublishToClient(
          Boolean(
            resolved &&
              (resolved.isOwner ||
                (resolved.memberType !== "CLIENT" &&
                  resolved.project.allowStaffPublish &&
                  resolved.effectivePermissions?.publishMediaToClient === true)),
          ),
        );
        if (resolved?.project && !allowed) {
          router.replace(`/projects/${id}?tab=journal`);
        }
      })
      .finally(() => setLoading(false));
  }, [id, profile?.uid, router]);

  if (loading) return <SiteSpinner />;
  if (!project) {
    return (
      <p style={{ color: "var(--site-text-secondary)" }}>Project not found.</p>
    );
  }
  if (!canAddJournal) return <SiteSpinner />;

  return (
    <div>
      <SitePageHeader
        kicker="Daily journal"
        title={getProjectDisplayName(project)}
        description="Select work, upload multiple photos or videos, then publish."
      />
      <JournalComposer
        project={project}
        canPublishToClient={canPublishToClient}
        onPublished={async () => {
          router.push(`/projects/${project.id}?tab=journal`);
        }}
      />
    </div>
  );
}
