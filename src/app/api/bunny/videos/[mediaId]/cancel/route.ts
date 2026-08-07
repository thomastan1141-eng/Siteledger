import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { updateMediaAdmin } from "@/lib/bunny/media-store";
import { deleteBunnyVideo } from "@/lib/bunny/server";
import { authErrorResponse, verifyAuthenticatedRequest } from "@/lib/server/auth";
import { assertProjectPermission } from "@/lib/server/project-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  projectId?: string;
  workspaceId?: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ mediaId: string }> },
) {
  try {
    const user = await verifyAuthenticatedRequest(request);
    const { mediaId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Body;
    const projectId = (body.projectId || "").trim();
    if (!mediaId || !projectId) {
      return NextResponse.json({ error: "Media not found." }, { status: 404 });
    }

    const ctx = await assertProjectPermission({
      uid: user.uid,
      projectId,
      workspaceId: body.workspaceId,
      action: "UPLOAD_MEDIA",
    });

    const snap = await getAdminDb()
      .doc(
        `companies/${ctx.workspaceId}/projects/${projectId}/media/${mediaId}`,
      )
      .get();
    if (!snap.exists || snap.data()?.provider !== "BUNNY_STREAM") {
      return NextResponse.json({ ok: true });
    }
    const data = snap.data() || {};
    if (data.uploadedBy !== user.uid && ctx.role !== "owner") {
      return NextResponse.json(
        { error: "You do not have permission to cancel this upload." },
        { status: 403 },
      );
    }

    const bunnyVideoId = String(data.bunnyVideoId || "");
    let cleanupFailed = false;
    if (bunnyVideoId) {
      const ok = await deleteBunnyVideo(bunnyVideoId);
      if (!ok) cleanupFailed = true;
    }

    await updateMediaAdmin(ctx.workspaceId, projectId, mediaId, {
      status: cleanupFailed ? "FAILED" : "CANCELLED",
      mediaLifecycle: cleanupFailed ? "active" : "tombstoned",
      deletedAt: new Date().toISOString(),
      clientVisible: false,
      visibility: "internal",
      errorCode: cleanupFailed ? "CLEANUP_PENDING" : null,
      errorMessage: cleanupFailed
        ? "Upload cancelled. Cleanup pending."
        : null,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const auth = authErrorResponse(err);
    if (auth.status === 401 || auth.status === 403) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    console.error("[bunny/cancel]", err);
    // Do not expose cleanup failures to users.
    return NextResponse.json({ ok: true });
  }
}
