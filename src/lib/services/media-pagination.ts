/**
 * Cursor pagination for project media (photos + videos mixed).
 * Never loads Storage blobs — only Firestore docs for the requested page
 * (and lightweight cursor-resolution docs when jumping).
 *
 * Scoped by the caller's projectId + workspaceId — no hardcoded projects.
 */
import {
  collection,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type Query,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { AUTH_BYPASS, DEMO_MEDIA } from "@/lib/demo";
import { mediaPath, requireTenantId } from "@/lib/paths";
import type { MediaItem, MediaType, MediaVisibility } from "@/lib/types";

export const MEDIA_PAGE_SIZE = 40;

export type MediaSurface = "Media" | "Journal";

export type MediaPageFilters = {
  projectId: string;
  workspaceId: string;
  /** CLIENT Journey/Media: clientVisible + active only. */
  clientOnly?: boolean;
  type?: MediaType;
  /** Staff library visibility chip (not used for CLIENT). */
  visibility?: MediaVisibility;
};

export type MediaPageResult = {
  items: MediaItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  /** Last Firestore doc on this page — for Next cursor. */
  endCursor: QueryDocumentSnapshot | null;
};

type CacheEntry = {
  items: MediaItem[];
  endCursor: QueryDocumentSnapshot | null;
  totalCount: number;
  totalPages: number;
  fetchedAt: number;
};

/** LRU of the latest 3 visited pages; keys include projectId + surface + page. */
const pageCache = new Map<string, CacheEntry>();
const pageCacheOrder: string[] = [];
const MAX_CACHED_PAGES = 3;

/** Public cache key builder — also used by unit tests for A/B isolation. */
export function makeMediaPageCacheKey(
  surface: MediaSurface,
  filters: MediaPageFilters,
  page: number,
) {
  return [
    filters.projectId,
    surface,
    filters.clientOnly ? "client" : "staff",
    filters.type || "all",
    filters.visibility || "any",
    String(page),
  ].join("|");
}

function cacheKey(
  surface: MediaSurface,
  filters: MediaPageFilters,
  page: number,
) {
  return makeMediaPageCacheKey(surface, filters, page);
}

function cacheGet(key: string): CacheEntry | undefined {
  return pageCache.get(key);
}

function cacheSet(key: string, entry: CacheEntry) {
  if (pageCache.has(key)) {
    const idx = pageCacheOrder.indexOf(key);
    if (idx >= 0) pageCacheOrder.splice(idx, 1);
  }
  pageCache.set(key, entry);
  pageCacheOrder.push(key);
  while (pageCacheOrder.length > MAX_CACHED_PAGES) {
    const oldest = pageCacheOrder.shift();
    if (oldest) pageCache.delete(oldest);
  }
}

/** Drop cached pages for a project/surface (e.g. after upload/delete). */
export function invalidateMediaPageCache(
  projectId: string,
  surface?: MediaSurface,
) {
  const prefix = surface ? `${projectId}|${surface}|` : `${projectId}|`;
  for (const key of [...pageCache.keys()]) {
    if (key.startsWith(prefix)) {
      pageCache.delete(key);
      const idx = pageCacheOrder.indexOf(key);
      if (idx >= 0) pageCacheOrder.splice(idx, 1);
    }
  }
}

/** @internal — vitest only */
export function __mediaPageCacheStatsForTests() {
  return {
    size: pageCache.size,
    keys: [...pageCacheOrder],
    max: MAX_CACHED_PAGES,
  };
}

/** @internal — vitest only */
export function __seedMediaPageCacheForTests(
  key: string,
  items: MediaItem[] = [],
) {
  cacheSet(key, {
    items,
    endCursor: null,
    totalCount: items.length,
    totalPages: 1,
    fetchedAt: Date.now(),
  });
}

/** @internal — vitest only */
export function __clearMediaPageCacheForTests() {
  pageCache.clear();
  pageCacheOrder.length = 0;
}

function mapDocs(docs: QueryDocumentSnapshot[]): MediaItem[] {
  return docs.map(
    (d) =>
      ({ id: d.id, ...(d.data() as Omit<MediaItem, "id">) }) as MediaItem,
  );
}

function buildConstraints(filters: MediaPageFilters): QueryConstraint[] {
  const constraints: QueryConstraint[] = [];
  if (filters.clientOnly) {
    constraints.push(where("clientVisible", "==", true));
  }
  constraints.push(where("mediaLifecycle", "==", "active"));
  if (filters.type) {
    constraints.push(where("type", "==", filters.type));
  }
  if (filters.visibility && !filters.clientOnly) {
    constraints.push(where("visibility", "==", filters.visibility));
  }
  constraints.push(orderBy("createdAt", "desc"));
  return constraints;
}

function countQuery(filters: MediaPageFilters): Query {
  const ws = requireTenantId(filters.workspaceId);
  const constraints: QueryConstraint[] = [];
  if (filters.clientOnly) {
    constraints.push(where("clientVisible", "==", true));
  }
  constraints.push(where("mediaLifecycle", "==", "active"));
  if (filters.type) {
    constraints.push(where("type", "==", filters.type));
  }
  if (filters.visibility && !filters.clientOnly) {
    constraints.push(where("visibility", "==", filters.visibility));
  }
  return query(
    collection(getFirebaseDb(), mediaPath(filters.projectId, ws)),
    ...constraints,
  );
}

function demoPage(
  filters: MediaPageFilters,
  page: number,
): MediaPageResult {
  let items = DEMO_MEDIA.filter((m) => m.projectId === filters.projectId);
  if (filters.clientOnly) {
    items = items.filter(
      (m) =>
        m.clientVisible === true ||
        m.visibility === "client_visible" ||
        m.visibility === "handover",
    );
  }
  if (filters.type) items = items.filter((m) => m.type === filters.type);
  if (filters.visibility) {
    items = items.filter((m) => m.visibility === filters.visibility);
  }
  items = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / MEDIA_PAGE_SIZE) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * MEDIA_PAGE_SIZE;
  const slice = items.slice(start, start + MEDIA_PAGE_SIZE);
  return {
    items: slice,
    page: safePage,
    pageSize: MEDIA_PAGE_SIZE,
    totalCount,
    totalPages: totalCount === 0 ? 1 : totalPages,
    endCursor: null,
  };
}

