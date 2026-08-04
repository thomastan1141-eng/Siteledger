import { NextResponse } from "next/server";
import {
  authErrorResponse,
  verifyAuthenticatedRequest,
} from "@/lib/server/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  bunnyDetailsToPatch,
  mediaCollectionPath,
  updateMediaAdmin,
} from "@/lib/bunny/media-store";
import { getBunnyVideo, mapBunnyApiStatus } from "@/lib/bunny/server";
import { writeAuditEvent } from "@/lib/server/audit";

export const runtime = "nodejs";

const MAX_BATCH = 20;

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await verifyAuthenticatedRequest(request);
    const { projectId } = await context.params;
    const body = (await request.json()) as { workspaceId?: string };
    const workspaceId = String(body.workspaceId || "").trim();
    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
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
      return NextResponse.json({ error: "Project unavailable." }, { status: 403 });
    }

    const isCreator = pdata.createdBy === user.uid;
    const member = await db
      .doc(`companies/${workspaceId}/projects/${projectId}/members/${user.uid}`)
      .get();
    const m = member.data();
    const canManage =
      isCreator ||
      (member.exists &&
        m?.status === "ACTIVE" &&
        (m.memberType === "OWNER" ||
          m.permissions?.viewMedia === true ||
          m.permissionPreset === "OWNER"));
    if (!canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const snap = await db
      .collection(mediaCollectionPath(workspaceId, projectId))
      .where("provider", "==", "BUNNY_STREAM")
      .limit(80)
      .get();

    const targets = snap.docs
      .map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          status: String(data.status || ""),
          bunnyVideoId: data.bunnyVideoId ? String(data.bunnyVideoId) : "",
        };
      })
      .filter((d) =>
        ["UPLOADING", "PROCESSING", "INITIALIZING", "PLAYABLE"].includes(
          d.status,
        ),
      )
      .slice(0, MAX_BATCH);

    const updated: Array<{ mediaId: string; status: string }> = [];
    for (const item of targets) {
      const bunnyVideoId = item.bunnyVideoId;
      if (!bunnyVideoId) continue;
      try {
        const details = await getBunnyVideo(bunnyVideoId);
        if (!details) continue;
        const mapped = mapBunnyApiStatus(
          details.status,
          details.encodeProgress,
        );
        await updateMediaAdmin(
          workspaceId,
          projectId,
          item.id,
          bunnyDetailsToPatch(details, mapped),
        );
        updated.push({ mediaId: item.id, status: mapped });
        await writeAuditEvent({
          workspaceId,
          projectId,
          action: "BUNNY_STATUS_SYNCED",
          performedBy: user.uid,
          newValue: { mediaId: item.id, status: mapped },
        });
      } catch {
        /* continue batch */
      }
    }

    return NextResponse.json({
      ok: true,
      scanned: targets.length,
      updated,
    });
  } catch (err) {
    const { status, message } = authErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
