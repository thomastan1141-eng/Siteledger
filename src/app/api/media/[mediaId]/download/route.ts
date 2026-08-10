import { NextResponse } from "next/server";
import {
  authErrorResponse,
  verifyAuthenticatedRequest,
} from "@/lib/server/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  createSignedCdnUrl,
  getBunnyVideo,
} from "@/lib/bunny/server";
import {
  assertProjectPermission,
  isMediaClientVisible,
} from "@/lib/server/project-permissions";

export const runtime = "nodejs";

/**
 * Bunny video download metadata only. Normal Firebase Storage photos never
 * use this route — the media grid reads Storage objects directly through
 * the authenticated Firebase Web SDK (getBlob), which re-evaluates Storage
 * Rules on every request. That removes the Admin SDK / IAM signBlob
 * dependency for the common photo-viewing path entirely.
 * Bunny videos still get a short-lived, token-authenticated MP4 CDN URL
 * (never proxies video bytes through App Hosting).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ mediaId: string }> },
) {
  try {
    const user = await verifyAuthenticatedRequest(request);
    const { mediaId } = await context.params;
    const body = (await request.json()) as {
      projectId?: string;
      workspaceId?: string;
    };
    const workspaceId = String(body.workspaceId || "").trim();
    const projectId = String(body.projectId || "").trim();
    if (!workspaceId || !projectId) {
      return NextResponse.json(
        { error: "projectId and workspaceId required" },
        { status: 400 },
      );
    }

    const db = getAdminDb();
    const project = await db
      .doc(`companies/${workspaceId}/projects/${projectId}`)
      .get();
    if (!project.exists) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    const pdata = project.data() || {};
    if (pdata.status === "trashed" || pdata.status === "purging") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const media = await db
      .doc(`companies/${workspaceId}/projects/${projectId}/media/${mediaId}`)
      .get();
    if (!media.exists) {
      return NextResponse.json({ error: "Media not found." }, { status: 404 });
    }
    const m = media.data() || {};
    if (m.status === "DELETED" || m.status === "CANCELLED" || m.deletedAt) {
      return NextResponse.json({ error: "Media not found." }, { status: 404 });
    }

    const permission = await assertProjectPermission({
      uid: user.uid,
      projectId,
      workspaceId,
      action: "DOWNLOAD_MEDIA",
    });

    if (permission.role === "client") {
      if (!isMediaClientVisible(m)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    if (m.provider !== "BUNNY_STREAM" || !m.bunnyVideoId) {
      return NextResponse.json(
        {
          error:
            "Firebase Storage photos are viewed directly via the Storage SDK and have no server download endpoint.",
        },
        { status: 404 },
      );
    }

    // Bunny video
    const status = String(m.status || "");
    if (status !== "PLAYABLE" && status !== "READY") {
      return NextResponse.json(
        { error: "Video is not ready for download." },
        { status: 409 },
      );
    }
    const bunnyVideoId = String(m.bunnyVideoId || "");
    if (!bunnyVideoId) {
      return NextResponse.json({ error: "Video not found." }, { status: 404 });
    }

    const details = await getBunnyVideo(bunnyVideoId);
    // MP4 fallback typical path — only advertise when Bunny exposes resolutions.
    const hasMp4 =
      Boolean(details?.availableResolutions) ||
      (typeof details?.encodeProgress === "number" &&
        details.encodeProgress >= 100);
    if (!hasMp4) {
      return NextResponse.json(
        {
          error:
            "No MP4 download is available for this video. Enable MP4 Fallback in Bunny Stream library settings for future uploads. Playback still works.",
          downloadAvailable: false,
        },
        { status: 404 },
      );
    }

    const signed = createSignedCdnUrl(
      `${bunnyVideoId}/play_720p.mp4`,
      300,
    );

    return NextResponse.json({
      ok: true,
      kind: "video",
      url: signed.url,
      expires: signed.expires,
      fileName: `${m.originalFileName || m.fileName || "video"}.mp4`,
      downloadAvailable: true,
      note: "Short-lived Bunny URL. Requires MP4 Fallback and Pull Zone Token Authentication.",
    });
  } catch (err) {
    const { status, message } = authErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
