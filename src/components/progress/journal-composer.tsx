"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ImagePlus, Trash2, X } from "lucide-react";
import { ACCEPTED_MEDIA_ACCEPT } from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";
import { detectMediaKind } from "@/lib/services/media";
import { publishDailyUpdate } from "@/lib/services/updates";
import type { Project, Visibility } from "@/lib/types";
import { VISIBILITY_LABELS } from "@/lib/types";
import { isImageFile, isVideoFile, todayKey } from "@/lib/utils";
import {
  SiteButton,
  SiteField,
  SiteInput,
  SiteTextarea,
} from "./primitives";

const VISIBILITY_HELP: Record<Visibility, string> = {
  internal: "Only the team can see this journal entry.",
  client_visible: "Publishes to the client progress portal.",
  pending_approval: "Sends to admin before the client can see it.",
};

type PreviewItem = {
  id: string;
  file: File;
  url: string;
  kind: "photo" | "video";
};

export function JournalComposer({
  project,
  onPublished,
  compact = false,
  canPublishToClient = false,
}: {
  project: Project;
  onPublished?: () => void | Promise<void>;
  compact?: boolean;
  /** Creator, or a colleague whose effectivePermissions grant
   *  publishMediaToClient AND the Project allows staff publish — never a
   *  bare project.allowStaffPublish check, which would let e.g. a
   *  VIEW_ONLY/UPDATE_PROGRESS colleague publish to the client. */
  canPublishToClient?: boolean;
}) {
  const { profile } = useAuth();
  const [date, setDate] = useState(todayKey());
  const [note, setNote] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("internal");
  const [previews, setPreviews] = useState<PreviewItem[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(!compact);

  useEffect(() => {
    return () => {
      previews.forEach((p) => URL.revokeObjectURL(p.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibilityOptions = useMemo(() => {
    const options: Visibility[] = ["internal", "pending_approval"];
    if (canPublishToClient) {
      options.splice(1, 0, "client_visible");
    }
    return options;
  }, [canPublishToClient]);

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    const next: PreviewItem[] = [];
    Array.from(list).forEach((file) => {
      const kind = detectMediaKind(file);
      if (!kind) return;
      next.push({
        id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        url: URL.createObjectURL(file),
        kind,
      });
    });
    if (next.length) {
      setPreviews((prev) => [...prev, ...next]);
    }
  }

  function removePreview(id: string) {
    setPreviews((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.id !== id);
    });
  }

  function clearComposer() {
    previews.forEach((p) => URL.revokeObjectURL(p.url));
    setPreviews([]);
    setDate(todayKey());
    setNote("");
    setVisibility("internal");
    setProgress({});
    setError("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;

    if (!previews.length) {
      setError("Add at least one photo or video before publishing.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      await publishDailyUpdate({
        projectId: project.id,
        // Always the Project's own workspaceId — never the current USER's
        // defaultWorkspaceId, which would be wrong for a shared Project.
        workspaceId: project.workspaceId || project.companyId,
        workItems: [],
        customActivities: [],
        noWorkToday: false,
        note: note.trim() || undefined,
        visibility,
        files: previews.map((p) => p.file),
        createdBy: profile.uid,
        createdByName: profile.displayName,
        date: date || todayKey(),
        onFileProgress: (fileName, pct) =>
          setProgress((prev) => ({ ...prev, [fileName]: pct })),
      });
      clearComposer();
      if (compact) setOpen(false);
      await onPublished?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  if (compact && !open) {
    return (
      <div className="site-journal-composer-trigger">
        <SiteButton
          type="button"
          variant="accent"
          onClick={() => setOpen(true)}
        >
          <ImagePlus size={16} />
          Add journal update
        </SiteButton>
        <span className="site-journal-composer-hint">
          Upload multiple photos or videos, defaults to today
        </span>
      </div>
    );
  }

  const photoCount = previews.filter((p) => p.kind === "photo").length;
  const videoCount = previews.filter((p) => p.kind === "video").length;

  return (
    <form className="site-journal-composer" onSubmit={onSubmit}>
      <div className="site-journal-composer-head">
        <div>
          <div className="site-page-kicker">New entry</div>
          <h3 className="site-journal-composer-title">Add journal update</h3>
        </div>
        {compact ? (
          <button
            type="button"
            className="site-btn site-btn-ghost"
            style={{ minHeight: 36, padding: "0 10px" }}
            onClick={() => {
              clearComposer();
              setOpen(false);
            }}
            aria-label="Close composer"
          >
            <X size={16} />
          </button>
        ) : null}
      </div>

      <div style={{ marginBottom: 14, maxWidth: 220 }}>
        <SiteField label="Date">
          <SiteInput
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </SiteField>
      </div>

      <div className="site-step" style={{ marginBottom: 10 }}>
        <span className="site-step-num">01</span>
        <span className="site-step-label">
          Photos & videos
          {previews.length
            ? ` · ${photoCount} photos${videoCount ? ` · ${videoCount} videos` : ""}`
            : " · multiple files"}
        </span>
      </div>

      <label
        className="site-dropzone"
        data-active={dragOver}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <strong>Drop multiple photos or videos</strong>
        <span>JPG, PNG, HEIC, MP4, MOV · select many at once</span>
        <input
          type="file"
          accept={ACCEPTED_MEDIA_ACCEPT}
          multiple
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {previews.length ? (
        <div className="site-upload-preview-grid">
          {previews.map((item) => (
            <div key={item.id} className="site-upload-preview-tile">
              {item.kind === "photo" || isImageFile(item.file) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.url} alt={item.file.name} />
              ) : (
                <video src={item.url} muted playsInline preload="metadata" />
              )}
              {item.kind === "video" || isVideoFile(item.file) ? (
                <span className="site-upload-preview-badge">Video</span>
              ) : null}
              <button
                type="button"
                className="site-upload-preview-remove"
                onClick={() => removePreview(item.id)}
                aria-label={`Remove ${item.file.name}`}
              >
                <Trash2 size={14} />
              </button>
              {progress[item.file.name] != null ? (
                <div className="site-upload-preview-progress">
                  <i style={{ width: `${progress[item.file.name]}%` }} />
                </div>
              ) : null}
            </div>
          ))}
          <label className="site-upload-preview-add">
            <ImagePlus size={20} />
            <span>Add more</span>
            <input
              type="file"
              accept={ACCEPTED_MEDIA_ACCEPT}
              multiple
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      ) : null}

      <div className="site-step" style={{ marginTop: 22, marginBottom: 10 }}>
        <span className="site-step-num">02</span>
        <span className="site-step-label">Note (optional)</span>
      </div>
      <SiteTextarea
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Living room floor tiling is ongoing. Approximately 70% completed."
      />

      <div className="site-step" style={{ marginTop: 22, marginBottom: 10 }}>
        <span className="site-step-num">03</span>
        <span className="site-step-label">Visible to client (optional)</span>
      </div>
      <div className="site-visibility-row">
        {visibilityOptions.map((option) => (
          <button
            key={option}
            type="button"
            className="site-choice"
            data-active={visibility === option}
            onClick={() => setVisibility(option)}
          >
            <div>
              <strong>{VISIBILITY_LABELS[option]}</strong>
              <span>{VISIBILITY_HELP[option]}</span>
            </div>
          </button>
        ))}
      </div>

      {error ? (
        <p style={{ color: "var(--site-danger)", fontSize: 14, marginTop: 14 }}>
          {error}
        </p>
      ) : null}

      <div className="site-journal-composer-actions">
        <SiteButton type="submit" variant="accent" disabled={busy}>
          {busy
            ? `Publishing${previews.length ? ` ${previews.length} files…` : "…"}`
            : `Publish${previews.length ? ` · ${previews.length} files` : ""}`}
        </SiteButton>
        {previews.length ? (
          <SiteButton
            type="button"
            variant="ghost"
            onClick={() => {
              previews.forEach((p) => URL.revokeObjectURL(p.url));
              setPreviews([]);
            }}
          >
            Clear media
          </SiteButton>
        ) : null}
      </div>
    </form>
  );
}
