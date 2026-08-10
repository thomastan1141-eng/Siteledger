import { readFileSync } from "fs";
import { resolve } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createEmbedPlayback } = await import("@/lib/bunny/server");
const { bunnyDetailsToPatch } = await import("@/lib/bunny/media-store");
const { resolveEffectivePermissions } = await import(
  "@/lib/server/project-directory"
);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Firebase photo delivery — no Admin signed URL path", () => {
  it("media-grid loads photos via Storage Web SDK getBlob, not /api/media download", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/progress/media-grid.tsx"),
      "utf8",
    );
    expect(source).toContain('from "firebase/storage"');
    expect(source).toContain("getBlob");
    expect(source).not.toContain("/api/media/");
    expect(source).not.toContain("getSignedUrl");
  });

  it("download route no longer calls Firebase Admin getSignedUrl for photos", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/app/api/media/[mediaId]/download/route.ts",
      ),
      "utf8",
    );
    expect(source).not.toContain("getSignedUrl");
    expect(source).not.toContain('from "firebase-admin/storage"');
    expect(source).toContain("BUNNY_STREAM");
  });
});

describe("Bunny playback independent of thumbnail", () => {
  it("createEmbedPlayback succeeds without CDN token key", () => {
    vi.stubEnv("BUNNY_STREAM_LIBRARY_ID", "720303");
    vi.stubEnv("BUNNY_STREAM_EMBED_TOKEN_KEY", "embed-secret");
    // Intentionally omit BUNNY_STREAM_CDN_TOKEN_KEY — playback must not need it.
    const playback = createEmbedPlayback("video-guid-1", 300);
    expect(playback.embedUrl).toContain("/embed/720303/video-guid-1");
    expect(playback.embedUrl).toMatch(/[?&]token=/);
    expect(playback.expires).toBeTypeOf("number");
  });

  it("bunnyDetailsToPatch stores a CDN thumbnailUrl for UI, without affecting embed", () => {
    const patch = bunnyDetailsToPatch(
      {
        guid: "video-guid-1",
        length: 12,
        width: 1280,
        height: 720,
        storageSize: 1000,
        encodeProgress: 100,
        thumbnailFileName: "thumbnail.jpg",
        thumbnailUrl: "https://vz-720303.b-cdn.net/video-guid-1/thumbnail.jpg",
        thumbnailBlurhash: null,
        availableResolutions: "720p",
        status: 4,
        title: "Site clip",
      },
      "READY",
    );
    expect(patch.thumbnailUrl).toBe(
      "https://vz-720303.b-cdn.net/video-guid-1/thumbnail.jpg",
    );
    expect(patch.status).toBe("READY");
  });

  it("BunnyThumbnail component no longer fetches playback for thumbnails", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/media/bunny-thumbnail.tsx"),
      "utf8",
    );
    expect(source).not.toContain("fetchBunnyPlayback");
    expect(source).toContain("onError");
  });
});

describe("accessLevel resolves like VIEW_ONLY for effective permissions", () => {
  it("VIEWER accessLevel grants the same read-only map as VIEW_ONLY", () => {
    const fromAccessLevel = resolveEffectivePermissions({
      isOwner: false,
      memberType: "COLLEAGUE",
      accessLevel: "VIEWER",
      permissionPreset: null,
    });
    const fromLegacy = resolveEffectivePermissions({
      isOwner: false,
      memberType: "COLLEAGUE",
      permissionPreset: "VIEW_ONLY",
    });
    expect(fromAccessLevel).toEqual(fromLegacy);
    expect(fromAccessLevel?.viewMedia).toBe(true);
    expect(fromAccessLevel?.uploadMedia).toBe(false);
    expect(fromAccessLevel?.manageProjectAccess).toBe(false);
  });
});
