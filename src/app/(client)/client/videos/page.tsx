"use client";

import { SiteEmpty, SitePageHeader } from "@/components/progress/primitives";
import { useClientProject } from "@/lib/client-project";
import { formatDate } from "@/lib/utils";

export default function ClientVideosPage() {
  const { clientMedia } = useClientProject();
  const videos = clientMedia.filter((m) => m.type === "video");

  return (
    <div>
      <SitePageHeader
        kicker="Gallery"
        title="Videos"
        description="Tap play to watch. Nothing autoplays."
      />

      {!videos.length ? (
        <SiteEmpty title="No videos yet" />
      ) : (
        <div style={{ display: "grid", gap: 24 }}>
          {videos.map((video) => (
            <article key={video.id}>
              <video
                src={video.downloadUrl}
                controls
                playsInline
                preload="metadata"
                style={{
                  width: "100%",
                  aspectRatio: "16 / 9",
                  background: "#111",
                  borderRadius: 12,
                }}
              />
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 650 }}>{formatDate(video.date)}</div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 13,
                    color: "var(--site-text-secondary)",
                  }}
                >
                  {video.workItems.join(" · ") || "Site update"}
                  {video.caption ? ` — ${video.caption}` : ""}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
