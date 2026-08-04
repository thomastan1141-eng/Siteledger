export const BUNNY_TUS_ENDPOINT = "https://video.bunnycdn.com/tusupload";
export const BUNNY_API_BASE = "https://video.bunnycdn.com";
export const BUNNY_PLAYER_BASE = "https://player.mediadelivery.net";

/** Default max upload size: 5 GB */
export const BUNNY_MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024;

export function getBunnyLibraryId(): string {
  const id = process.env.BUNNY_STREAM_LIBRARY_ID?.trim() || "720303";
  return id;
}

export function getBunnyApiKey(): string {
  const key = process.env.BUNNY_STREAM_API_KEY?.trim();
  if (!key) {
    throw Object.assign(new Error("Video service is not configured."), {
      status: 503,
    });
  }
  return key;
}

export function getBunnyReadOnlyApiKey(): string {
  const key = process.env.BUNNY_STREAM_READ_ONLY_API_KEY?.trim();
  if (!key) {
    throw Object.assign(new Error("Video service is not configured."), {
      status: 503,
    });
  }
  return key;
}

export function getBunnyEmbedTokenKey(): string {
  const key = process.env.BUNNY_STREAM_EMBED_TOKEN_KEY?.trim();
  if (!key) {
    throw Object.assign(new Error("Video service is not configured."), {
      status: 503,
    });
  }
  return key;
}
