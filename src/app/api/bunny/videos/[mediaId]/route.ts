import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { softDeleteMedia, updateMediaAdmin } from "@/lib/bunny/media-store";
import { deleteBunnyVideo } from "@/lib/bunny/server";
import { authErrorResponse, verifyAuthenticatedRequest } from "@/lib/server/auth";
import { resolveProjectForUser } from "@/lib/server/project-directory";
import {
  assertClientVisibleAllowed,
  assertProjectPermission,
} from "@/lib/server/project-permissions";
import type { MediaVisibility } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = {
  projectId?: string;
  workspaceId?: string;
  title?: string | null;
  description?: string | null;
  clientVisible?: boolean;
};

type DeleteBody = {
  projectId?: string;
  workspaceId?: string;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ mediaId: string }> },
) {
  try {
    const user = await verifyAuthenticatedRequest(request);
    const { mediaId } = await context.params;
    const body = (await request.json()) as PatchBody;
    const projectId = (body.projectId || "").trim();
    if (!mediaId || !projectId) {
      return NextResponse.json({ error: "Media not found." }, { status: 404 });
    }

    // Resolve the authoritative workspaceId (creator OR ACTIVE member) before
    // touching the media doc, then load the media doc's own uploadedBy so
    // "own vs all" (editOwnMedia/editAllMedia) can be evaluated correctly —
    // assertProjectPermission cannot know ownership without it.
    const resolved = await resolveProjectForUser(user.uid, projectId, body.workspaceId);
    if (!resolved) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    const snap = await getAdminDb()
      .doc(
        `companies/${resolved.workspaceId}/projects/${projectId}/media/${mediaId}`,
      )
      .get();
    if (!snap.exists || snap.data()?.provider !== "BUNNY_STREAM") {
      return NextResponse.json({ error: "Media not found." }, { status: 404 });
    }

    const ctx = await assertProjectPermission({
      uid: user.uid,
      projectId,
      workspaceId: resolved.workspaceId,
      action: "EDIT_MEDIA",
      uploadedBy: (snap.data()?.uploadedBy as string | null) ?? null,
    });

    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) {
      patch.title = body.title;
      patch.caption = body.title || snap.data()?.caption || "";
    }
    if (body.description !== undefined) {
      patch.description = body.description;
    }
    if (body.clientVisible !== undefined) {
      await assertClientVisibleAllowed(ctx, body.clientVisible);
      patch.clientVisible = body.clientVisible;
      const visibility: MediaVisibility = body.clientVisible
        ? "client_visible"
        : "internal";
      patch.visibility = visibility;
    }

    if (!Object.keys(patch).length) {
      return NextResponse.json({ ok: true });
    }

    await updateMediaAdmin(ctx.workspaceId, projectId, mediaId, patch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const auth = authErrorResponse(err);
    if (auth.status === 401 || auth.status === 403) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    console.error("[bunny/patch]", err);
    return NextResponse.json(
      { error: "We could not update this video. Please try again." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ mediaId: string }> },
) {
  try {
    const user = await verifyAuthenticatedRequest(request);
    const { mediaId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as DeleteBody;
    const projectId = (body.projectId || "").trim();
    if (!mediaId || !projectId) {
      return NextResponse.json({ error: "Media not found." }, { status: 404 });
    }

    // Same ownership-before-permission ordering as PATCH above.
    const resolved = await resolveProjectForUser(user.uid, projectId, body.workspaceId);
    if (!resolved) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    const ref = getAdminDb().doc(
      `companies/${resolved.workspaceId}/projects/${projectId}/media/${mediaId}`,
    );
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.provider !== "BUNNY_STREAM") {
      return NextResponse.json({ error: "Media not found." }, { status: 404 });
    }
    const data = snap.data() || {};

    const ctx = await assertProjectPermission({
      uid: user.uid,
      projectId,
      workspaceId: resolved.workspaceId,
      action: "DELETE_MEDIA",
      uploadedBy: (data.uploadedBy as string | null) ?? null,
    });
    const previousStatus = data.status || "READY";
    const bunnyVideoId = String(data.bunnyVideoId || "");
    if (!bunnyVideoId) {
      return NextResponse.json({ error: "Media not found." }, { status: 404 });
    }

    await updateMediaAdmin(ctx.workspaceId, projectId, mediaId, {
      status: "DELETING",
    });

    const deleted = await deleteBunnyVideo(bunnyVideoId);
    if (!deleted) {
      await updateMediaAdmin(ctx.workspaceId, projectId, mediaId, {
        status: previousStatus,
      });
      return NextResponse.json(
        { error: "The video could not be deleted. Please try again." },
        { status: 502 },
      );
    }

    await softDeleteMedia(ctx.workspaceId, projectId, mediaId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const auth = authErrorResponse(err);
    if (auth.status === 401 || auth.status === 403) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    console.error("[bunny/delete]", err);
    return NextResponse.json(
      { error: "The video could not be deleted. Please try again." },
      { status: 500 },
    );
  }
}
