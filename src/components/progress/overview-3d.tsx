"use client";

import { FormEvent, useEffect, useState } from "react";
import { Box, ExternalLink, ImagePlus, Pencil, Trash2 } from "lucide-react";
import {
  removeProject3dImage,
  saveTour3dLink,
  selectOverview3dImage,
  uploadProject3dImages,
} from "@/lib/services/projects";
import type { Project } from "@/lib/types";
import { isImageFile } from "@/lib/utils";
import {
  SiteButton,
  SiteField,
  SiteInput,
  SiteSection,
} from "./primitives";

export function Overview3DPanel({
  project,
  editable = false,
  onUpdated,
}: {
  project: Project;
  editable?: boolean;
  onUpdated?: (next: Project) => void;
}) {
  const [link, setLink] = useState(project.tour3dUrl || "");
  const [label, setLabel] = useState(project.tour3dLabel || "");
  const [editingLink, setEditingLink] = useState(!project.tour3dUrl);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<Record<string, number>>({});

  const images = project.images3d || [];
  const selectedId = project.overview3dImageId || images[0]?.id;
  const workspaceId = project.workspaceId || project.companyId;

  useEffect(() => {
    setLink(project.tour3dUrl || "");
    setLabel(project.tour3dLabel || "");
    if (project.tour3dUrl) setEditingLink(false);
  }, [project.tour3dUrl, project.tour3dLabel]);

  async function onSaveLink(e: FormEvent) {
    e.preventDefault();
    if (!link.trim()) {
      setError("Enter a 3D link first.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await saveTour3dLink(project.id, link, label, workspaceId);
      onUpdated?.(next);
      setEditingLink(false);
      setMessage("3D link saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save link");
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(files: FileList | File[] | null) {
    if (!files) return;
    const imagesOnly = Array.from(files).filter((f) => isImageFile(f));
    if (!imagesOnly.length) {
      setError("Please choose image files for 3D / panorama upload.");
      return;
    }

    setUploading(true);
    setError("");
    setMessage("");
    try {
      const next = await uploadProject3dImages(
        project.id,
        imagesOnly,
        (fileName, pct) =>
          setProgress((prev) => ({ ...prev, [fileName]: pct })),
        workspaceId,
      );
      onUpdated?.(next);
      setMessage(`${imagesOnly.length} 3D image(s) uploaded.`);
      setProgress({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onSelectImage(imageId: string) {
    setError("");
    try {
      const next = await selectOverview3dImage(project.id, imageId, workspaceId);
      onUpdated?.(next);
      setMessage("Overview image updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to select image");
    }
  }

  return (
    <SiteSection
      title="3D view"
      description="Save a tour link, upload 3D stills, then pick which image appears on overview."
    >
      <div className="site-3d-panel">
        <div className="site-3d-link-card">
          <div className="site-3d-link-head">
            <Box size={18} />
            <div>
              <strong>3D tour link</strong>
              <p>Matterport, Kuula, or any shareable 3D walkthrough URL.</p>
            </div>
          </div>

          {editable && editingLink ? (
            <form onSubmit={onSaveLink} className="site-3d-link-form">
              <SiteField label="3D link URL">
                <SiteInput
                  type="url"
                  placeholder="https://my.matterport.com/show/?m=..."
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  required
                />
              </SiteField>
              <SiteField label="Label (optional)">
                <SiteInput
                  placeholder="Living room 3D tour"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </SiteField>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <SiteButton type="submit" variant="accent" disabled={busy}>
                  {busy ? "Saving…" : "Save 3D link"}
                </SiteButton>
                {project.tour3dUrl ? (
                  <SiteButton
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setLink(project.tour3dUrl || "");
                      setLabel(project.tour3dLabel || "");
                      setEditingLink(false);
                    }}
                  >
                    Cancel
                  </SiteButton>
                ) : null}
              </div>
            </form>
          ) : project.tour3dUrl ? (
            <div className="site-3d-saved-link">
              <a
                href={project.tour3dUrl}
                target="_blank"
                rel="noreferrer"
                className="site-3d-open-link"
              >
                <span>{project.tour3dLabel || project.tour3dUrl}</span>
                <ExternalLink size={16} />
              </a>
              {editable ? (
                <button
                  type="button"
                  className="site-3d-edit-link"
                  onClick={() => setEditingLink(true)}
                >
                  <Pencil size={14} />
                  Edit link
                </button>
              ) : null}
            </div>
          ) : (
            <p className="site-3d-empty">No 3D tour link yet.</p>
          )}
        </div>

        <div className="site-3d-images-card">
          <div className="site-3d-link-head">
            <ImagePlus size={18} />
            <div>
              <strong>3D images</strong>
              <p>
                {editable
                  ? "Upload stills, then tap one to show it on overview."
                  : "Selected overview image is highlighted."}
              </p>
            </div>
          </div>

          {editable ? (
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
                onUpload(e.dataTransfer.files);
              }}
            >
              <strong>
                {uploading ? "Uploading…" : "Drop 3D images here"}
              </strong>
              <span>JPG / PNG / HEIC · multiple files supported</span>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.heic,.heif,image/*"
                multiple
                disabled={uploading}
                onChange={(e) => {
                  onUpload(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          ) : null}

          {images.length ? (
            <div className="site-3d-grid">
              {images.map((image) => {
                const selected = image.id === selectedId;
                return (
                  <button
                    key={image.id}
                    type="button"
                    className="site-3d-tile"
                    data-selected={selected}
                    onClick={() => {
                      if (editable) onSelectImage(image.id);
                    }}
                    disabled={!editable}
                    title={
                      editable
                        ? selected
                          ? "Selected for overview"
                          : "Use on overview"
                        : image.fileName
                    }
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.downloadUrl} alt={image.fileName} />
                    {selected ? (
                      <span className="site-3d-selected-badge">Overview</span>
                    ) : null}
                    {editable ? (
                      <span
                        className="site-upload-preview-remove"
                        role="button"
                        tabIndex={0}
                        onClick={async (e) => {
                          e.stopPropagation();
                          setError("");
                          try {
                            const next = await removeProject3dImage(
                              project.id,
                              image.id,
                              workspaceId,
                            );
                            onUpdated?.(next);
                          } catch (err) {
                            setError(
                              err instanceof Error
                                ? err.message
                                : "Failed to remove image",
                            );
                          }
                        }}
                        onKeyDown={async (e) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          e.stopPropagation();
                          setError("");
                          try {
                            const next = await removeProject3dImage(
                              project.id,
                              image.id,
                              workspaceId,
                            );
                            onUpdated?.(next);
                          } catch (err) {
                            setError(
                              err instanceof Error
                                ? err.message
                                : "Failed to remove image",
                            );
                          }
                        }}
                        aria-label={`Remove ${image.fileName}`}
                      >
                        <Trash2 size={14} />
                      </span>
                    ) : null}
                    {progress[image.fileName] != null ? (
                      <div className="site-upload-preview-progress">
                        <i style={{ width: `${progress[image.fileName]}%` }} />
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="site-3d-empty">No 3D images uploaded yet.</p>
          )}
        </div>
      </div>

      {message ? (
        <p style={{ marginTop: 12, color: "var(--site-success)", fontSize: 13 }}>
          {message}
        </p>
      ) : null}
      {error ? (
        <p style={{ marginTop: 12, color: "var(--site-danger)", fontSize: 13 }}>
          {error}
        </p>
      ) : null}
    </SiteSection>
  );
}

/** Resolve which image should appear in the overview hero. */
export function getOverviewDisplayImage(project: Project) {
  const images = project.images3d || [];
  if (!images.length) return project.coverPhotoUrl;
  const selected =
    images.find((img) => img.id === project.overview3dImageId) || images[0];
  return selected.downloadUrl;
}
