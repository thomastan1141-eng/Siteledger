"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Eye, EyeOff, X } from "lucide-react";
import { SecureBunnyPlayer } from "@/components/media/secure-bunny-player";
import {
  deleteBunnyMedia,
  syncBunnyMedia,
} from "@/lib/bunny/client-upload";
import { setMediaClientVisible } from "@/lib/services/media";
import type { MediaItem } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { SiteButton, SiteEmpty, SitePill } from "./primitives";

const STILL_PROCESSING_MS = 10 * 60 * 1000;

function isBunnyVideo(item: MediaItem) {
  return item.type === "video" && item.provider === "BUNNY_STREAM";
}

function isBunnyReady(item: MediaItem) {
  return item.status === "PLAYABLE" || item.status === "READY";
}

function isBunnyFailed(item: MediaItem) {
  return item.status === "FAILED";
}

function isClientVisible(item: MediaItem) {
  return (
    item.clientVisible === true ||
    item.visibility === "client_visible" ||
    item.visibility === "handover"
  );
}

/** True once a Bunny video has been stuck outside PLAYABLE/READY/FAILED for 10+ minutes. */
function isStillProcessingTooLong(item: MediaItem) {
  if (!isBunnyVideo(item) || isBunnyReady(item) || isBunnyFailed(item)) {
    return false;
  }
  const started = item.createdAt ? new Date(item.createdAt).getTime() : 0;
  if (!started || Number.isNaN(started)) return false;
  return Date.now() - started > STILL_PROCESSING_MS;
}

function processingLabel(item: MediaItem) {
  if (typeof item.encodeProgress === "number" && item.encodeProgress > 0) {
    return `Processing ${Math.min(99, Math.round(item.encodeProgress))}%`;
  }
  return "Processing video…";
}

export function ProgressMediaGrid({
  items,
  allowDownload = false,
  workspaceId,
  canDelete = false,
  canManageVisibility = false,
  onChanged,
}: {
  items: MediaItem[];
  allowDownload?: boolean;
  workspaceId?: string;
  canDelete?: boolean;
  canManageVisibility?: boolean;
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

  async function toggleVisibility(item: MediaItem) {
    const ws = workspaceId || item.workspaceId || item.companyId;
    if (!ws) return;
    setBusyId(item.id);
    try {
      await setMediaClientVisible({
        mediaId: item.id,
        projectId: item.projectId,
        workspaceId: ws,
        clientVisible: !isClientVisible(item),
      });
      onChanged?.();
    } catch (err) {
      window.alert(
        err instanceof Error
          ? err.message
          : "Could not update visibility. Please try again.",
      );
    } finally {
      setBusyId("");
    }
  }

  function VisibilityBadge({ item }: { item: MediaItem }) {
    return (
      <div style={{ position: "absolute", top: 6, left: 6, zIndex: 1 }}>
        <SitePill tone={isClientVisible(item) ? "success" : "neutral"}>
          {isClientVisible(item) ? "Visible to client" : "Internal only"}
        </SitePill>
      </div>
    );
  }

  function VisibilityToggleButton({ item }: { item: MediaItem }) {
    if (!canManageVisibility) return null;
    return (
      <button
        type="button"
        aria-label={isClientVisible(item) ? "Hide from client" : "Show to client"}
        title={isClientVisible(item) ? "Hide from client" : "Show to client"}
        disabled={busyId === item.id}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void toggleVisibility(item);
        }}
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          zIndex: 1,
          width: 28,
          height: 28,
          display: "grid",
          placeItems: "center",
          borderRadius: 999,
          border: "none",
          background: "rgba(17, 18, 17, 0.6)",
          color: "#fff",
          cursor: busyId === item.id ? "wait" : "pointer",
        }}
      >
        {isClientVisible(item) ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>
    );
  }

  return (
    <>
      <div className="site-media-grid">
        {items.map((item, index) => {
          const bunny = isBunnyVideo(item);
          const ready = !bunny || isBunnyReady(item);
          const failed = bunny && isBunnyFailed(item);
          const stillStuck = isStillProcessingTooLong(item);

          if (bunny && !ready) {
            // Non-playable Bunny videos never open the lightbox — surface
            // status and actions directly on the tile instead.
            return (
              <div key={item.id} className="site-media-tile" style={{ cursor: "default" }}>
                <VisibilityBadge item={item} />
                <VisibilityToggleButton item={item} />
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    background: failed ? "#3a1f1f" : "#222",
                    display: "grid",
                    placeItems: "center",
                    gap: 8,
                    padding: 10,
                    textAlign: "center",
                  }}
                >
                  {failed ? (
                    <AlertTriangle size={20} color="#f4a3a3" />
                  ) : null}
                  <span style={{ color: "#fff", fontSize: 12 }}>
                    {failed
                      ? "Video failed to process"
                      : stillStuck
                        ? "Still processing"
                        : processingLabel(item)}
                  </span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
                    {failed || stillStuck ? (
                      <SiteButton
                        type="button"
                        variant="soft"
                        disabled={busyId === item.id}
                        onClick={() => void retryStatus(item)}
                        style={{ minHeight: 28, padding: "0 10px", fontSize: 12 }}
                      >
                        Check status
                      </SiteButton>
                    ) : null}
                    {failed && canDelete ? (
                      <SiteButton
                        type="button"
                        variant="ghost"
                        disabled={busyId === item.id}
                        onClick={() => void removeVideo(item)}
                        style={{ minHeight: 28, padding: "0 10px", fontSize: 12, color: "#fff" }}
                      >
                        Remove
                      </SiteButton>
                    ) : null}
                  </div>
                </div>
                <span className="site-media-tile-label">
                  {formatDate(item.date)}
                </span>
              </div>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              className="site-media-tile"
              onClick={() => setActiveIndex(index)}
            >
              <VisibilityBadge item={item} />
              <VisibilityToggleButton item={item} />
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
                    Video
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
                    ? `Video · ${formatDate(item.date)}`
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
                {" · "}
                {isClientVisible(active) ? "Client visible" : "Internal"}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {allowDownload &&
                active.type === "photo" &&
                active.downloadUrl ? (
                  <a href={active.downloadUrl} target="_blank" rel="noreferrer">
                    <SiteButton variant="soft" type="button">
                      Download
                    </SiteButton>
                  </a>
                ) : null}
                {canManageVisibility ? (
                  <SiteButton
                    type="button"
                    variant="soft"
                    disabled={busyId === active.id}
                    onClick={() => void toggleVisibility(active)}
                  >
                    {isClientVisible(active)
                      ? "Hide from client"
                      : "Show to client"}
                  </SiteButton>
                ) : null}
                {canDelete && isBunnyVideo(active) ? (
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
        </div>
      ) : null}
    </>
  );
}
