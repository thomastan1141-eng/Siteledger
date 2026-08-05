"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ImagePlus, Trash2, X } from "lucide-react";
import { ACCEPTED_MEDIA_ACCEPT } from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";
import { detectMediaKind } from "@/lib/services/media";
import { listSchedule } from "@/lib/services/schedule";
import { publishDailyUpdate } from "@/lib/services/updates";
import type { Project, ScheduleItem, Visibility } from "@/lib/types";
import { VISIBILITY_LABELS } from "@/lib/types";
import { isImageFile, isVideoFile, todayKey } from "@/lib/utils";
import {
  SiteButton,
  SiteField,
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
}: {
  project: Project;
  onPublished?: () => void | Promise<void>;
  compact?: boolean;
}) {
  const { profile } = useAuth();
  const [stages, setStages] = useState<ScheduleItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [noWorkToday, setNoWorkToday] = useState(false);
  const [note, setNote] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("internal");
  const [previews, setPreviews] = useState<PreviewItem[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(!compact);

  useEffect(() => {
    listSchedule(project.id, {
      workspaceId: project.workspaceId || project.companyId,
    }).then(setStages);
  }, [project.id, project.workspaceId, project.companyId]);

  useEffect(() => {
    return () => {
      previews.forEach((p) => URL.revokeObjectURL(p.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibilityOptions = useMemo(() => {
    const options: Visibility[] = ["internal", "pending_approval"];
    if (profile?.role === "admin" || project.allowStaffPublish) {
      options.splice(1, 0, "client_visible");
    }
    return options;
  }, [profile, project]);

  function toggleWork(name: string) {
    setNoWorkToday(false);
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name],
    );
  }

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
      setNoWorkToday(false);
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
    setSelected([]);
    setCustom("");
    setNoWorkToday(false);
    setNote("");
    setVisibility("internal");
    setProgress({});
    setError("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;

    const customActivities = custom
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!noWorkToday && !selected.length && !customActivities.length) {
      setError("Select today’s work, or mark no work today.");
      return;
    }

    if (!noWorkToday && !previews.length && !note.trim()) {
      setError("Add photos/videos or a short note before publishing.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      await publishDailyUpdate({
        projectId: project.id,
        workspaceId:
          project.workspaceId || project.companyId || profile.defaultWorkspaceId,
        workItems: noWorkToday ? [] : selected,
        customActivities: noWorkToday ? [] : customActivities,
        noWorkToday,
        note: note.trim() || undefined,
        visibility,
        files: noWorkToday ? [] : previews.map((p) => p.file),
        createdBy: profile.uid,
        createdByName: profile.displayName,
        date: todayKey(),
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
          Upload multiple photos or videos for {todayKey()}
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
          <h3 className="site-journal-composer-title">
            Today’s journal · {todayKey()}
          </h3>
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

      <div className="site-step" style={{ marginBottom: 10 }}>
        <span className="site-step-num">01</span>
        <span className="site-step-label">Work ongoing</span>
      </div>
      <div className="site-chip-cloud">
        {stages.map((stage) => (
          <button
            key={stage.id}
            type="button"
            className="site-chip"
            data-active={selected.includes(stage.name)}
            onClick={() => toggleWork(stage.name)}
          >
            {stage.name}
          </button>
        ))}
        {!stages.length ? (
          <p className="site-3d-empty">
            No project stages yet. Use Manage stages, or add a custom activity
            below.
          </p>
        ) : null}
        <button
          type="button"
          className="site-chip"
          data-tone="muted"
          data-active={noWorkToday}
          onClick={() => {
            setNoWorkToday(true);
            setSelected([]);
            previews.forEach((p) => URL.revokeObjectURL(p.url));
            setPreviews([]);
          }}
        >
          No work today
        </button>
      </div>

      <div style={{ marginTop: 14 }}>
        <SiteField label="Custom activity">
          <SiteTextarea
            rows={2}
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value);
              setNoWorkToday(false);
            }}
            placeholder="Scaffold inspection, material delivery…"
          />
        </SiteField>
      </div>

      {!noWorkToday ? (
        <>
          <div className="site-step" style={{ marginTop: 22, marginBottom: 10 }}>
            <span className="site-step-num">02</span>
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
        </>
      ) : null}

      <div className="site-step" style={{ marginTop: 22, marginBottom: 10 }}>
        <span className="site-step-num">03</span>
        <span className="site-step-label">Note</span>
      </div>
      <SiteTextarea
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Living room floor tiling is ongoing. Approximately 70% completed."
      />

      <div className="site-step" style={{ marginTop: 22, marginBottom: 10 }}>
        <span className="site-step-num">04</span>
        <span className="site-step-label">Visibility</span>
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
