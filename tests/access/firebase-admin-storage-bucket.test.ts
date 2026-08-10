import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression test for the production 500 on
 * POST /api/media/[mediaId]/download (and /visibility): calling
 * getStorage().bucket() with no explicit bucket name requires the Admin
 * app to be initialized with `storageBucket`, or the Storage SDK throws
 * "Bucket name not specified or invalid" synchronously — before any
 * signing/IAM call ever happens. See src/lib/firebase-admin.ts.
 */
describe("Firebase Admin — default Storage bucket configuration", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("initializes the Admin app with storageBucket from NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET (applicationDefault credential path)", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
      "test-project.firebasestorage.app",
    );
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "test-project");
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_JSON", "");

    const { getAdminApp } = await import("@/lib/firebase-admin");
    const app = getAdminApp();

    expect(app.options.storageBucket).toBe("test-project.firebasestorage.app");
  });

  it("initializes the Admin app with storageBucket from NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET (service-account credential path)", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
      "test-project.firebasestorage.app",
    );
    vi.stubEnv(
      "FIREBASE_SERVICE_ACCOUNT_JSON",
      JSON.stringify({
        project_id: "test-project",
        client_email: "svc@test-project.iam.gserviceaccount.com",
        private_key:
          "-----BEGIN PRIVATE KEY-----\\nMIIBVwIBADANBgkqhkiG9w0BAQ\\n-----END PRIVATE KEY-----\\n",
      }),
    );

    const { getAdminApp } = await import("@/lib/firebase-admin");
    const app = getAdminApp();

    expect(app.options.storageBucket).toBe("test-project.firebasestorage.app");
  });
});
