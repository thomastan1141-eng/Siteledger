"use client";

import { useEffect, useState } from "react";
import type { DailyUpdate, MediaItem } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { ProgressMediaGrid, type MediaGridSize } from "./media-grid";
import { SiteEmpty, SitePill } from "./primitives";

const PHOTO_SIZE_KEY = "siteledger.journalPhotoSize";
const PHOTO_SIZES: MediaGridSize[] = ["small", "medium", "large"];
const PHOTO_SIZE_LABELS: Record<MediaGridSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};

function readStoredPhotoSize(): MediaGridSize {
  if (typeof window === "undefined") return "small";
  const stored = window.localStorage.getItem(PHOTO_SIZE_KEY);
  return stored === "medium" || stored === "large" ? stored : "small";
}

export function ProgressTimeline({
  groups,
  mediaByUpdate,
  mediaByDate,
  allowDownload = false,
  workspaceId,
  canDelete = false,
  canManageVisibility = false,
  onMediaChanged,
  emptyTitle = "Journal is empty",
  emptyDescription = "Client-visible site updates will form the project story here.",
}: {
  groups: Array<{ date: string; items: DailyUpdate[] }>;
  mediaByUpdate: Record<string, MediaItem[]>;
  /** When set (CLIENT Journey), attach media by capture date instead of updateId. */
  mediaByDate?: Record<string, MediaItem[]>;
  allowDownload?: boolean;
  workspaceId?: string;
  canDelete?: boolean;
  canManageVisibility?: boolean;
  onMediaChanged?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const [photoSize, setPhotoSize] = useState<MediaGridSize>(() =>
    readStoredPhotoSize(),
  );

  useEffect(() => {
    window.localStorage.setItem(PHOTO_SIZE_KEY, photoSize);
  }, [photoSize]);

  if (!groups.length) {
    return (
      <SiteEmpty
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <div className="site-timeline">
      <div className="site-timeline-size-toggle" role="group" aria-label="Photo thumbnail size">
        <span className="site-timeline-size-label">Photo size</span>
        {PHOTO_SIZES.map((s) => (
          <button
            key={s}
            type="button"
            className="site-chip"
            data-active={photoSize === s}
            onClick={() => setPhotoSize(s)}
          >
            {PHOTO_SIZE_LABELS[s]}
          </button>
        ))}
      </div>
      {groups.map(({ date, items }) => {
        const work = Array.from(
          new Set(items.flatMap((u) => [...u.workItems, ...u.customActivities])),
        );
        const media = mediaByDate
          ? mediaByDate[date] || []
          : items.flatMap((u) => mediaByUpdate[u.id] || []);
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

              <ProgressMediaGrid
                items={media}
                allowDownload={allowDownload}
                workspaceId={workspaceId}
                canDelete={canDelete}
                canManageVisibility={canManageVisibility}
                onChanged={onMediaChanged}
                size={photoSize}
              />
            </div>
          </article>
        );
      })}
    </div>
  );
}
