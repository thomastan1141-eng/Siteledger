import { createHash } from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createSignedCdnUrl } = await import("@/lib/bunny/server");
const { isMediaClientVisible } = await import(
  "@/lib/server/project-permissions"
);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Bunny direct asset revocation", () => {
  it("returns only a short-lived token-authenticated CDN URL", () => {
    vi.stubEnv("BUNNY_STREAM_LIBRARY_ID", "12345");
    vi.stubEnv("BUNNY_STREAM_CDN_TOKEN_KEY", "cdn-secret");
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

    const result = createSignedCdnUrl("video-1/play_720p.mp4", 300);
    const path = "/video-1/play_720p.mp4";
    const expires = 1_700_000_300;
    const expected = createHash("sha256")
      .update(`cdn-secret${path}${expires}`)
      .digest()
      .toString("base64url");

    expect(result.expires).toBe(expires);
    expect(result.url).toBe(
      `https://vz-12345.b-cdn.net${path}?token=${expected}&expires=${expires}`,
    );
    expect(result.url).not.toContain("cdn-secret");
    expect(result.url).toMatch(/[?&]token=/);
    expect(result.url).toMatch(/[?&]expires=/);
  });

  it("fails closed when the Pull Zone token key is not configured", () => {
    vi.stubEnv("BUNNY_STREAM_LIBRARY_ID", "12345");
    vi.stubEnv("BUNNY_STREAM_CDN_TOKEN_KEY", "");
    expect(() => createSignedCdnUrl("video-1/play_720p.mp4")).toThrow(
      /BUNNY_STREAM_CDN_TOKEN_KEY/,
    );
  });

  it("never produces an unsigned permanent MP4 CDN URL", () => {
    vi.stubEnv("BUNNY_STREAM_LIBRARY_ID", "12345");
    vi.stubEnv("BUNNY_STREAM_CDN_TOKEN_KEY", "cdn-secret");
    const result = createSignedCdnUrl("video-1/play_720p.mp4", 300);
    expect(result.url.startsWith("https://vz-12345.b-cdn.net/")).toBe(true);
    expect(result.url.includes("token=")).toBe(true);
    expect(result.url).not.toMatch(/^https:\/\/vz-.*\.b-cdn\.net\/[^?]+\.mp4$/);
  });
});

describe("Bunny playback/sync/download Client visibility", () => {
  it("uses one explicit visibility predicate across all routes", () => {
    expect(isMediaClientVisible({ clientVisible: true })).toBe(true);
    expect(isMediaClientVisible({ visibility: "client_visible" })).toBe(true);
    expect(isMediaClientVisible({ visibility: "handover" })).toBe(true);
    expect(isMediaClientVisible({ clientVisible: false, visibility: "internal" })).toBe(false);
    expect(isMediaClientVisible({})).toBe(false);
  });
});
