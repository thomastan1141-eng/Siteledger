import { NextResponse } from "next/server";
import { verifyAuthenticatedRequest, authErrorResponse } from "@/lib/server/auth";
import {
  ProjectAccessError,
  revokeProjectAccess,
} from "@/lib/server/project-access";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await verifyAuthenticatedRequest(request);
    const body = (await request.json()) as Record<string, unknown>;
    const workspaceId = String(body.workspaceId || "").trim();
    const projectId = String(body.projectId || "").trim();
    const uid = String(body.uid || "").trim();

    const result = await revokeProjectAccess({
      actorUid: user.uid,
      workspaceId,
      projectId,
      uid,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ProjectAccessError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    const { status, message } = authErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
