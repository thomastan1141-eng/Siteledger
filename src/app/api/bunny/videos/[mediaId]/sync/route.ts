import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { bunnyDetailsToPatch, updateMediaAdmin } from "@/lib/bunny/media-store";
import { getBunnyVideo, mapBunnyApiStatus } from "@/lib/bunny/server";
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
      action: "VIEW_MEDIA",
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
    if (data.provider !== "BUNNY_STREAM" || !data.bunnyVideoId) {
      return NextResponse.json({ error: "Media not found." }, { status: 404 });
    }

    const details = await getBunnyVideo(String(data.bunnyVideoId));
    if (!details) {
      await updateMediaAdmin(ctx.workspaceId, projectId, mediaId, {
        status: "FAILED",
        errorCode: "BUNNY_NOT_FOUND",
        errorMessage: "The video could not be processed.",
      });
      return NextResponse.json({ ok: true, status: "FAILED" });
    }

    const status = mapBunnyApiStatus(details.status, details.encodeProgress);
    const current = String(data.status || "");
    const next =
      current === "READY" && status === "PLAYABLE" ? "READY" : status;

    await updateMediaAdmin(
      ctx.workspaceId,
      projectId,
      mediaId,
      bunnyDetailsToPatch(details, next),
    );

    return NextResponse.json({ ok: true, status: next });
  } catch (err) {
    const auth = authErrorResponse(err);
    if (auth.status === 401 || auth.status === 403) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    console.error("[bunny/sync]", err);
    return NextResponse.json(
      { error: "Could not refresh video status. Please try again." },
      { status: 500 },
    );
  }
}
