"use client";

import { useEffect, useRef, useState } from "react";
import {
  invalidateMediaPageCache,
  listMediaPage,
  type MediaPageFilters,
  type MediaSurface,
} from "@/lib/services/media-pagination";
import type { MediaItem } from "@/lib/types";

/**
 * Race-safe media page loader. Only the latest request may commit.
 * Cache is keyed by projectId + surface + page inside listMediaPage.
 */
export function useMediaPage(input: {
  enabled: boolean;
  surface: MediaSurface;
  filters: MediaPageFilters | null;
  page: number;
  /** Fired once when Firestore clamps the requested page (e.g. past last). */
  onPageClamp?: (resolvedPage: number) => void;
}) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const seq = useRef(0);
  const clampRef = useRef(input.onPageClamp);
  clampRef.current = input.onPageClamp;

  async function reload(opts?: { bypassCache?: boolean }) {
    if (!input.enabled || !input.filters?.projectId || !input.filters.workspaceId) {
      setItems([]);
      setTotalCount(0);
      setTotalPages(1);
      setPage(1);
      setLoading(false);
      return;
    }
    const requestedPage = Math.max(1, Math.floor(input.page) || 1);
    const requestId = ++seq.current;
    setLoading(true);
    setError("");
    try {
      if (opts?.bypassCache) {
        invalidateMediaPageCache(input.filters.projectId, input.surface);
      }
      const result = await listMediaPage(input.filters, {
        surface: input.surface,
        page: requestedPage,
        bypassCache: opts?.bypassCache,
      });
      if (requestId !== seq.current) return;
      setItems(result.items);
      setPage(result.page);
      setTotalCount(result.totalCount);
      setTotalPages(result.totalPages);
      if (result.page !== requestedPage) {
        clampRef.current?.(result.page);
      }
    } catch (err) {
      if (requestId !== seq.current) return;
      setItems([]);
      setError(err instanceof Error ? err.message : "Could not load media.");
    } finally {
      if (requestId === seq.current) setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional filter fields
  }, [
    input.enabled,
    input.surface,
    input.page,
    input.filters?.projectId,
    input.filters?.workspaceId,
    input.filters?.clientOnly,
    input.filters?.type,
    input.filters?.visibility,
  ]);

  return {
    items,
    page,
    totalCount,
    totalPages,
    loading,
    error,
    reload,
  };
}
