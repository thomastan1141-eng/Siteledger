"use client";

import { SecureBunnyPlayer } from "@/components/media/secure-bunny-player";
import { SecureStorageAsset } from "@/components/progress/media-grid";
import { SiteEmpty, SitePageHeader } from "@/components/progress/primitives";
import { useClientProject } from "@/lib/client-project";
import { formatDate } from "@/lib/utils";

export default function ClientVideosPage() {
  const { clientMedia, project } = useClientProject();
  const videos = clientMedia.filter((m) => m.type === "video");
  const workspaceId =
    project?.workspaceId || project?.companyId || "";

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
              {video.provider === "BUNNY_STREAM" ? (
                <SecureBunnyPlayer item={video} workspaceId={workspaceId} />
              ) : (
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "16 / 9",
                    background: "#111",
                    borderRadius: 12,
                    overflow: "hidden",
                  }}
                >
                  <SecureStorageAsset
                    item={video}
                    video
                    className="h-full w-full"
                  />
                </div>
              )}
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
                  {video.caption || video.title
                    ? ` — ${video.title || video.caption}`
                    : ""}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
