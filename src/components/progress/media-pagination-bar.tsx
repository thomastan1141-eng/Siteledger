"use client";

import { SiteButton, SiteSelect } from "@/components/progress/primitives";

/**
 * Shared pagination controls for Media + Journal/Journey.
 * Page is owned by the parent (URL); this is display + callbacks only.
 */
export function MediaPaginationBar({
  page,
  totalPages,
  totalCount,
  busy,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  busy?: boolean;
  onPageChange: (page: number) => void;
}) {
  if (totalCount === 0) return null;

  const safeTotal = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotal);

  function go(next: number) {
    const clamped = Math.min(Math.max(1, next), safeTotal);
    if (clamped === safePage) return;
    onPageChange(clamped);
  }

  const windowStart = Math.max(1, safePage - 2);
  const windowEnd = Math.min(safeTotal, windowStart + 4);
  const pages: number[] = [];
  for (let p = windowStart; p <= windowEnd; p += 1) pages.push(p);

  return (
    <div className="site-media-pagination" aria-label="Media pagination">
      <span className="site-media-pagination-meta">
        Page {safePage} of {safeTotal}
        <span aria-hidden> · </span>
        {totalCount} item{totalCount === 1 ? "" : "s"}
      </span>
      <div className="site-media-pagination-controls">
        <SiteButton
          type="button"
          variant="ghost"
          disabled={busy || safePage <= 1}
          onClick={() => go(1)}
        >
          First
        </SiteButton>
        <SiteButton
          type="button"
          variant="ghost"
          disabled={busy || safePage <= 1}
          onClick={() => go(safePage - 1)}
        >
          Prev
        </SiteButton>
        <SiteButton
          type="button"
          variant="ghost"
          disabled={busy || safePage <= 1}
          onClick={() => go(safePage - 5)}
        >
          −5
        </SiteButton>
        {pages.map((p) => (
          <SiteButton
            key={p}
            type="button"
            variant={p === safePage ? "soft" : "ghost"}
            disabled={busy}
            onClick={() => go(p)}
            aria-current={p === safePage ? "page" : undefined}
          >
            {p}
          </SiteButton>
        ))}
        <SiteButton
          type="button"
          variant="ghost"
          disabled={busy || safePage >= safeTotal}
          onClick={() => go(safePage + 5)}
        >
          +5
        </SiteButton>
        <SiteButton
          type="button"
          variant="ghost"
          disabled={busy || safePage >= safeTotal}
          onClick={() => go(safePage + 1)}
        >
          Next
        </SiteButton>
        <SiteButton
          type="button"
          variant="ghost"
          disabled={busy || safePage >= safeTotal}
          onClick={() => go(safeTotal)}
        >
          Last
        </SiteButton>
        <label className="site-media-pagination-jump">
          <span>Page</span>
          <SiteSelect
            value={String(safePage)}
            disabled={busy}
            onChange={(e) => go(Number(e.target.value))}
            aria-label="Go to page"
          >
            {Array.from({ length: safeTotal }, (_, i) => i + 1).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </SiteSelect>
        </label>
      </div>
    </div>
  );
}
