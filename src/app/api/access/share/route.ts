import { NextResponse } from "next/server";
import { verifyAuthenticatedRequest, authErrorResponse } from "@/lib/server/auth";
import {
  ProjectAccessError,
  shareProjectAccess,
} from "@/lib/server/project-access";
import type { ColleaguePreset, InviteType } from "@/lib/types";

export const runtime = "nodejs";

// New shares are limited to these three presets. CUSTOM remains readable on
// historical membership records but can never be selected for a new share.
const ALLOWED_NEW_PRESETS: ColleaguePreset[] = [
  "VIEW_ONLY",
  "UPDATE_PROGRESS",
  "EDITOR",
];

export async function POST(request: Request) {
  try {
    const user = await verifyAuthenticatedRequest(request);
    if (!user.emailVerified) {
      return NextResponse.json({ error: "Email not verified." }, { status: 403 });
    }
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

    if (
      inviteType === "COLLEAGUE" &&
      colleaguePreset &&
      !ALLOWED_NEW_PRESETS.includes(colleaguePreset)
    ) {
      return NextResponse.json(
        {
          error: "Access level must be View only, Update progress, or Editor.",
          code: "invalid_preset",
        },
        { status: 400 },
      );
    }

    const result = await shareProjectAccess({
      actorUid: user.uid,
      workspaceId,
      projectId,
      email,
      inviteType,
      displayName,
      colleaguePreset:
        inviteType === "COLLEAGUE" ? colleaguePreset || "VIEW_ONLY" : null,
      // CUSTOM permission overrides are never accepted for new shares.
      permissions: null,
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
