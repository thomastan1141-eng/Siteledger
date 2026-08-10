"use client";

import { useEffect, useState } from "react";

/**
 * Bunny video thumbnail. Independent of playback authorization — a broken
 * or missing thumbnail (e.g. Bunny library "Block Direct URL File Access")
 * never blocks the video from playing; it only falls back to a plain
 * placeholder here.
 */
export function BunnyThumbnail({
  src,
  alt,
  className,
  style,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

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
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
      onError={() => setFailed(true)}
    />
  );
}
