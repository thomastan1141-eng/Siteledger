import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { updateMediaAdmin } from "@/lib/bunny/media-store";
import { writeAuditEvent } from "@/lib/server/audit";
import { authErrorResponse, verifyAuthenticatedRequest } from "@/lib/server/auth";
import { assertProjectPermission } from "@/lib/server/project-permissions";
import type { MediaVisibility } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  projectId?: string;
  workspaceId?: string;
  clientVisible?: boolean;
};

/**
 * Toggle client visibility for any media item (photo or Bunny video).
 * Gated by the PUBLISH_TO_CLIENT permission — owners/admins always, staff
 * only when the project allows staff to publish client-visible content.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ mediaId: string }> },
) {
  try {
    const user = await verifyAuthenticatedRequest(request);
    const { mediaId } = await context.params;
    const body = (await request.json()) as Body;
    const projectId = (body.projectId || "").trim();
    if (!mediaId || !projectId) {
      return NextResponse.json({ error: "Media not found." }, { status: 404 });
    }
    if (typeof body.clientVisible !== "boolean") {
      return NextResponse.json(
        { error: "clientVisible is required." },
        { status: 400 },
      );
    }

    const ctx = await assertProjectPermission({
      uid: user.uid,
      projectId,
      workspaceId: body.workspaceId,
      action: "PUBLISH_TO_CLIENT",
      clientVisible: body.clientVisible,
    });

    const ref = getAdminDb().doc(
      `companies/${ctx.workspaceId}/projects/${projectId}/media/${mediaId}`,
    );
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Media not found." }, { status: 404 });
    }
    const data = snap.data() || {};

    const previousValue = {
      clientVisible: Boolean(data.clientVisible),
      visibility: data.visibility as MediaVisibility | undefined,
    };
    const nextVisibility: MediaVisibility = body.clientVisible
      ? "client_visible"
      : "internal";

    await updateMediaAdmin(ctx.workspaceId, projectId, mediaId, {
      clientVisible: body.clientVisible,
      visibility: nextVisibility,
    });

    await writeAuditEvent({
      workspaceId: ctx.workspaceId,
      projectId,
      action: "MEDIA_VISIBILITY_CHANGED",
      performedBy: user.uid,
      affectedUserId: null,
      previousValue,
      newValue: { clientVisible: body.clientVisible, visibility: nextVisibility },
    });

    return NextResponse.json({
      ok: true,
      clientVisible: body.clientVisible,
      visibility: nextVisibility,
    });
  } catch (err) {
    const auth = authErrorResponse(err);
    if (auth.status === 401 || auth.status === 403) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    console.error("[media/visibility]", err);
    return NextResponse.json(
      { error: "Could not update visibility. Please try again." },
      { status: 500 },
    );
  }
}
