"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { MediaItem } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { SiteButton, SiteEmpty } from "./primitives";

export function ProgressMediaGrid({
  items,
  allowDownload = false,
}: {
  items: MediaItem[];
  allowDownload?: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const active = activeIndex !== null ? items[activeIndex] : null;

  useEffect(() => {
    if (activeIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveIndex(null);
      if (e.key === "ArrowRight") {
        setActiveIndex((i) =>
          i === null ? i : Math.min(items.length - 1, i + 1),
        );
      }
      if (e.key === "ArrowLeft") {
        setActiveIndex((i) => (i === null ? i : Math.max(0, i - 1)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, items.length]);

  if (!items.length) {
    return (
      <SiteEmpty
        title="No media yet"
        description="Photos and videos from site updates will appear here."
      />
    );
  }

  return (
    <>
      <div className="site-media-grid">
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className="site-media-tile"
            onClick={() => setActiveIndex(index)}
          >
            {item.type === "photo" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.downloadUrl} alt={item.caption || item.fileName} />
            ) : (
              <>
                <video src={item.downloadUrl} muted playsInline preload="metadata" />
                <span className="site-media-tile-label">Video</span>
              </>
            )}
            {item.type === "photo" ? (
              <span className="site-media-tile-label">
                {formatDate(item.date)}
                {item.workItems[0] ? ` · ${item.workItems[0]}` : ""}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {active && activeIndex !== null ? (
        <div className="site-lightbox">
          <button
            type="button"
            className="site-btn site-btn-ghost"
            style={{ position: "absolute", top: 16, right: 16, color: "#fff" }}
            onClick={() => setActiveIndex(null)}
            aria-label="Close"
          >
            <X size={18} />
          </button>
          {activeIndex > 0 ? (
            <button
              type="button"
              className="site-btn site-btn-ghost"
              style={{ position: "absolute", left: 16, color: "#fff" }}
              onClick={() => setActiveIndex(activeIndex - 1)}
            >
              <ChevronLeft size={20} />
            </button>
          ) : null}
          {activeIndex < items.length - 1 ? (
            <button
              type="button"
              className="site-btn site-btn-ghost"
              style={{ position: "absolute", right: 16, color: "#fff" }}
              onClick={() => setActiveIndex(activeIndex + 1)}
            >
              <ChevronRight size={20} />
            </button>
          ) : null}
          <div className="site-lightbox-frame">
            {active.type === "photo" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={active.downloadUrl} alt={active.caption || active.fileName} />
            ) : (
              <video src={active.downloadUrl} controls playsInline />
            )}
            <div className="site-lightbox-meta">
              <div>
                {formatDate(active.date)}
                {active.workItems.length
                  ? ` · ${active.workItems.join(" · ")}`
                  : ""}
                {active.caption ? ` — ${active.caption}` : ""}
              </div>
              {allowDownload ? (
                <a href={active.downloadUrl} target="_blank" rel="noreferrer">
                  <SiteButton variant="soft" type="button">
                    Download
                  </SiteButton>
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
