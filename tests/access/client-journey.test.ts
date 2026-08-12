import { describe, expect, it } from "vitest";
import {
  groupClientJourneyByDate,
  groupMediaByDate,
} from "@/lib/services/updates";
import type { DailyUpdate, MediaItem } from "@/lib/types";

function media(partial: Partial<MediaItem> & { id: string; date: string }): MediaItem {
  return {
    projectId: "p1",
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
    createdAt: "2026-08-12T00:00:00.000Z",
    ...partial,
  } as MediaItem;
}

describe("CLIENT Journey grouping", () => {
  it("includes days that only have clientVisible media", () => {
    const updates: DailyUpdate[] = [];
    const items = [
      media({ id: "m1", date: "2026-08-12" }),
      media({ id: "m2", date: "2026-08-05", type: "video" }),
    ];
    const groups = groupClientJourneyByDate(updates, items);
    expect(groups.map((g) => g.date)).toEqual(["2026-08-12", "2026-08-05"]);
    const byDate = groupMediaByDate(items);
    expect(byDate["2026-08-12"]).toHaveLength(1);
    expect(byDate["2026-08-05"]).toHaveLength(1);
  });

  it("keeps client_visible update notes on the same day as media", () => {
    const updates: DailyUpdate[] = [
      {
        id: "u1",
        projectId: "p1",
        companyId: "ws",
        date: "2026-08-12",
        workItems: ["Tiling"],
        customActivities: [],
        noWorkToday: false,
        note: "Kitchen progress",
        visibility: "client_visible",
        createdBy: "u",
        createdByName: "U",
        photoCount: 1,
        videoCount: 0,
        mediaIds: ["m1"],
        createdAt: "2026-08-12T00:00:00.000Z",
        updatedAt: "2026-08-12T00:00:00.000Z",
      },
    ];
    const groups = groupClientJourneyByDate(updates, [
      media({ id: "m1", date: "2026-08-12", updateId: "internal-x" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items[0]?.note).toBe("Kitchen progress");
  });
});
