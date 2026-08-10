import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { createEmbedPlayback } from "@/lib/bunny/server";
import { authErrorResponse, verifyAuthenticatedRequest } from "@/lib/server/auth";
import {
  assertProjectPermission,
  isMediaClientVisible,
} from "@/lib/server/project-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ mediaId: string }> },
) {
  try {
    const user = await verifyAuthenticatedRequest(request);
    const { mediaId } = await context.params;
    const url = new URL(request.url);
    const projectId = (url.searchParams.get("projectId") || "").trim();
    const workspaceId = (url.searchParams.get("workspaceId") || "").trim();

    if (!mediaId || !projectId) {
      return NextResponse.json(
        { error: "You do not have access to this video." },
        { status: 404 },
      );
    }

    const ctx = await assertProjectPermission({
      uid: user.uid,
      projectId,
      workspaceId: workspaceId || undefined,
      action: "VIEW_MEDIA",
    });

    const snap = await getAdminDb()
      .doc(
        `companies/${ctx.workspaceId}/projects/${projectId}/media/${mediaId}`,
      )
      .get();
    if (!snap.exists) {
      return NextResponse.json(
        { error: "You do not have access to this video." },
        { status: 404 },
      );
    }
    const data = snap.data() || {};
    if (data.provider !== "BUNNY_STREAM" || !data.bunnyVideoId) {
      return NextResponse.json(
        { error: "You do not have access to this video." },
        { status: 404 },
      );
    }
    if (data.status === "DELETED" || data.status === "CANCELLED") {
      return NextResponse.json(
        { error: "You do not have access to this video." },
        { status: 404 },
      );
    }
    if (ctx.role === "client") {
      if (!isMediaClientVisible(data)) {
        return NextResponse.json(
          { error: "You do not have access to this video." },
          { status: 403 },
        );
      }
    }
    if (data.status !== "PLAYABLE" && data.status !== "READY") {
      return NextResponse.json(
        { error: "This video is still processing." },
        { status: 409 },
      );
    }

    // Thumbnail is served directly from Firestore's `thumbnailUrl` (Bunny
    // CDN) by the UI — independent of this playback/embed-token call, so a
    // thumbnail problem can never block video playback.
    const playback = createEmbedPlayback(String(data.bunnyVideoId), 300);
    return NextResponse.json(playback);
  } catch (err) {
    const auth = authErrorResponse(err);
    if (auth.status === 401 || auth.status === 403) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    console.error("[bunny/playback]", err);
    return NextResponse.json(
      { error: "You do not have access to this video." },
      { status: 500 },
    );
  }
}
