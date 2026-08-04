import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuthenticatedRequest, authErrorResponse } from "@/lib/server/auth";
import { assertCanManageProjectAccess } from "@/lib/server/invitations";
import { writeAuditEvent } from "@/lib/server/audit";
import { getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await verifyAuthenticatedRequest(request);
    const body = (await request.json()) as Record<string, unknown>;
    const workspaceId = String(body.workspaceId || "").trim();
    const projectId = String(body.projectId || "").trim();
    const invitationId = body.invitationId ? String(body.invitationId).trim() : "";
    const uid = body.uid ? String(body.uid).trim() : "";

    if (!workspaceId || !projectId) {
      return NextResponse.json(
        { error: "Workspace and project are required." },
        { status: 400 },
      );
    }
    if (!invitationId && !uid) {
      return NextResponse.json(
        { error: "Nothing to revoke." },
        { status: 400 },
      );
    }

    await assertCanManageProjectAccess(user.uid, workspaceId, projectId);

    const db = getAdminDb();

    if (invitationId) {
      const ref = db.doc(
        `companies/${workspaceId}/projects/${projectId}/invitations/${invitationId}`,
      );
      const snap = await ref.get();
      if (!snap.exists) {
        return NextResponse.json(
          { error: "Invitation not found." },
          { status: 404 },
        );
      }
      const data = snap.data() || {};
      if (data.status !== "PENDING") {
        return NextResponse.json(
          { error: "This invitation can no longer be revoked." },
          { status: 409 },
        );
      }

      await ref.update({
        status: "REVOKED",
        revokedAt: new Date().toISOString(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      await writeAuditEvent({
        workspaceId,
        projectId,
        action: "PROJECT_INVITATION_REVOKED",
        performedBy: user.uid,
        newValue: { invitationId, email: data.normalizedEmail || data.email },
      });

      return NextResponse.json({ ok: true });
    }

    const memberRef = db.doc(
      `companies/${workspaceId}/projects/${projectId}/members/${uid}`,
    );
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }
    const memberData = memberSnap.data() || {};
    if (memberData.memberType === "OWNER") {
      return NextResponse.json(
        { error: "The project owner cannot be revoked." },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const batch = db.batch();
    batch.set(
      memberRef,
      { status: "REMOVED", updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    batch.set(
      db.doc(`companies/${workspaceId}/projects/${projectId}`),
      {
        clientUserIds: FieldValue.arrayRemove(uid),
        staffIds: FieldValue.arrayRemove(uid),
        updatedAt: now,
      },
      { merge: true },
    );
    await batch.commit();

    await writeAuditEvent({
      workspaceId,
      projectId,
      action: "PROJECT_MEMBER_REMOVED",
      performedBy: user.uid,
      affectedUserId: uid,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = authErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
