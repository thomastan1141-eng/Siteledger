import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuthenticatedRequest, authErrorResponse } from "@/lib/server/auth";
import {
  findInvitationByRawToken,
  normalizeEmail,
} from "@/lib/server/invitations";
import { writeAuditEvent } from "@/lib/server/audit";
import { getAdminDb } from "@/lib/firebase-admin";
import { sanitizeForFirestore } from "@/lib/sanitize";
import type { InviteType } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await verifyAuthenticatedRequest(request);
    const body = (await request.json()) as { token?: string };
    const rawToken = String(body.token || "").trim();
    if (!rawToken) {
      return NextResponse.json({ error: "Invitation token required." }, { status: 400 });
    }

    const found = await findInvitationByRawToken(rawToken);
    if (!found) {
      return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
    }

    const data = found.data;
    if (data.status !== "PENDING") {
      return NextResponse.json(
        { error: "This invitation is no longer valid." },
        { status: 410 },
      );
    }
    if (
      data.expiresAt &&
      new Date(String(data.expiresAt)).getTime() < Date.now()
    ) {
      await found.ref.update({ status: "EXPIRED", updatedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ error: "This invitation has expired." }, { status: 410 });
    }

    const invitedEmail = normalizeEmail(String(data.normalizedEmail || data.email || ""));
    const userEmail = normalizeEmail(user.email || "");
    if (!userEmail || userEmail !== invitedEmail) {
      return NextResponse.json(
        {
          error:
            "Sign in with the invited email address to accept this invitation.",
        },
        { status: 403 },
      );
    }

    const workspaceId = String(data.workspaceId);
    const projectId = String(data.projectId);
    const inviteType = String(data.inviteType) as InviteType;
    const db = getAdminDb();
    const now = new Date().toISOString();
    const memberType = inviteType === "CLIENT" ? "CLIENT" : "COLLEAGUE";
    const role = inviteType === "CLIENT" ? "CLIENT" : "COLLEAGUE";

    const batch = db.batch();
    const memberRef = db.doc(
      `companies/${workspaceId}/projects/${projectId}/members/${user.uid}`,
    );
    batch.set(
      memberRef,
      sanitizeForFirestore({
        uid: user.uid,
        workspaceId,
        projectId,
        displayName: data.displayName || user.email,
        email: user.email,
        role,
        memberType,
        permissionPreset:
          inviteType === "CLIENT"
            ? "CLIENT"
            : data.colleaguePreset || "VIEW_ONLY",
        permissions: inviteType === "CLIENT" ? null : data.permissions || null,
        status: "ACTIVE",
        invitedBy: data.invitedBy || null,
        invitedAt: data.invitedAt || now,
        acceptedAt: now,
        createdBy: data.invitedBy || user.uid,
        createdAt: now,
        updatedAt: now,
      }),
      { merge: true },
    );

    const projectRef = db.doc(
      `companies/${workspaceId}/projects/${projectId}`,
    );
    if (inviteType === "CLIENT") {
      batch.set(
        projectRef,
        {
          clientUserIds: FieldValue.arrayUnion(user.uid),
          updatedAt: now,
        },
        { merge: true },
      );
    } else {
      batch.set(
        projectRef,
        {
          staffIds: FieldValue.arrayUnion(user.uid),
          updatedAt: now,
        },
        { merge: true },
      );
    }

    // Mirror company user for legacy profile loading
    batch.set(
      db.doc(`companies/${workspaceId}/users/${user.uid}`),
      sanitizeForFirestore({
        email: user.email,
        displayName: data.displayName || user.email,
        role: inviteType === "CLIENT" ? "client" : "staff",
        companyId: workspaceId,
        defaultWorkspaceId: workspaceId,
        projectIds: FieldValue.arrayUnion(projectId),
        active: true,
        onboardingComplete: true,
        emailVerified: true,
        updatedAt: now,
        createdAt: now,
      }),
      { merge: true },
    );

    // Top-level account stub for clients/colleagues
    batch.set(
      db.doc(`users/${user.uid}`),
      sanitizeForFirestore({
        email: user.email,
        displayName: data.displayName || user.email,
        role: inviteType === "CLIENT" ? "client" : "staff",
        companyId: workspaceId,
        defaultWorkspaceId: workspaceId,
        projectIds: FieldValue.arrayUnion(projectId),
        active: true,
        onboardingComplete: true,
        emailVerified: true,
        updatedAt: now,
      }),
      { merge: true },
    );

    batch.update(found.ref, {
      status: "ACCEPTED",
      acceptedBy: user.uid,
      acceptedAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    await writeAuditEvent({
      workspaceId,
      projectId,
      action: "PROJECT_INVITATION_ACCEPTED",
      performedBy: user.uid,
      affectedUserId: user.uid,
      newValue: { invitationId: found.id, inviteType },
    });

    return NextResponse.json({
      ok: true,
      projectId,
      workspaceId,
      role: inviteType === "CLIENT" ? "client" : "staff",
    });
  } catch (err) {
    const { status, message } = authErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
