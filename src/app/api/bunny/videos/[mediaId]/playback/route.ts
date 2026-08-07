import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  createEmbedPlayback,
  createSignedCdnUrl,
} from "@/lib/bunny/server";
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

    const playback = createEmbedPlayback(String(data.bunnyVideoId), 300);
    let thumbnailUrl: string | null = null;
    try {
      const thumbnailName = String(
        data.thumbnailFileName || "thumbnail.jpg",
      );
      thumbnailUrl = createSignedCdnUrl(
        `${data.bunnyVideoId}/${thumbnailName}`,
        300,
      ).url;
    } catch {
      // CDN token auth is required for direct assets, but an absent key must
      // not break the separately signed embed player.
      thumbnailUrl = null;
    }
    return NextResponse.json({ ...playback, thumbnailUrl });
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
