import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { updateMediaAdmin } from "@/lib/bunny/media-store";
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

    const { deleteProjectMediaItem } = await import(
      "@/lib/server/delete-media"
    );
    await deleteProjectMediaItem({
      uid: user.uid,
      projectId,
      workspaceId: body.workspaceId,
      mediaId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const auth = authErrorResponse(err);
    if (auth.status === 401 || auth.status === 403) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status: number }).status)
        : 500;
    if (status === 404 || status === 502) {
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "The video could not be deleted. Please try again.",
        },
        { status },
      );
    }
    console.error("[bunny/delete]", err);
    return NextResponse.json(
      { error: "The video could not be deleted. Please try again." },
      { status: 500 },
    );
  }
}
