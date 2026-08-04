import { createHash, createHmac, timingSafeEqual } from "crypto";
import {
  BUNNY_API_BASE,
  BUNNY_PLAYER_BASE,
  getBunnyApiKey,
  getBunnyEmbedTokenKey,
  getBunnyLibraryId,
  getBunnyReadOnlyApiKey,
} from "./config";
import type { BunnyVideoStatus } from "@/lib/types";

export type BunnyVideoDetails = {
  guid: string;
  length: number | null;
  width: number | null;
  height: number | null;
  storageSize: number | null;
  encodeProgress: number | null;
  thumbnailFileName: string | null;
  thumbnailUrl: string | null;
  thumbnailBlurhash: string | null;
  availableResolutions: string | null;
  status: number | null;
  title: string | null;
};

async function bunnyFetch(
  path: string,
  init?: RequestInit & { accessKey?: string },
) {
  const libraryId = getBunnyLibraryId();
  const accessKey = init?.accessKey || getBunnyApiKey();
  const headers = {
    AccessKey: accessKey,
    Accept: "application/json",
    ...(init?.headers || {}),
  };
  const res = await fetch(`${BUNNY_API_BASE}/library/${libraryId}${path}`, {
    method: init?.method,
    body: init?.body,
    headers,
  });
  return res;
}

export async function createBunnyVideo(title: string): Promise<string> {
  const res = await bunnyFetch("/videos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: title || "Untitled video" }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[bunny] create video failed", res.status, text.slice(0, 200));
    throw Object.assign(new Error("Video service is not configured."), {
      status: 502,
    });
  }
  const data = (await res.json()) as { guid?: string };
  if (!data.guid) {
    throw Object.assign(new Error("Video service is not configured."), {
      status: 502,
    });
  }
  return data.guid;
}

export async function deleteBunnyVideo(videoId: string): Promise<boolean> {
  const res = await bunnyFetch(`/videos/${encodeURIComponent(videoId)}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => "");
    console.error("[bunny] delete video failed", res.status, text.slice(0, 200));
    return false;
  }
  return true;
}

export async function getBunnyVideo(
  videoId: string,
): Promise<BunnyVideoDetails | null> {
  const res = await bunnyFetch(`/videos/${encodeURIComponent(videoId)}`, {
    method: "GET",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[bunny] get video failed", res.status, text.slice(0, 200));
    throw Object.assign(new Error("Could not load video status."), {
      status: 502,
    });
  }
  const data = (await res.json()) as Record<string, unknown>;
  const libraryId = getBunnyLibraryId();
  const guid = String(data.guid || videoId);
  const thumbName = data.thumbnailFileName
    ? String(data.thumbnailFileName)
    : null;
  const thumbnailUrl =
    typeof data.thumbnailUrl === "string" && data.thumbnailUrl
      ? String(data.thumbnailUrl)
      : thumbName
        ? `https://vz-${libraryId}.b-cdn.net/${guid}/${thumbName}`
        : `https://vz-${libraryId}.b-cdn.net/${guid}/thumbnail.jpg`;

  return {
    guid,
    length: typeof data.length === "number" ? data.length : null,
    width: typeof data.width === "number" ? data.width : null,
    height: typeof data.height === "number" ? data.height : null,
    storageSize: typeof data.storageSize === "number" ? data.storageSize : null,
    encodeProgress:
      typeof data.encodeProgress === "number" ? data.encodeProgress : null,
    thumbnailFileName: thumbName,
    thumbnailUrl,
    thumbnailBlurhash:
      typeof data.thumbnailBlurhash === "string"
        ? String(data.thumbnailBlurhash)
        : null,
    availableResolutions:
      typeof data.availableResolutions === "string"
        ? String(data.availableResolutions)
        : Array.isArray(data.availableResolutions)
          ? data.availableResolutions.join(",")
          : null,
    status: typeof data.status === "number" ? data.status : null,
    title: typeof data.title === "string" ? String(data.title) : null,
  };
}

export function createTusCredentials(videoId: string) {
  const libraryId = getBunnyLibraryId();
  const apiKey = getBunnyApiKey();
  const expirationTime = Math.floor(Date.now() / 1000) + 86400;
  const signatureSource = `${libraryId}${apiKey}${expirationTime}${videoId}`;
  const signature = createHash("sha256").update(signatureSource).digest("hex");
  return {
    libraryId,
    videoId,
    expirationTime,
    signature,
    tusEndpoint: "https://video.bunnycdn.com/tusupload",
  };
}

export function createEmbedPlayback(videoId: string, ttlSeconds = 300) {
  const libraryId = getBunnyLibraryId();
  const key = getBunnyEmbedTokenKey();
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const token = createHash("sha256")
    .update(`${key}${videoId}${expires}`)
    .digest("hex");
  return {
    embedUrl: `${BUNNY_PLAYER_BASE}/embed/${libraryId}/${videoId}?token=${token}&expires=${expires}`,
    expires,
  };
}

export function verifyBunnyWebhookSignature(input: {
  rawBody: string;
  version: string | null;
  algorithm: string | null;
  signature: string | null;
}): boolean {
  if (!input.signature || !input.version || !input.algorithm) return false;
  if (input.version !== "v1") return false;
  if (input.algorithm !== "hmac-sha256") return false;

  const expected = createHmac("sha256", getBunnyReadOnlyApiKey())
    .update(input.rawBody)
    .digest("hex");
  const provided = input.signature.trim().toLowerCase();
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function mapBunnyWebhookStatus(
  status: number,
  current?: BunnyVideoStatus | null,
): BunnyVideoStatus | null {
  // Captions/title generation should not demote READY.
  if ((status === 9 || status === 10) && current === "READY") return null;

  switch (status) {
    case 0:
    case 1:
    case 2:
      return "PROCESSING";
    case 3:
      return "READY";
    case 4:
      return current === "READY" ? "READY" : "PLAYABLE";
    case 5:
    case 8:
      return "FAILED";
    case 6:
      return "UPLOADING";
    case 7:
      return "PROCESSING";
    case 9:
    case 10:
      return current || "PROCESSING";
    default:
      return null;
  }
}

export function mapBunnyApiStatus(
  status: number | null,
  encodeProgress: number | null,
): BunnyVideoStatus {
  if (status === 4 || status === 3) {
    return status === 3 ? "READY" : "PLAYABLE";
  }
  if (status === 5 || status === 8) return "FAILED";
  if (status === 6) return "UPLOADING";
  if (encodeProgress != null && encodeProgress >= 100) return "PLAYABLE";
  return "PROCESSING";
}
