import { describe, expect, it } from "vitest";
import { thumbnailStoragePath } from "@/lib/paths";

describe("thumbnailStoragePath", () => {
  it("places _thumb.jpg beside the original file name", () => {
    expect(
      thumbnailStoragePath(
        "companies/ws/projects/p1/updates/2026-08-12/internal/1786-abc-IMG_1.JPEG",
      ),
    ).toBe(
      "companies/ws/projects/p1/updates/2026-08-12/internal/1786-abc-IMG_1_thumb.jpg",
    );
  });

  it("handles purchase photo paths", () => {
    expect(
      thumbnailStoragePath(
        "companies/ws/projects/p1/purchases/buy1/photos/1786-x-photo.png",
      ),
    ).toBe(
      "companies/ws/projects/p1/purchases/buy1/photos/1786-x-photo_thumb.jpg",
    );
  });

  it("does not replace the original path string in place", () => {
    const original =
      "companies/ws/projects/p1/updates/2026-08-12/photos/shot.jpg";
    const thumb = thumbnailStoragePath(original);
    expect(original.endsWith("shot.jpg")).toBe(true);
    expect(thumb).not.toBe(original);
    expect(thumb.endsWith("shot_thumb.jpg")).toBe(true);
  });
});
