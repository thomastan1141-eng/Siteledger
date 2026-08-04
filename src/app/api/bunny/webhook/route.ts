import { NextResponse } from "next/server";
import {
  bunnyDetailsToPatch,
  findMediaByBunnyVideoId,
  updateMediaAdmin,
} from "@/lib/bunny/media-store";
import {
  getBunnyVideo,
  mapBunnyWebhookStatus,
  verifyBunnyWebhookSignature,
} from "@/lib/bunny/server";
import { bunnyConfig } from "@/lib/server/bunny-config";
import type { BunnyVideoStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public Bunny Stream webhook.
 * Must NOT require Firebase Auth, cookies, CSRF, or project membership.
 * Security: HMAC signature with BUNNY_STREAM_READ_ONLY_API_KEY.
 */
export async function POST(request: Request) {
  const signatureVersion = request.headers.get(
    "X-BunnyStream-Signature-Version",
  );
  const signatureAlgorithm = request.headers.get(
    "X-BunnyStream-Signature-Algorithm",
  );
  const signature = request.headers.get("X-BunnyStream-Signature");

  let rawBody = "";
  try {
    rawBody = await request.text();
  } catch {
    console.info(
      JSON.stringify({
        webhookReceived: true,
        signaturePresent: Boolean(signature),
        httpResult: 400,
        reason: "body_read_failed",
      }),
    );
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const valid = verifyBunnyWebhookSignature({
    rawBody,
    version: signatureVersion,
    algorithm: signatureAlgorithm,
    signature,
  });

  if (!valid) {
    console.info(
      JSON.stringify({
        webhookReceived: true,
        signatureVersion,
        signatureAlgorithm,
        signaturePresent: Boolean(signature),
        httpResult: 401,
        reason: "invalid_signature",
      }),
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: {
    VideoLibraryId?: number | string;
    VideoGuid?: string;
    Status?: number;
  };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    console.info(
      JSON.stringify({
        webhookReceived: true,
        signaturePresent: true,
        httpResult: 400,
        reason: "invalid_json",
      }),
    );
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  const libraryId = Number(payload.VideoLibraryId);
  const expectedLibrary = Number(bunnyConfig.libraryId);
  if (!Number.isFinite(libraryId) || libraryId !== expectedLibrary) {
    console.info(
      JSON.stringify({
        webhookReceived: true,
        signaturePresent: true,
        libraryId: payload.VideoLibraryId ?? null,
        httpResult: 401,
        reason: "library_mismatch",
      }),
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const videoGuid = String(payload.VideoGuid || "").trim();
  const statusCode = Number(payload.Status);
  if (!videoGuid || !Number.isFinite(statusCode)) {
    console.info(
      JSON.stringify({
        webhookReceived: true,
        libraryId,
        videoGuid: videoGuid || null,
        bunnyStatus: payload.Status ?? null,
        httpResult: 400,
        reason: "missing_fields",
      }),
    );
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  try {
    const media = await findMediaByBunnyVideoId(videoGuid);
    if (!media) {
      console.info(
        JSON.stringify({
          webhookReceived: true,
          libraryId,
          videoGuid,
          bunnyStatus: statusCode,
          mediaRecordFound: false,
          httpResult: 200,
        }),
      );
      // Valid signed webhook for unknown video — acknowledge to stop retries.
      return NextResponse.json({ ok: true, mediaRecordFound: false });
    }

    const current = String(media.data.status || "") as BunnyVideoStatus;
    const mapped = mapBunnyWebhookStatus(statusCode, current);
    if (!mapped) {
      console.info(
        JSON.stringify({
          webhookReceived: true,
          libraryId,
          videoGuid,
          bunnyStatus: statusCode,
          mediaRecordFound: true,
          resultingStatus: current,
          httpResult: 200,
          reason: "no_status_change",
        }),
      );
      return NextResponse.json({ ok: true });
    }

    // Never downgrade READY/PLAYABLE except to FAILED.
    if (
      (current === "READY" || current === "PLAYABLE") &&
      mapped !== "READY" &&
      mapped !== "PLAYABLE" &&
      mapped !== "FAILED"
    ) {
      console.info(
        JSON.stringify({
          webhookReceived: true,
          libraryId,
          videoGuid,
          bunnyStatus: statusCode,
          mediaRecordFound: true,
          resultingStatus: current,
          httpResult: 200,
          reason: "preserve_ready",
        }),
      );
      return NextResponse.json({ ok: true });
    }

    if (current === mapped && mapped !== "READY" && mapped !== "PLAYABLE") {
      return NextResponse.json({ ok: true });
    }

    let resulting = mapped;
    if (mapped === "READY" || mapped === "PLAYABLE" || mapped === "FAILED") {
      try {
        const details = await getBunnyVideo(videoGuid);
        if (details) {
          await updateMediaAdmin(
            media.workspaceId,
            media.projectId,
            media.id,
            bunnyDetailsToPatch(details, mapped),
          );
          resulting = mapped;
          console.info(
            JSON.stringify({
              webhookReceived: true,
              libraryId,
              videoGuid,
              bunnyStatus: statusCode,
              mediaRecordFound: true,
              resultingStatus: resulting,
              httpResult: 200,
            }),
          );
          return NextResponse.json({ ok: true });
        }
      } catch {
        console.error("[bunny/webhook] metadata fetch failed");
      }
    }

    await updateMediaAdmin(media.workspaceId, media.projectId, media.id, {
      status: mapped,
      ...(mapped === "FAILED"
        ? {
            errorCode: "BUNNY_PROCESSING_FAILED",
            errorMessage: "The video could not be processed.",
          }
        : {}),
    });

    console.info(
      JSON.stringify({
        webhookReceived: true,
        libraryId,
        videoGuid,
        bunnyStatus: statusCode,
        mediaRecordFound: true,
        resultingStatus: resulting,
        httpResult: 200,
      }),
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(
      "[bunny/webhook] processing_failed",
      err instanceof Error ? err.message : "error",
    );
    // 500 so Bunny retries; never 403.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
