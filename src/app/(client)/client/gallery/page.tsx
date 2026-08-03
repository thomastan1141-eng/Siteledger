"use client";

import { useMemo, useState } from "react";
import { SitePageHeader } from "@/components/progress/primitives";
import { ProgressMediaGrid } from "@/components/progress/media-grid";
import { useClientProject } from "@/lib/client-project";

const FILTERS = [
  "All",
  "Tiling",
  "Electrical",
  "Plumbing",
  "Ceiling",
  "Painting",
  "Carpentry",
  "Handover",
];

export default function ClientGalleryPage() {
  const { project, clientMedia } = useClientProject();
  const [filter, setFilter] = useState("All");

  const photos = useMemo(() => {
    const onlyPhotos = clientMedia.filter((m) => m.type === "photo");
    if (filter === "All") return onlyPhotos;
    if (filter === "Handover") {
      return onlyPhotos.filter((m) => m.visibility === "handover");
    }
    return onlyPhotos.filter((m) =>
      m.workItems.some((w) => w.toLowerCase().includes(filter.toLowerCase())),
    );
  }, [clientMedia, filter]);

  return (
    <div>
      <SitePageHeader
        kicker="Gallery"
        title="Photos"
        description="Browse the site archive by trade or handover."
      />

      <div className="site-filter-rail">
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            className="site-chip"
            data-active={filter === item}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <ProgressMediaGrid
        items={photos}
        allowDownload={project.allowClientDownload}
      />
    </div>
  );
}
