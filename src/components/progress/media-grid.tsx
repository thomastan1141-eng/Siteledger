"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { SecureBunnyPlayer } from "@/components/media/secure-bunny-player";
import {
  deleteBunnyMedia,
  syncBunnyMedia,
} from "@/lib/bunny/client-upload";
import type { MediaItem } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { SiteButton, SiteEmpty } from "./primitives";

function isBunnyVideo(item: MediaItem) {
  return item.type === "video" && item.provider === "BUNNY_STREAM";
}

export function ProgressMediaGrid({
  items,
  allowDownload = false,
  workspaceId,
  canDelete = false,
  onChanged,
}: {
  items: MediaItem[];
  allowDownload?: boolean;
  workspaceId?: string;
  canDelete?: boolean;
  onChanged?: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const active = activeIndex !== null ? items[activeIndex] : null;
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    if (activeIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveIndex(null);
      if (e.key === "ArrowRight") {
        setActiveIndex((i) =>
          i === null ? i : Math.min(items.length - 1, i + 1),
        );
      }
      if (e.key === "ArrowLeft") {
        setActiveIndex((i) => (i === null ? i : Math.max(0, i - 1)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, items.length]);

  if (!items.length) {
    return (
      <SiteEmpty
        title="No media yet"
        description="Photos and videos from site updates will appear here."
      />
    );
  }

  async function retryStatus(item: MediaItem) {
    const ws = workspaceId || item.workspaceId || item.companyId;
    if (!ws) return;
    setBusyId(item.id);
    try {
      await syncBunnyMedia({
        mediaId: item.id,
        projectId: item.projectId,
        workspaceId: ws,
      });
      onChanged?.();
    } catch {
      /* friendly UI stays on card */
    } finally {
      setBusyId("");
    }
  }

  async function removeVideo(item: MediaItem) {
    const ws = workspaceId || item.workspaceId || item.companyId;
    if (!ws) return;
    if (!window.confirm("Delete this video from SiteLedger and Bunny Stream?")) {
      return;
    }
    setBusyId(item.id);
    try {
      await deleteBunnyMedia({
        mediaId: item.id,
        projectId: item.projectId,
        workspaceId: ws,
      });
      onChanged?.();
    } catch (err) {
      window.alert(
        err instanceof Error
          ? err.message
          : "The video could not be deleted. Please try again.",
      );
    } finally {
      setBusyId("");
    }
  }

  return (
    <>
      <div className="site-media-grid">
        {items.map((item, index) => {
          const bunny = isBunnyVideo(item);
          const ready =
            !bunny || item.status === "PLAYABLE" || item.status === "READY";
          return (
            <button
              key={item.id}
              type="button"
              className="site-media-tile"
              onClick={() => setActiveIndex(index)}
            >
              {item.type === "photo" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.downloadUrl}
                  alt={item.caption || item.fileName}
                />
              ) : bunny ? (
                item.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.thumbnailUrl}
                    alt={item.title || item.fileName}
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      background: "#222",
                      display: "grid",
                      placeItems: "center",
                      color: "#fff",
                      fontSize: 12,
                    }}
                  >
                    {item.status === "FAILED"
                      ? "Failed"
                      : ready
                        ? "Video"
                        : "Processing…"}
                  </div>
                )
              ) : (
                <>
                  <video
                    src={item.downloadUrl}
                    muted
                    playsInline
                    preload="metadata"
                  />
                  <span className="site-media-tile-label">Video</span>
                </>
              )}
              <span className="site-media-tile-label">
                {item.type === "video"
                  ? bunny
                    ? `${item.status === "READY" || item.status === "PLAYABLE" ? "Video" : item.status || "Video"} · ${formatDate(item.date)}`
                    : "Video"
                  : `${formatDate(item.date)}${
                      item.workItems[0] ? ` · ${item.workItems[0]}` : ""
                    }`}
              </span>
            </button>
          );
        })}
      </div>

      {active && activeIndex !== null ? (
        <div className="site-lightbox">
          <button
            type="button"
            className="site-btn site-btn-ghost"
            style={{ position: "absolute", top: 16, right: 16, color: "#fff" }}
            onClick={() => setActiveIndex(null)}
            aria-label="Close"
          >
            <X size={18} />
          </button>
          {activeIndex > 0 ? (
            <button
              type="button"
              className="site-btn site-btn-ghost"
              style={{ position: "absolute", left: 16, color: "#fff" }}
              onClick={() => setActiveIndex(activeIndex - 1)}
            >
              <ChevronLeft size={20} />
            </button>
          ) : null}
          {activeIndex < items.length - 1 ? (
            <button
              type="button"
              className="site-btn site-btn-ghost"
              style={{ position: "absolute", right: 16, color: "#fff" }}
              onClick={() => setActiveIndex(activeIndex + 1)}
            >
              <ChevronRight size={20} />
            </button>
          ) : null}
          <div className="site-lightbox-frame">
            {active.type === "photo" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={active.downloadUrl}
                alt={active.caption || active.fileName}
              />
            ) : isBunnyVideo(active) ? (
              <div style={{ width: "min(960px, 100%)" }}>
                <SecureBunnyPlayer
                  item={active}
                  workspaceId={
                    workspaceId || active.workspaceId || active.companyId
                  }
                />
                {active.status === "FAILED" ? (
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <SiteButton
                      type="button"
                      variant="soft"
                      disabled={busyId === active.id}
                      onClick={() => void retryStatus(active)}
                    >
                      Retry status check
                    </SiteButton>
                    {canDelete ? (
                      <SiteButton
                        type="button"
                        variant="ghost"
                        disabled={busyId === active.id}
                        onClick={() => void removeVideo(active)}
                      >
                        Remove
                      </SiteButton>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <video src={active.downloadUrl} controls playsInline />
            )}
            <div className="site-lightbox-meta">
              <div>
                {formatDate(active.date)}
                {active.workItems.length
                  ? ` · ${active.workItems.join(" · ")}`
                  : ""}
                {active.title || active.caption
                  ? ` — ${active.title || active.caption}`
                  : ""}
                {active.uploadedByName ? ` · ${active.uploadedByName}` : ""}
                {active.durationSeconds
                  ? ` · ${Math.round(active.durationSeconds)}s`
                  : ""}
                {active.clientVisible ||
                active.visibility === "client_visible"
                  ? " · Client visible"
                  : " · Internal"}
              </div>
              {allowDownload &&
              active.type === "photo" &&
              active.downloadUrl ? (
                <a href={active.downloadUrl} target="_blank" rel="noreferrer">
                  <SiteButton variant="soft" type="button">
                    Download
                  </SiteButton>
                </a>
              ) : null}
              {canDelete && isBunnyVideo(active) && active.status !== "FAILED" ? (
                <SiteButton
                  type="button"
                  variant="ghost"
                  disabled={busyId === active.id}
                  onClick={() => void removeVideo(active)}
                >
                  Delete video
                </SiteButton>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
