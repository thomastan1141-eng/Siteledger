import { describe, expect, it } from "vitest";
import { storagePathsToDelete } from "@/lib/media-storage-paths";

describe("storagePathsToDelete", () => {
  it("returns original and distinct thumbnail paths", () => {
    expect(
      storagePathsToDelete({
        storagePath: "a/original.jpg",
        thumbnailPath: "a/original_thumb.jpg",
      }),
    ).toEqual(["a/original.jpg", "a/original_thumb.jpg"]);
  });

  it("skips missing or duplicate thumbnailPath", () => {
    expect(storagePathsToDelete({ storagePath: "a/only.jpg" })).toEqual([
      "a/only.jpg",
    ]);
    expect(
      storagePathsToDelete({
        storagePath: "a/same.jpg",
        thumbnailPath: "a/same.jpg",
      }),
    ).toEqual(["a/same.jpg"]);
  });

  it("ignores blank paths", () => {
    expect(
      storagePathsToDelete({ storagePath: "  ", thumbnailPath: "  " }),
    ).toEqual([]);
  });
});
