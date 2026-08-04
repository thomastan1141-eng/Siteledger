import { NextResponse } from "next/server";
import { verifyAuthenticatedRequest, authErrorResponse } from "@/lib/server/auth";
import {
  assertCanManageProjectAccess,
  createInvitationRecord,
} from "@/lib/server/invitations";
import { writeAuditEvent } from "@/lib/server/audit";
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

    if (!workspaceId || !projectId || !email) {
      return NextResponse.json(
        { error: "Email, project, and workspace are required." },
        { status: 400 },
      );
    }
    if (inviteType !== "CLIENT" && inviteType !== "COLLEAGUE") {
      return NextResponse.json(
        { error: "Invite as Client or Colleague." },
        { status: 400 },
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
    }

    await assertCanManageProjectAccess(user.uid, workspaceId, projectId);

    const invitation = await createInvitationRecord({
      workspaceId,
      projectId,
      inviteType,
      email,
      displayName,
      colleaguePreset:
        inviteType === "COLLEAGUE" ? colleaguePreset || "VIEW_ONLY" : null,
      permissions:
        inviteType === "COLLEAGUE" && body.permissions
          ? (body.permissions as Record<string, boolean>)
          : null,
      invitedBy: user.uid,
    });

    await writeAuditEvent({
      workspaceId,
      projectId,
      action: "PROJECT_INVITATION_CREATED",
      performedBy: user.uid,
      newValue: {
        inviteType,
        email: invitation.normalizedEmail,
        invitationId: invitation.id,
      },
    });

    // Never return tokenHash. Return invite URL once for copy/share.
    return NextResponse.json({
      ok: true,
      invitation: {
        id: invitation.id,
        projectId: invitation.projectId,
        inviteType: invitation.inviteType,
        email: invitation.email,
        displayName: invitation.displayName,
        colleaguePreset: invitation.colleaguePreset,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        inviteUrl: invitation.inviteUrl,
      },
    });
  } catch (err) {
    const { status, message } = authErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
