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

async function verifyRecentAuth(request: Request, uid: string) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const { getAdminAuth } = await import("@/lib/firebase-admin");
  const decoded = await getAdminAuth().verifyIdToken(token, true);
  if (decoded.uid !== uid) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
  const authTimeMs = Number(decoded.auth_time || 0) * 1000;
  if (!authTimeMs || Date.now() - authTimeMs > REAUTH_WINDOW_MS) {
    throw Object.assign(
      new Error("Please re-enter your password to continue."),
      { status: 401 },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await verifyAuthenticatedRequest(request);
    await verifyRecentAuth(request, user.uid);
    const { projectId } = await context.params;
    const body = (await request.json()) as {
      workspaceId?: string;
      confirmTitle?: string;
    };
    const workspaceId = String(body.workspaceId || "").trim();
    const confirmTitle = String(body.confirmTitle || "").trim();
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
      return NextResponse.json(
        { error: "Only the project creator can delete this project." },
        { status: 403 },
      );
    }
    if (data.status === "trashed" || data.status === "purging") {
      return NextResponse.json({ ok: true, alreadyTrashed: true });
    }

    const title = String(data.address || data.clientName || "").trim();
    const expected = title || "DELETE PROJECT";
    if (confirmTitle !== expected) {
      return NextResponse.json(
        {
          error: title
            ? "Type the exact project address to confirm."
            : 'Type "DELETE PROJECT" to confirm.',
        },
        { status: 400 },
      );
    }

    const deletedAt = new Date();
    const purgeAt = new Date(deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000);

    await ref.update({
      statusBeforeTrash: data.status || "upcoming",
      status: "trashed",
      deletedAt: deletedAt.toISOString(),
      purgeAt: purgeAt.toISOString(),
      deletedBy: user.uid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: user.uid,
    });

    await writeAuditEvent({
      workspaceId,
      projectId,
      action: "PROJECT_MOVED_TO_TRASH",
      performedBy: user.uid,
      newValue: { purgeAt: purgeAt.toISOString() },
    });

    return NextResponse.json({
      ok: true,
      deletedAt: deletedAt.toISOString(),
      purgeAt: purgeAt.toISOString(),
    });
  } catch (err) {
    const { status, message } = authErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
