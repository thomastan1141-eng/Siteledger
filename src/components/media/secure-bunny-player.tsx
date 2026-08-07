"use client";

import { useState } from "react";
import { SiteButton } from "@/components/progress/primitives";
import { fetchBunnyPlayback } from "@/lib/bunny/client-upload";
import type { MediaItem } from "@/lib/types";
import { BunnyThumbnail } from "./bunny-thumbnail";

export function SecureBunnyPlayer({
  item,
  workspaceId,
}: {
  item: MediaItem;
  workspaceId: string;
}) {
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [expires, setExpires] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ready = item.status === "PLAYABLE" || item.status === "READY";
  const title = item.title || item.caption || item.fileName || "Project video";

  async function play() {
    if (!ready || busy) return;
    const now = Math.floor(Date.now() / 1000);
    if (embedUrl && expires > now + 30) return;
    setBusy(true);
    setError("");
    try {
      const playback = await fetchBunnyPlayback({
        mediaId: item.id,
        projectId: item.projectId,
        workspaceId: workspaceId || item.workspaceId || item.companyId,
      });
      setEmbedUrl(playback.embedUrl);
      setExpires(playback.expires);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Your video session expired. Press Play to continue.",
      );
      setEmbedUrl(null);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <div
        style={{
          aspectRatio: "16 / 9",
          background: "var(--site-surface-muted, #f3f4f6)",
          display: "grid",
          placeItems: "center",
          borderRadius: 12,
          color: "var(--site-text-secondary)",
          fontSize: 14,
        }}
      >
        {item.status === "FAILED"
          ? "Video processing failed"
          : item.status === "PROCESSING" || item.status === "UPLOADING"
            ? typeof item.encodeProgress === "number" && item.encodeProgress > 0
              ? `Processing video… ${Math.min(99, Math.round(item.encodeProgress))}%`
              : "Processing video…"
            : "Video not ready"}
      </div>
    );
  }

  if (!embedUrl) {
    return (
      <div
        style={{
          aspectRatio: "16 / 9",
          position: "relative",
          borderRadius: 12,
          overflow: "hidden",
          background: "#111",
        }}
      >
        <BunnyThumbnail
          item={item}
          workspaceId={workspaceId}
          alt={title}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            background: "rgba(0,0,0,0.35)",
            gap: 8,
          }}
        >
          <SiteButton type="button" variant="accent" onClick={() => void play()}>
            {busy ? "Loading…" : "Play"}
          </SiteButton>
          {error ? (
            <p style={{ color: "#fff", fontSize: 13, margin: 0 }}>{error}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div style={{ aspectRatio: "16 / 9", borderRadius: 12, overflow: "hidden" }}>
      <iframe
        src={embedUrl}
        title={title}
        loading="lazy"
        allowFullScreen
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        style={{ width: "100%", height: "100%", border: 0 }}
      />
    </div>
  );
}
