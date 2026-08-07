import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuthenticatedRequest, authErrorResponse } from "@/lib/server/auth";
import {
  getCreateRequest,
  saveCreateRequest,
} from "@/lib/server/idempotency";
import { writeAuditEvent } from "@/lib/server/audit";
import { getAdminDb } from "@/lib/firebase-admin";
import { OWNER_PERMISSIONS } from "@/lib/permissions";
import { sanitizeForFirestore } from "@/lib/sanitize";

export const runtime = "nodejs";

function optionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t : null;
}

export async function POST(request: Request) {
  try {
    const user = await verifyAuthenticatedRequest(request);
    if (!user.emailVerified) {
      return NextResponse.json({ error: "Email not verified." }, { status: 403 });
    }
    const body = (await request.json()) as Record<string, unknown>;
    const workspaceId = optionalString(body.workspaceId);
    const clientRequestId = optionalString(body.clientRequestId);
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace is required." },
        { status: 400 },
      );
    }
    if (!clientRequestId || clientRequestId.length < 8) {
      return NextResponse.json(
        { error: "clientRequestId is required." },
        { status: 400 },
      );
    }

    const db = getAdminDb();
    // Every verified USER may create a Project in their own workspace.
    // Company admin / users.role never grant this — only ACTIVE workspace
    // membership (created for every USER during onboarding).
    const [member, account] = await Promise.all([
      db.doc(`workspaces/${workspaceId}/members/${user.uid}`).get(),
      db.doc(`users/${user.uid}`).get(),
    ]);
    const accountData = account.data() || {};
    const isWorkspaceMember =
      member.exists && member.data()?.status === "ACTIVE";
    if (!isWorkspaceMember) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const existing = await getCreateRequest(
      workspaceId,
      user.uid,
      clientRequestId,
    );
    if (existing?.data?.result) {
      return NextResponse.json({
        ok: true,
        idempotent: true,
        project: existing.data.result,
      });
    }

    const address = optionalString(body.address);
    const clientName = optionalString(body.clientName);
    const manager = optionalString(body.manager);
    const internalNotes = optionalString(body.internalNotes);
    const status =
      optionalString(body.status) || "upcoming";
    const now = new Date().toISOString();

    const draft = sanitizeForFirestore({
      companyId: workspaceId,
      workspaceId,
      clientName,
      address,
      coverPhotoUrl: null,
      startDate: optionalString(body.startDate),
      contractCompletionDate: optionalString(body.contractCompletionDate),
      forecastCompletionDate:
        optionalString(body.forecastCompletionDate) ||
        optionalString(body.contractCompletionDate),
      manager,
      managerName: manager,
      status,
      forecastStatus: "on_track",
      clientUserIds: [],
      staffIds: [],
      internalNotes,
      dailyReminderHour: 17,
      staleDaysThreshold: 3,
      allowStaffPublish: Boolean(body.allowStaffPublish),
      allowClientDownload: Boolean(body.allowClientDownload),
      photoCount: 0,
      videoCount: 0,
      storageBytes: 0,
      createdBy: user.uid,
      updatedBy: user.uid,
      clientRequestId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      purgeAt: null,
      deletedBy: null,
    });

    const projectRef = db.collection(`companies/${workspaceId}/projects`).doc();
    const batch = db.batch();
    batch.set(projectRef, {
      ...draft,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Owner member record
    batch.set(
      db.doc(
        `companies/${workspaceId}/projects/${projectRef.id}/members/${user.uid}`,
      ),
      sanitizeForFirestore({
        uid: user.uid,
        workspaceId,
        projectId: projectRef.id,
        displayName: optionalString(accountData.displayName) || user.email,
        email: user.email || "",
        role: "STAFF",
        memberType: "OWNER",
        permissionPreset: "OWNER",
        permissions: OWNER_PERMISSIONS,
        status: "ACTIVE",
        invitedBy: user.uid,
        invitedAt: now,
        acceptedAt: now,
        createdBy: user.uid,
        createdAt: now,
        updatedAt: now,
      }),
    );

    await batch.commit();

    const project = {
      id: projectRef.id,
      ...draft,
      createdAt: now,
      updatedAt: now,
    };

    await saveCreateRequest(workspaceId, user.uid, clientRequestId, project);
    await writeAuditEvent({
      workspaceId,
      projectId: projectRef.id,
      action: "PROJECT_CREATED",
      performedBy: user.uid,
      newValue: { clientRequestId, address },
    });

    return NextResponse.json({ ok: true, project });
  } catch (err) {
    const { status, message } = authErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
