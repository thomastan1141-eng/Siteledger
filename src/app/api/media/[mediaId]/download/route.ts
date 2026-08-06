import { NextResponse } from "next/server";
import {
  authErrorResponse,
  verifyAuthenticatedRequest,
} from "@/lib/server/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { getStorage } from "firebase-admin/storage";
import { getBunnyVideo } from "@/lib/bunny/server";
import { bunnyConfig } from "@/lib/server/bunny-config";

export const runtime = "nodejs";

/**
 * Authorised download metadata.
 * Photos: returns a short-lived signed Storage URL.
 * Bunny videos: returns MP4 CDN URL only when fallback file exists.
 * Does not proxy video bytes through App Hosting.
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

    const member = await db
      .doc(`companies/${workspaceId}/projects/${projectId}/members/${user.uid}`)
      .get();
    const mem = member.data() || {};
    const staffIds = Array.isArray(pdata.staffIds)
      ? pdata.staffIds.map(String)
      : [];
    const clientUserIds = Array.isArray(pdata.clientUserIds)
      ? pdata.clientUserIds.map(String)
      : [];
    const isCreator = pdata.createdBy === user.uid;
    const isActiveMember =
      member.exists && String(mem.status || "") === "ACTIVE";
    const isClient =
      isActiveMember &&
      mem.memberType === "CLIENT" &&
      clientUserIds.includes(user.uid);
    const isColleague =
      isActiveMember &&
      staffIds.includes(user.uid) &&
      (mem.memberType === "COLLEAGUE" ||
        mem.memberType === "STAFF" ||
        mem.memberType === "OWNER" ||
        mem.memberType === "COMPANY_MEMBER");

    const companyUser = await db
      .doc(`companies/${workspaceId}/users/${user.uid}`)
      .get();
    const isAdmin =
      companyUser.exists &&
      companyUser.data()?.role === "admin" &&
      companyUser.data()?.active !== false;

    // Dual gate: stale array without ACTIVE member (or vice versa) is denied.
    if (!isCreator && !isAdmin && !isClient && !isColleague) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (isClient) {
      if (m.clientVisible !== true) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (!isCreator && !isAdmin) {
      const canDownload =
        mem.permissions?.downloadMedia === true ||
        mem.permissionPreset === "OWNER" ||
        mem.permissionPreset === "VIEW_ONLY" ||
        mem.permissionPreset === "UPDATE_PROGRESS" ||
        mem.permissionPreset === "EDITOR";
      if (!canDownload) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (mem.permissions?.downloadMedia === false) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    if (m.type === "photo" || m.provider !== "BUNNY_STREAM") {
      const storagePath = String(m.storagePath || "");
      if (!storagePath) {
        return NextResponse.json(
          { error: "No downloadable file." },
          { status: 404 },
        );
      }
      const [url] = await getStorage()
        .bucket()
        .file(storagePath)
        .getSignedUrl({
          action: "read",
          expires: Date.now() + 10 * 60 * 1000,
        });
      return NextResponse.json({
        ok: true,
        kind: "photo",
        url,
        fileName: m.fileName || m.originalFileName || "photo.jpg",
      });
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

    const libraryId = bunnyConfig.libraryId;
    // Direct CDN MP4 path used when MP4 fallback is enabled in Bunny.
    const url = `https://vz-${libraryId}.b-cdn.net/${bunnyVideoId}/play_720p.mp4`;

    // Bunny's "Block Direct URL File Access" library setting can reject
    // this direct CDN link even when the MP4 file itself exists. Verify
    // reachability server-side so we never claim success on a URL that
    // will 403/404 for the user — confirm before advertising a download.
    let reachable = false;
    try {
      const check = await fetch(url, { method: "HEAD" });
      reachable = check.ok;
    } catch {
      reachable = false;
    }
    if (!reachable) {
      return NextResponse.json(
        {
          error:
            "Video download is currently blocked by Bunny Stream security settings (Block Direct URL File Access). Playback still works. Ask an administrator to allow this domain or disable that setting in the Bunny Stream library security settings.",
          downloadAvailable: false,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      kind: "video",
      url,
      fileName: `${m.originalFileName || m.fileName || "video"}.mp4`,
      downloadAvailable: true,
      note: "Requires Bunny MP4 Fallback. Existing videos may remain playback-only.",
    });
  } catch (err) {
    const { status, message } = authErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
