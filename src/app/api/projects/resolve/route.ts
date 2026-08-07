import { NextResponse } from "next/server";
import {
  authErrorResponse,
  verifyAuthenticatedRequest,
} from "@/lib/server/auth";
import { resolveProjectForUser } from "@/lib/server/project-directory";

export const runtime = "nodejs";

/**
 * Resolve one Project by id for the signed-in USER, returning its actual
 * workspaceId. Access requires project.createdBy == uid OR an ACTIVE
 * projects/{projectId}/members/{uid}. workspaceId is only a hint — the
 * caller's defaultWorkspaceId must never be assumed for a shared Project.
 */
export async function GET(request: Request) {
  try {
    const user = await verifyAuthenticatedRequest(request);
    if (!user.emailVerified) {
      return NextResponse.json({ error: "Email not verified." }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const projectId = (searchParams.get("projectId") || "").trim();
    const workspaceIdHint = (searchParams.get("workspaceId") || "").trim();
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required." }, { status: 400 });
    }

    const resolved = await resolveProjectForUser(
      user.uid,
      projectId,
      workspaceIdHint,
    );
    if (!resolved) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, ...resolved });
  } catch (err) {
    const { status, message } = authErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
