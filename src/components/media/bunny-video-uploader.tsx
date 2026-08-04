"use client";

import { useRef, useState } from "react";
import { SiteButton } from "@/components/progress/primitives";
import {
  cancelBunnyUpload,
  createBunnyUploadSession,
  markBunnyUploadComplete,
  startBunnyTusUpload,
  type BunnyUploadProgress,
} from "@/lib/bunny/client-upload";
import { formatBytes } from "@/lib/utils";

type QueueItem = {
  id: string;
  file: File;
  clientUploadId: string;
  mediaId?: string;
  progress: BunnyUploadProgress;
  abort?: () => void;
};

const MAX_CONCURRENT = 2;

export function BunnyVideoUploader({
  projectId,
  workspaceId,
  clientVisible = false,
  onUploaded,
}: {
  projectId: string;
  workspaceId: string;
  clientVisible?: boolean;
  onUploaded?: (mediaId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [note, setNote] = useState("");
  const activeCount = useRef(0);
  const pendingRef = useRef<QueueItem[]>([]);

  function updateItem(id: string, patch: Partial<QueueItem>) {
    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  async function runItem(item: QueueItem) {
    activeCount.current += 1;
    try {
      updateItem(item.id, {
        progress: { status: "preparing", percent: 0 },
      });
      const session = await createBunnyUploadSession({
        projectId,
        workspaceId,
        file: item.file,
        clientUploadId: item.clientUploadId,
        title: item.file.name,
        clientVisible,
      });
      updateItem(item.id, { mediaId: session.mediaId });

      const { abort, promise } = startBunnyTusUpload({
        file: item.file,
        session,
        onProgress(progress) {
          updateItem(item.id, { progress });
        },
      });
      updateItem(item.id, { abort });

      const mediaId = await promise;
      await markBunnyUploadComplete({ mediaId, projectId, workspaceId });
      updateItem(item.id, {
        mediaId,
        progress: { status: "processing", percent: 100, mediaId },
      });
      onUploaded?.(mediaId);
      setNote(
        "Upload complete. Processing may continue for a few minutes. Resume after a full browser restart may require selecting the same file again.",
      );
    } catch {
      updateItem(item.id, {
        progress: {
          status: "failed",
          percent: 0,
          error: "The video upload could not be completed. You can try again.",
        },
      });
    } finally {
      activeCount.current -= 1;
      pump();
    }
  }

  function pump() {
    while (activeCount.current < MAX_CONCURRENT && pendingRef.current.length) {
      const next = pendingRef.current.shift();
      if (next) void runItem(next);
    }
  }

  function enqueue(files: FileList | File[] | null) {
    if (!files) return;
    const videos = Array.from(files).filter((f) =>
      (f.type || "").startsWith("video/"),
    );
    if (!videos.length) {
      setNote("Please choose video files.");
      return;
    }
    const items: QueueItem[] = videos.map((file) => ({
      id: crypto.randomUUID(),
      file,
      clientUploadId: crypto.randomUUID(),
      progress: { status: "preparing", percent: 0 },
    }));
    setQueue((prev) => [...items, ...prev]);
    pendingRef.current.push(...items);
    pump();
  }

  async function cancelItem(item: QueueItem) {
    item.abort?.();
    pendingRef.current = pendingRef.current.filter((x) => x.id !== item.id);
    if (item.mediaId) {
      await cancelBunnyUpload({
        mediaId: item.mediaId,
        projectId,
        workspaceId,
      });
    }
    updateItem(item.id, {
      progress: { status: "cancelled", percent: 0, mediaId: item.mediaId },
    });
  }

  function statusLabel(p: BunnyUploadProgress) {
    switch (p.status) {
      case "preparing":
        return "Preparing upload…";
      case "uploading":
        return `Uploading ${p.percent}%`;
      case "paused":
        return "Upload paused";
      case "retrying":
        return "Retrying…";
      case "complete":
        return "Upload complete";
      case "processing":
        return "Processing video…";
      case "failed":
        return "Upload failed";
      case "cancelled":
        return "Cancelled";
      default:
        return "";
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <SiteButton
          type="button"
          variant="accent"
          onClick={() => inputRef.current?.click()}
        >
          Upload videos
        </SiteButton>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          multiple
          capture="environment"
          hidden
          onChange={(e) => {
            enqueue(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {note ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--site-text-secondary)" }}>
          {note}
        </p>
      ) : null}
      {queue.map((item) => (
        <div
          key={item.id}
          style={{
            border: "1px solid var(--site-border, #e5e7eb)",
            borderRadius: 12,
            padding: 12,
            display: "grid",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{item.file.name}</div>
              <div style={{ fontSize: 12, color: "var(--site-text-secondary)" }}>
                {formatBytes(item.file.size)} · {statusLabel(item.progress)}
              </div>
            </div>
            {item.progress.status === "uploading" ||
            item.progress.status === "preparing" ||
            item.progress.status === "retrying" ? (
              <SiteButton
                type="button"
                variant="ghost"
                onClick={() => void cancelItem(item)}
              >
                Cancel
              </SiteButton>
            ) : null}
          </div>
          <div
            style={{
              height: 8,
              borderRadius: 999,
              background: "var(--site-surface-muted, #f3f4f6)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${item.progress.percent}%`,
                height: "100%",
                background: "var(--site-accent, #d97706)",
              }}
            />
          </div>
          {item.progress.error ? (
            <p style={{ margin: 0, color: "var(--site-danger)", fontSize: 13 }}>
              {item.progress.error}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
