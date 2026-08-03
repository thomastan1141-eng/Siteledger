"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { JournalComposer } from "@/components/progress/journal-composer";
import { SitePageHeader, SiteSpinner } from "@/components/progress/primitives";
import { getProject } from "@/lib/services/projects";
import type { Project } from "@/lib/types";

export default function DailyUpdatePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProject(id)
      .then(setProject)
      .finally(() => setLoading(false));
  }, [id]);

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
        title={project.name}
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
