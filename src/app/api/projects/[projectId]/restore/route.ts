import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import {
  authErrorResponse,
  verifyAuthenticatedRequest,
} from "@/lib/server/auth";
import { writeAuditEvent } from "@/lib/server/audit";
import { getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

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
    const { getAdminAuth } = await import("@/lib/firebase-admin");
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
    if (data.status === "purging") {
      return NextResponse.json(
        { error: "This project is being permanently deleted." },
        { status: 409 },
      );
    }
    if (data.status !== "trashed") {
      return NextResponse.json({ ok: true, alreadyActive: true });
    }

    const restoredStatus = data.statusBeforeTrash || "upcoming";
    await ref.update({
      status: restoredStatus,
      statusBeforeTrash: FieldValue.delete(),
      deletedAt: null,
      purgeAt: null,
      deletedBy: null,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: user.uid,
    });

    await writeAuditEvent({
      workspaceId,
      projectId,
      action: "PROJECT_RESTORED",
      performedBy: user.uid,
      newValue: { status: restoredStatus },
    });

    return NextResponse.json({ ok: true, status: restoredStatus });
  } catch (err) {
    const { status, message } = authErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
