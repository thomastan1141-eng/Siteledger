"use client";

import { useEffect, useState } from "react";
import { getBlob, ref } from "firebase/storage";
import { getFirebaseStorage } from "@/lib/firebase";

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
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    setUrl("");
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

    if (!primary && !fallbackUrl) {
      setFailed(true);
      return;
    }

    let active = true;
    let objectUrl = "";

    async function tryBlob(path: string) {
      const blob = await getBlob(ref(getFirebaseStorage(), path));
      return URL.createObjectURL(blob);
    }

    void (async () => {
      if (primary) {
        try {
          const next = await tryBlob(primary);
          if (!active) {
            URL.revokeObjectURL(next);
            return;
          }
          objectUrl = next;
          setUrl(next);
          return;
        } catch {
          // try secondary / token fallback
        }
      }
      if (secondary) {
        try {
          const next = await tryBlob(secondary);
          if (!active) {
            URL.revokeObjectURL(next);
            return;
          }
          objectUrl = next;
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
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [variant, thumbnailPath, storagePath, fallbackUrl]);

  if (failed) return <span>Unavailable</span>;
  if (!url) return <span>Loading…</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={url} alt={alt} loading="lazy" />;
}
