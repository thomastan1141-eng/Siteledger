"use client";

import type { DailyUpdate, MediaItem } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { ProgressMediaGrid } from "./media-grid";
import { SiteEmpty, SitePill } from "./primitives";

export function ProgressTimeline({
  groups,
  mediaByUpdate,
  allowDownload = false,
}: {
  groups: Array<{ date: string; items: DailyUpdate[] }>;
  mediaByUpdate: Record<string, MediaItem[]>;
  allowDownload?: boolean;
}) {
  if (!groups.length) {
    return (
      <SiteEmpty
        title="Journal is empty"
        description="Client-visible site updates will form the project story here."
      />
    );
  }

  return (
    <div className="site-timeline">
      {groups.map(({ date, items }) => {
        const work = Array.from(
          new Set(items.flatMap((u) => [...u.workItems, ...u.customActivities])),
        );
        const media = items.flatMap((u) => mediaByUpdate[u.id] || []);
        const photos = media.filter((m) => m.type === "photo").length;
        const videos = media.filter((m) => m.type === "video").length;
        const notes = items.map((u) => u.note).filter(Boolean);

        return (
          <article key={date} className="site-timeline-item">
            <div className="site-timeline-date">
              {formatDate(date, "d MMM")}
            </div>
            <div className="site-timeline-body">
              <h3>On site</h3>
              {work.length ? (
                <ul className="site-work-list">
                  {work.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : items.some((i) => i.noWorkToday) ? (
                <p style={{ color: "var(--site-text-secondary)", fontSize: 14 }}>
                  No work today
                </p>
              ) : null}

              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <SitePill>{photos} photos</SitePill>
                <SitePill>{videos} videos</SitePill>
              </div>

              {notes.map((note, i) => (
                <p
                  key={`${date}-note-${i}`}
                  style={{
                    margin: "0 0 14px",
                    fontSize: 15,
                    lineHeight: 1.55,
                    color: "var(--site-text)",
                    maxWidth: "52ch",
                  }}
                >
                  {note}
                </p>
              ))}

              <ProgressMediaGrid items={media} allowDownload={allowDownload} />
            </div>
          </article>
        );
      })}
    </div>
  );
}
