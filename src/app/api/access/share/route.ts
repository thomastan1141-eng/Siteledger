import { NextResponse } from "next/server";
import { verifyAuthenticatedRequest, authErrorResponse } from "@/lib/server/auth";
import {
  ProjectAccessError,
  shareProjectAccess,
} from "@/lib/server/project-access";
import type { ColleaguePreset, InviteType } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await verifyAuthenticatedRequest(request);
    const body = (await request.json()) as Record<string, unknown>;
    const workspaceId = String(body.workspaceId || "").trim();
    const projectId = String(body.projectId || "").trim();
    const email = String(body.email || "").trim();
    const inviteType = String(body.inviteType || "").toUpperCase() as InviteType;
    const displayName = body.displayName
      ? String(body.displayName).trim()
      : null;
    const colleaguePreset = body.colleaguePreset
      ? (String(body.colleaguePreset) as ColleaguePreset)
      : null;

    const result = await shareProjectAccess({
      actorUid: user.uid,
      workspaceId,
      projectId,
      email,
      inviteType,
      displayName,
      colleaguePreset:
        inviteType === "COLLEAGUE" ? colleaguePreset || "VIEW_ONLY" : null,
      permissions:
        inviteType === "COLLEAGUE" && body.permissions
          ? (body.permissions as Record<string, boolean>)
          : null,
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
