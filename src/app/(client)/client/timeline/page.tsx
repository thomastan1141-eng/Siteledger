"use client";

import { SitePageHeader } from "@/components/progress/primitives";
import { ProgressTimeline } from "@/components/progress/timeline";
import { useClientProject } from "@/lib/client-project";
import { getProjectDisplayName } from "@/lib/utils";

export default function ClientTimelinePage() {
  const { project, timelineGroups, mediaByUpdate } = useClientProject();

  return (
    <div>
      <SitePageHeader
        kicker="Site journal"
        title="Progress story"
        description={`Follow the renovation day by day for ${getProjectDisplayName(project)}.`}
      />
      <ProgressTimeline
        groups={timelineGroups}
        mediaByUpdate={mediaByUpdate}
        allowDownload={project.allowClientDownload}
      />
    </div>
  );
}