/**
 * Resolve the document that ends page (targetPage - 1), without rendering
 * images. Uses nearest cached endCursor when possible; otherwise a single
 * Firestore read of up to (targetPage-1)*PAGE_SIZE doc snapshots.
 */
async function resolveStartAfter(
  filters: MediaPageFilters,
  surface: MediaSurface,
  targetPage: number,
): Promise<QueryDocumentSnapshot | null> {
  if (targetPage <= 1) return null;

  // Prefer nearest cached page strictly before target.
  let bestPage = 0;
  let bestCursor: QueryDocumentSnapshot | null = null;
  for (let p = targetPage - 1; p >= 1; p -= 1) {
    const hit = cacheGet(cacheKey(surface, filters, p));
    if (hit?.endCursor) {
      bestPage = p;
      bestCursor = hit.endCursor;
      break;
    }
  }
  if (bestCursor && bestPage === targetPage - 1) return bestCursor;

  const skipFrom = bestPage; // pages already accounted for via cursor
  const docsToSkip = (targetPage - 1 - skipFrom) * MEDIA_PAGE_SIZE;
  if (docsToSkip <= 0) return bestCursor;

  const constraints: QueryConstraint[] = [...buildConstraints(filters)];
  if (bestCursor) constraints.push(startAfter(bestCursor));
  constraints.push(limit(docsToSkip));
  const ws = requireTenantId(filters.workspaceId);
  const snap = await getDocs(
    query(
      collection(getFirebaseDb(), mediaPath(filters.projectId, ws)),
      ...constraints,
    ),
  );
  if (snap.empty) return bestCursor;
  return snap.docs[snap.docs.length - 1]!;
}

