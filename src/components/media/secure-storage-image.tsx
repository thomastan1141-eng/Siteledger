"use client";

import { useEffect, useState } from "react";
import { getBlob, ref } from "firebase/storage";
import { getFirebaseStorage } from "@/lib/firebase";

/**
 * Session-scoped blob URLs for Storage paths. Survives SecureStorageImage
 * unmount/remount so returning to a cached pagination page does not
 * re-download thumbnails. Do not revoke while paths may still be shown.
 */
const blobUrlByPath = new Map<string, string>();
const blobInflightByPath = new Map<string, Promise<string>>();

function loadBlobUrl(path: string): Promise<string> {
  const hit = blobUrlByPath.get(path);
  if (hit) return Promise.resolve(hit);
  const pending = blobInflightByPath.get(path);
  if (pending) return pending;
  const request = getBlob(ref(getFirebaseStorage(), path))
    .then((blob) => {
      const existing = blobUrlByPath.get(path);
      if (existing) return existing;
      const objectUrl = URL.createObjectURL(blob);
      blobUrlByPath.set(path, objectUrl);
      return objectUrl;
    })
    .finally(() => {
      blobInflightByPath.delete(path);
    });
  blobInflightByPath.set(path, request);
  return request;
}

/**
 * Loads a Storage object through the authenticated Firebase Web SDK getBlob().
 * variant="thumb" prefers thumbnailPath and falls back to storagePath for
 * historical records that have no thumbnail.
 *
 * fallbackUrl: optional download-token URL used only when getBlob is denied
 * (e.g. Purchase photos for CLIENT when Storage Rules deny the object read
 * but the object already carries a firebase download token). Never used as
 * the primary path for Media.
 */
export function SecureStorageImage({
  storagePath,
  thumbnailPath,
  fallbackUrl,
  variant = "original",
  alt = "",
  className,
}: {
  storagePath?: string;
  thumbnailPath?: string;
  fallbackUrl?: string;
  variant?: "thumb" | "original";
  alt?: string;
  className?: string;
}) {
  const primary =
    variant === "thumb"
      ? thumbnailPath || storagePath || ""
      : storagePath || "";
  const secondary =
    variant === "thumb" &&
    thumbnailPath &&
    storagePath &&
    thumbnailPath !== storagePath
      ? storagePath
      : "";

  const cachedPrimary = primary ? blobUrlByPath.get(primary) : undefined;
  const [url, setUrl] = useState(cachedPrimary || "");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    if (!primary && !fallbackUrl) {
      setFailed(true);
      setUrl("");
      return;
    }

    const immediate =
      (primary && blobUrlByPath.get(primary)) ||
      (secondary && blobUrlByPath.get(secondary)) ||
      "";
    if (immediate) {
      setFailed(false);
      setUrl(immediate);
      return;
    }

    setFailed(false);
    setUrl("");

    void (async () => {
      if (primary) {
        try {
          const next = await loadBlobUrl(primary);
          if (!active) return;
          setUrl(next);
          return;
        } catch {
          // try secondary / token fallback
        }
      }
      if (secondary) {
        try {
          const next = await loadBlobUrl(secondary);
          if (!active) return;
          setUrl(next);
          return;
        } catch {
          // token fallback
        }
      }
      if (fallbackUrl && active) {
        setUrl(fallbackUrl);
        return;
      }
      if (active) setFailed(true);
    })();

    return () => {
      active = false;
      // Do not revoke — remounts / cached pages reuse blobUrlByPath.
    };
  }, [primary, secondary, fallbackUrl]);

  if (failed) return <span>Unavailable</span>;
  if (!url) return <span>Loading…</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={url} alt={alt} loading="lazy" />;
}
