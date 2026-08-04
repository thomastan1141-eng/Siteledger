import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { updateMediaAdmin } from "@/lib/bunny/media-store";
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
    if (!snap.exists) {
      return NextResponse.json({ error: "Media not found." }, { status: 404 });
    }
    const data = snap.data() || {};
    if (data.provider !== "BUNNY_STREAM") {
      return NextResponse.json({ error: "Media not found." }, { status: 404 });
    }
    if (data.uploadedBy !== user.uid && ctx.role !== "admin" && ctx.role !== "owner") {
      return NextResponse.json(
        { error: "You do not have permission to update this upload." },
        { status: 403 },
      );
    }

    const current = String(data.status || "");
    if (current === "PROCESSING" || current === "PLAYABLE" || current === "READY") {
      return NextResponse.json({ ok: true, status: current });
    }

    await updateMediaAdmin(ctx.workspaceId, projectId, mediaId, {
      status: "PROCESSING",
      encodeProgress: data.encodeProgress ?? 0,
      errorCode: null,
      errorMessage: null,
    });

    return NextResponse.json({ ok: true, status: "PROCESSING" });
  } catch (err) {
    const auth = authErrorResponse(err);
    if (auth.status === 401 || auth.status === 403) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    console.error("[bunny/upload-complete]", err);
    return NextResponse.json(
      { error: "The video upload could not be completed. You can try again." },
      { status: 500 },
    );
  }
}
