"use client";

import { useEffect, useState } from "react";
import { getBlob, ref } from "firebase/storage";
import { getFirebaseStorage } from "@/lib/firebase";

/**
 * Loads a Storage object through the authenticated Firebase Web SDK getBlob().
 * variant="thumb" prefers thumbnailPath and falls back to storagePath for
 * historical records that have no thumbnail.
 */
export function SecureStorageImage({
  storagePath,
  thumbnailPath,
  variant = "original",
  alt = "",
  className,
}: {
  storagePath?: string;
  thumbnailPath?: string;
  variant?: "thumb" | "original";
  alt?: string;
  className?: string;
}) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const path =
    variant === "thumb"
      ? thumbnailPath || storagePath || ""
      : storagePath || "";

  useEffect(() => {
    setFailed(false);
    setUrl("");
    if (!path) {
      setFailed(true);
      return;
    }
    let active = true;
    let objectUrl = "";
    getBlob(ref(getFirebaseStorage(), path))
      .then((blob) => {
        const next = URL.createObjectURL(blob);
        if (!active) {
          URL.revokeObjectURL(next);
          return;
        }
        objectUrl = next;
        setUrl(next);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (failed) return <span>Unavailable</span>;
  if (!url) return <span>Loading…</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={url} alt={alt} loading="lazy" />;
}
