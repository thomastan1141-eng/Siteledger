import { afterEach, describe, expect, it } from "vitest";
import {
  MEDIA_PAGE_SIZE,
  __clearMediaPageCacheForTests,
  __mediaPageCacheStatsForTests,
  __seedMediaPageCacheForTests,
  invalidateMediaPageCache,
  makeMediaPageCacheKey,
} from "@/lib/services/media-pagination";
import { groupJournalMediaPage } from "@/lib/services/updates";
import type { DailyUpdate, MediaItem } from "@/lib/types";

function media(
  partial: Partial<MediaItem> & { id: string; date: string; createdAt: string },
): MediaItem {
  return {
    projectId: "proj-a",
    companyId: "ws",
    type: "photo",
    storagePath: "path",
    downloadUrl: "",
    fileName: "a.jpg",
    contentType: "image/jpeg",
    sizeBytes: 1,
    workItems: [],
    visibility: "client_visible",
    clientVisible: true,
    uploadedBy: "u1",
    uploadedByName: "U",
    ...partial,
  } as MediaItem;
}

function update(
  partial: Partial<DailyUpdate> & { id: string; date: string },
): DailyUpdate {
  return {
    projectId: "proj-a",
    companyId: "ws",
    workItems: [],
    customActivities: [],
    noWorkToday: false,
    note: "",
    visibility: "client_visible",
    createdBy: "u",
    createdByName: "U",
    photoCount: 0,
    videoCount: 0,
    mediaIds: [],
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
    ...partial,
  };
}

afterEach(() => {
  __clearMediaPageCacheForTests();
});

describe("media pagination constants", () => {
  it("caps each page at 40 mixed items", () => {
    expect(MEDIA_PAGE_SIZE).toBe(40);
  });
});

describe("makeMediaPageCacheKey", () => {
  const base = { projectId: "A", workspaceId: "ws" };

  it("isolates Project A from Project B", () => {
    const a = makeMediaPageCacheKey("Media", { ...base, projectId: "A" }, 1);
    const b = makeMediaPageCacheKey("Media", { ...base, projectId: "B" }, 1);
    expect(a).not.toBe(b);
  });

  it("isolates Media from Journal and client from staff", () => {
    const media = makeMediaPageCacheKey("Media", base, 2);
    const journal = makeMediaPageCacheKey("Journal", base, 2);
    const client = makeMediaPageCacheKey("Media", { ...base, clientOnly: true }, 2);
    expect(media).not.toBe(journal);
    expect(media).not.toBe(client);
  });
});

describe("3-page LRU cache", () => {
  it("keeps only the latest 3 visited pages", () => {
    const filters = { projectId: "A", workspaceId: "ws" };
    for (let p = 1; p <= 4; p += 1) {
      __seedMediaPageCacheForTests(
        makeMediaPageCacheKey("Media", filters, p),
        [media({ id: `m${p}`, date: "2026-08-01", createdAt: `2026-08-0${p}T00:00:00.000Z` })],
      );
    }
    const stats = __mediaPageCacheStatsForTests();
    expect(stats.max).toBe(3);
    expect(stats.size).toBe(3);
    expect(stats.keys).not.toContain(
      makeMediaPageCacheKey("Media", filters, 1),
    );
    expect(stats.keys).toEqual([
      makeMediaPageCacheKey("Media", filters, 2),
      makeMediaPageCacheKey("Media", filters, 3),
      makeMediaPageCacheKey("Media", filters, 4),
    ]);
  });

  it("invalidateMediaPageCache does not clear another project", () => {
    __seedMediaPageCacheForTests(
      makeMediaPageCacheKey("Media", { projectId: "A", workspaceId: "ws" }, 1),
    );
    __seedMediaPageCacheForTests(
      makeMediaPageCacheKey("Media", { projectId: "B", workspaceId: "ws" }, 1),
    );
    invalidateMediaPageCache("A");
    const stats = __mediaPageCacheStatsForTests();
    expect(stats.keys).toEqual([
      makeMediaPageCacheKey("Media", { projectId: "B", workspaceId: "ws" }, 1),
    ]);
  });
});

describe("groupJournalMediaPage", () => {
  it("groups only dates present on the current media page", () => {
    const pageMedia = [
      media({ id: "m1", date: "2026-08-12", createdAt: "2026-08-12T12:00:00.000Z" }),
      media({
        id: "m2",
        date: "2026-08-12",
        type: "video",
        createdAt: "2026-08-12T11:00:00.000Z",
      }),
      media({ id: "m3", date: "2026-08-10", createdAt: "2026-08-10T09:00:00.000Z" }),
    ];
    const updates = [
      update({ id: "u1", date: "2026-08-12", note: "Day note" }),
      update({ id: "u2", date: "2026-08-01", note: "Orphan update day" }),
    ];
    const view = groupJournalMediaPage(pageMedia, updates);
    expect(view.groups.map((g) => g.date)).toEqual(["2026-08-12", "2026-08-10"]);
    expect(view.mediaByDate["2026-08-12"]).toHaveLength(2);
    expect(view.groups[0]?.items[0]?.note).toBe("Day note");
    expect(view.groups.some((g) => g.date === "2026-08-01")).toBe(false);
  });

  it("continues a date across page boundaries via per-page media only", () => {
    const page1Tail = [
      media({ id: "a", date: "2026-08-12", createdAt: "2026-08-12T10:00:00.000Z" }),
    ];
    const page2Head = [
      media({ id: "b", date: "2026-08-12", createdAt: "2026-08-12T09:00:00.000Z" }),
      media({ id: "c", date: "2026-08-11", createdAt: "2026-08-11T09:00:00.000Z" }),
    ];
    const updates = [update({ id: "u1", date: "2026-08-12", note: "Same day" })];
    const p1 = groupJournalMediaPage(page1Tail, updates);
    const p2 = groupJournalMediaPage(page2Head, updates);
    expect(p1.groups[0]?.date).toBe("2026-08-12");
    expect(p2.groups[0]?.date).toBe("2026-08-12");
    expect(p2.mediaByDate["2026-08-12"]?.[0]?.id).toBe("b");
  });
});
