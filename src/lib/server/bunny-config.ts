import "server-only";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

/**
 * Bunny Stream secrets and library id from Firebase App Hosting env.
 * Access properties only from Node.js API routes / server modules.
 * Getters defer requireEnv until use so build-time imports do not crash
 * when RUNTIME secrets are not present during `next build`.
 */
export const bunnyConfig = {
  get libraryId() {
    return requireEnv("BUNNY_STREAM_LIBRARY_ID");
  },
  get apiKey() {
    return requireEnv("BUNNY_STREAM_API_KEY");
  },
  get readOnlyApiKey() {
    return requireEnv("BUNNY_STREAM_READ_ONLY_API_KEY");
  },
  get embedTokenKey() {
    return requireEnv("BUNNY_STREAM_EMBED_TOKEN_KEY");
  },
};
