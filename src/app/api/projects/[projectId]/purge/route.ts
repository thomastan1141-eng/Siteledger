import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import {
  authErrorResponse,
  verifyAuthenticatedRequest,
} from "@/lib/server/auth";
import { writeAuditEvent } from "@/lib/server/audit";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";
import { deleteBunnyVideo } from "@/lib/bunny/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const REAUTH_WINDOW_MS = 5 * 60 * 1000;

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await verifyAuthenticatedRequest(request);
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    const authTimeMs = Number(decoded.auth_time || 0) * 1000;
    if (!authTimeMs || Date.now() - authTimeMs > REAUTH_WINDOW_MS) {
      return NextResponse.json(
        { error: "Please re-enter your password to continue." },
        { status: 401 },
      );
    }

    const { projectId } = await context.params;
    const body = (await request.json()) as { workspaceId?: string };
    const workspaceId = String(body.workspaceId || "").trim();
    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    }

    const db = getAdminDb();
    const ref = db.doc(`companies/${workspaceId}/projects/${projectId}`);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    const data = snap.data() || {};
    if (data.createdBy !== user.uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (data.status !== "trashed" && data.status !== "purging") {
      return NextResponse.json(
        { error: "Move the project to Recently Deleted first." },
        { status: 400 },
      );
    }

    await ref.update({ status: "purging", updatedAt: FieldValue.serverTimestamp() });
    await writeAuditEvent({
      workspaceId,
      projectId,
      action: "PROJECT_PURGE_STARTED",
      performedBy: user.uid,
    });

    const mediaSnap = await db
      .collection(`companies/${workspaceId}/projects/${projectId}/media`)
      .get();
    for (const media of mediaSnap.docs) {
      const m = media.data();
      if (m.provider === "BUNNY_STREAM" && m.bunnyVideoId) {
        await deleteBunnyVideo(String(m.bunnyVideoId));
      }
      if (m.storagePath) {
        try {
          await getStorage()
            .bucket()
            .file(String(m.storagePath))
            .delete({ ignoreNotFound: true });
        } catch {
          /* continue */
        }
      }
      await media.ref.delete();
    }

    for (const sub of [
      "schedule",
      "updates",
      "dailyPlans",
      "purchases",
      "members",
      "invitations",
    ]) {
      const subSnap = await db
        .collection(`companies/${workspaceId}/projects/${projectId}/${sub}`)
        .limit(400)
        .get();
      const batch = db.batch();
      subSnap.docs.forEach((d) => batch.delete(d.ref));
      if (!subSnap.empty) await batch.commit();
    }

    await ref.delete();
    await writeAuditEvent({
      workspaceId,
      projectId,
      action: "PROJECT_PURGE_COMPLETED",
      performedBy: user.uid,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = authErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
