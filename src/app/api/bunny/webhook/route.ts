import { NextResponse } from "next/server";
import {
  bunnyDetailsToPatch,
  findMediaByBunnyVideoId,
  updateMediaAdmin,
} from "@/lib/bunny/media-store";
import { getBunnyLibraryId } from "@/lib/bunny/config";
import {
  getBunnyVideo,
  mapBunnyWebhookStatus,
  verifyBunnyWebhookSignature,
} from "@/lib/bunny/server";
import type { BunnyVideoStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const version = request.headers.get("X-BunnyStream-Signature-Version");
    const algorithm = request.headers.get("X-BunnyStream-Signature-Algorithm");
    const signature = request.headers.get("X-BunnyStream-Signature");

    const valid = verifyBunnyWebhookSignature({
      rawBody,
      version,
      algorithm,
      signature,
    });
    if (!valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as {
      VideoLibraryId?: number | string;
      VideoGuid?: string;
      Status?: number;
    };

    const libraryId = String(payload.VideoLibraryId || "");
    if (libraryId !== getBunnyLibraryId()) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const videoGuid = String(payload.VideoGuid || "").trim();
    const statusCode = Number(payload.Status);
    if (!videoGuid || !Number.isFinite(statusCode)) {
      return NextResponse.json({ ok: true });
    }

    const media = await findMediaByBunnyVideoId(videoGuid);
    if (!media) {
      return NextResponse.json({ ok: true });
    }

    const current = String(media.data.status || "") as BunnyVideoStatus;
    const mapped = mapBunnyWebhookStatus(statusCode, current);
    if (!mapped) {
      return NextResponse.json({ ok: true });
    }

    // Preserve READY against lower-priority updates.
    if (current === "READY" && mapped !== "READY" && mapped !== "FAILED") {
      return NextResponse.json({ ok: true });
    }
    if (current === mapped && mapped !== "READY" && mapped !== "PLAYABLE") {
      return NextResponse.json({ ok: true });
    }

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

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[bunny/webhook]", err instanceof Error ? err.message : "error");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