export async function countMediaPages(
  filters: MediaPageFilters,
): Promise<{ totalCount: number; totalPages: number }> {
  if (AUTH_BYPASS) {
    const demo = demoPage(filters, 1);
    return { totalCount: demo.totalCount, totalPages: demo.totalPages };
  }
  const agg = await getCountFromServer(countQuery(filters));
  const totalCount = agg.data().count;
  const totalPages =
    totalCount === 0 ? 1 : Math.ceil(totalCount / MEDIA_PAGE_SIZE);
  return { totalCount, totalPages };
}

/**
 * Fetch one media page (max 40 mixed photo/video docs). Does not touch Storage.
 */
export async function listMediaPage(
  filters: MediaPageFilters,
  options: {
    surface: MediaSurface;
    page: number;
    /** When true, skip cache read (still writes cache). */
    bypassCache?: boolean;
  },
): Promise<MediaPageResult> {
  const page = Math.max(1, Math.floor(options.page) || 1);
  const key = cacheKey(options.surface, filters, page);

  if (!options.bypassCache) {
    const hit = cacheGet(key);
    if (hit) {
      return {
        items: hit.items,
        page,
        pageSize: MEDIA_PAGE_SIZE,
        totalCount: hit.totalCount,
        totalPages: hit.totalPages,
        endCursor: hit.endCursor,
      };
    }
  }

  if (AUTH_BYPASS) {
    const demo = demoPage(filters, page);
    cacheSet(key, {
      items: demo.items,
      endCursor: null,
      totalCount: demo.totalCount,
      totalPages: demo.totalPages,
      fetchedAt: Date.now(),
    });
    return demo;
  }

  const { totalCount, totalPages } = await countMediaPages(filters);
  const safePage = Math.min(page, totalPages);

  if (totalCount === 0) {
    const empty: MediaPageResult = {
      items: [],
      page: 1,
      pageSize: MEDIA_PAGE_SIZE,
      totalCount: 0,
      totalPages: 1,
      endCursor: null,
    };
    cacheSet(cacheKey(options.surface, filters, 1), {
      items: [],
      endCursor: null,
      totalCount: 0,
      totalPages: 1,
      fetchedAt: Date.now(),
    });
    return empty;
  }

  // If requested page was clamped, try cache for safe page.
  if (safePage !== page) {
    const clampedKey = cacheKey(options.surface, filters, safePage);
    const hit = cacheGet(clampedKey);
    if (hit && !options.bypassCache) {
      return {
        items: hit.items,
        page: safePage,
        pageSize: MEDIA_PAGE_SIZE,
        totalCount: hit.totalCount,
        totalPages: hit.totalPages,
        endCursor: hit.endCursor,
      };
    }
  }

  const startAfterDoc = await resolveStartAfter(
    filters,
    options.surface,
    safePage,
  );
  const pageConstraints: QueryConstraint[] = [...buildConstraints(filters)];
  if (startAfterDoc) pageConstraints.push(startAfter(startAfterDoc));
  pageConstraints.push(limit(MEDIA_PAGE_SIZE));

  const snap = await getDocs(
    query(
      collection(
        getFirebaseDb(),
        mediaPath(filters.projectId, requireTenantId(filters.workspaceId)),
      ),
      ...pageConstraints,
    ),
  );

  const items = mapDocs(snap.docs);
  const endCursor = snap.docs.length ? snap.docs[snap.docs.length - 1]! : null;
  const result: MediaPageResult = {
    items,
    page: safePage,
    pageSize: MEDIA_PAGE_SIZE,
    totalCount,
    totalPages,
    endCursor,
  };
  cacheSet(cacheKey(options.surface, filters, safePage), {
    items,
    endCursor,
    totalCount,
    totalPages,
    fetchedAt: Date.now(),
  });
  return result;
}

/** Latest N media docs for overview strips — not a full project load. */
export async function listLatestMedia(
  filters: MediaPageFilters,
  take: number,
): Promise<MediaItem[]> {
  if (AUTH_BYPASS) {
    return demoPage(filters, 1).items.slice(0, take);
  }
  const ws = requireTenantId(filters.workspaceId);
  const snap = await getDocs(
    query(
      collection(getFirebaseDb(), mediaPath(filters.projectId, ws)),
      ...buildConstraints(filters),
      limit(Math.max(1, take)),
    ),
  );
  return mapDocs(snap.docs);
}
