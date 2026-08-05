"use client";

import { useState } from "react";

/**
 * Bunny Stream thumbnails are served directly from the CDN
 * (vz-*.b-cdn.net) and can 403 when the library's "Block Direct URL
 * File Access" / Allowed Referrers security setting does not match the
 * current domain. Fall back to a plain placeholder instead of a broken
 * image icon when that happens.
 */
export function BunnyThumbnail({
  src,
  alt,
  className,
  style,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={className}
        style={{
          width: "100%",
          height: "100%",
          background: "#222",
          display: "grid",
          placeItems: "center",
          color: "#fff",
          fontSize: 12,
          ...style,
        }}
      >
        Video
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      referrerPolicy="strict-origin-when-cross-origin"
      onError={() => setFailed(true)}
    />
  );
}
