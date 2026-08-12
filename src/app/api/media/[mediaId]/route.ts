import { NextResponse } from "next/server";
import { authErrorResponse, verifyAuthenticatedRequest } from "@/lib/server/auth";
import { deleteProjectMediaItem } from "@/lib/server/delete-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  projectId?: string;
  workspaceId?: string;
};

/**
 * Unified media delete for Media library and Journal/Journey.
 * Photos hard-delete Storage + Firestore; Bunny videos soft-delete after CDN delete.
 * Gated by DELETE_MEDIA (CLIENT / VIEWER cannot delete).
 */
export async function DELETE(
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

    const result = await deleteProjectMediaItem({
      uid: user.uid,
      projectId,
      workspaceId: body.workspaceId,
      mediaId,
    });

    return NextResponse.json({ ok: true, kind: result.kind });
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
            err instanceof Error ? err.message : "Media not found.",
        },
        { status },
      );
    }
    console.error("[media/delete]", err);
    return NextResponse.json(
      { error: "The media could not be deleted. Please try again." },
      { status: 500 },
    );
  }
}
