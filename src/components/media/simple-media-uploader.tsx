"use client";

import { useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  SiteButton,
  SiteField,
  SiteInput,
} from "@/components/progress/primitives";
import { useAuth } from "@/lib/auth-context";
import { uploadPhotoMedia } from "@/lib/services/media";
import { uploadVideoFileViaBunny } from "@/lib/bunny/client-upload";
import { formatBytes, isImageFile, isVideoFile, todayKey } from "@/lib/utils";

type QueuedFile = {
  id: string;
  file: File;
  kind: "photo" | "video";
  progress: number;
  status: "queued" | "uploading" | "processing" | "done" | "failed";
  error?: string;
};

function currentTimeHHmm() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;
}

export function SimpleMediaUploader({
  projectId,
  workspaceId,
  onUploaded,
}: {
  projectId: string;
  workspaceId: string;
  onUploaded?: () => void;
}) {
  const { profile } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState(todayKey());
  const [time, setTime] = useState(currentTimeHHmm);
  const [clientVisible, setClientVisible] = useState(false);
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const capturedAt = useMemo(() => {
    if (!date) return new Date().toISOString();
    return `${date}T${time || "00:00"}:00`;
  }, [date, time]);

  function updateQueueItem(id: string, patch: Partial<QueuedFile>) {
    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    const next: QueuedFile[] = [];
    Array.from(list).forEach((file) => {
      if (isImageFile(file)) {
        next.push({
          id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
          file,
          kind: "photo",
          progress: 0,
          status: "queued",
        });
      } else if (isVideoFile(file)) {
        next.push({
          id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
          file,
          kind: "video",
          progress: 0,
          status: "queued",
        });
      }
    });
    if (next.length) {
      setQueue((prev) => [...prev, ...next]);
      setError("");
    } else {
      setError("Please choose photo or video files.");
    }
  }

  function removeItem(id: string) {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }

  function clearAll() {
    setQueue([]);
    setDate(todayKey());
    setTime(currentTimeHHmm());
    setClientVisible(false);
    setError("");
  }

  async function uploadOne(item: QueuedFile) {
    if (!profile) throw new Error("Please sign in again.");
    updateQueueItem(item.id, { status: "uploading", progress: 0 });

    if (item.kind === "photo") {
      await uploadPhotoMedia(projectId, item.file, {
        capturedAt,
        clientVisible,
        workspaceId,
        uploadedBy: profile.uid,
        uploadedByName: profile.displayName,
        onProgress: (pct) => updateQueueItem(item.id, { progress: pct }),
      });
      updateQueueItem(item.id, { status: "done", progress: 100 });
      return;
    }

    await uploadVideoFileViaBunny({
      projectId,
      workspaceId,
      file: item.file,
      title: item.file.name,
      clientVisible,
      capturedAt,
      onProgress: (pct, status) => {
        updateQueueItem(item.id, {
          progress: pct,
          status: status === "failed" ? "failed" : "uploading",
        });
      },
    });
    updateQueueItem(item.id, { status: "processing", progress: 100 });
  }

  async function onUpload() {
    if (!queue.length) {
      setError("Choose at least one photo or video first.");
      return;
    }
    setUploading(true);
    setError("");
    let failures = 0;
    for (const item of queue) {
      if (item.status === "done" || item.status === "processing") continue;
      try {
        await uploadOne(item);
      } catch (err) {
        failures += 1;
        updateQueueItem(item.id, {
          status: "failed",
          error:
            err instanceof Error
              ? err.message
              : "Upload failed. Please try again.",
        });
      }
    }
    setUploading(false);
    onUploaded?.();
    if (!failures) {
      setQueue([]);
    }
  }

  const photoCount = queue.filter((q) => q.kind === "photo").length;
  const videoCount = queue.filter((q) => q.kind === "video").length;

  return (
    <div
      style={{
        display: "grid",
        gap: 14,
        border: "1px solid var(--site-border, #e5e7eb)",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        }}
      >
        <SiteField label="Date">
          <SiteInput
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </SiteField>
        <SiteField label="Time">
          <SiteInput
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </SiteField>
      </div>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={clientVisible}
          onChange={(e) => setClientVisible(e.target.checked)}
        />
        Visible to client
      </label>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <SiteButton
          type="button"
          variant="soft"
          onClick={() => inputRef.current?.click()}
        >
          Choose photos / videos
        </SiteButton>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {queue.length ? (
        <div style={{ fontSize: 13, color: "var(--site-text-secondary)" }}>
          {photoCount ? `${photoCount} photo${photoCount === 1 ? "" : "s"}` : ""}
          {photoCount && videoCount ? " · " : ""}
          {videoCount ? `${videoCount} video${videoCount === 1 ? "" : "s"}` : ""}
        </div>
      ) : null}

      {queue.map((item) => (
        <div
          key={item.id}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            border: "1px solid var(--site-border, #e5e7eb)",
            borderRadius: 10,
            padding: "8px 12px",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {item.file.name}
            </div>
            <div style={{ fontSize: 12, color: "var(--site-text-secondary)" }}>
              {formatBytes(item.file.size)} ·{" "}
              {item.status === "queued"
                ? "Ready to upload"
                : item.status === "uploading"
                  ? `Uploading ${item.progress}%`
                  : item.status === "processing"
                    ? "Processing video…"
                    : item.status === "done"
                      ? "Uploaded"
                      : item.error || "Upload failed"}
            </div>
          </div>
          {item.status === "queued" || item.status === "failed" ? (
            <button
              type="button"
              className="site-btn site-btn-ghost"
              style={{ minHeight: 32, padding: "0 8px" }}
              onClick={() => removeItem(item.id)}
              aria-label={`Remove ${item.file.name}`}
            >
              <Trash2 size={14} />
            </button>
          ) : null}
        </div>
      ))}

      {error ? (
        <p style={{ margin: 0, color: "var(--site-danger)", fontSize: 13 }}>
          {error}
        </p>
      ) : null}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <SiteButton
          type="button"
          variant="accent"
          disabled={uploading || !queue.length}
          onClick={() => void onUpload()}
        >
          {uploading ? "Uploading…" : "Upload"}
        </SiteButton>
        <SiteButton
          type="button"
          variant="ghost"
          disabled={uploading}
          onClick={clearAll}
        >
          Clear
        </SiteButton>
      </div>
    </div>
  );
}
