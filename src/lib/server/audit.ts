import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { auditEventsPath } from "@/lib/paths";

export type AuditAction =
  | "PROJECT_CREATED"
  | "PROJECT_INVITATION_CREATED"
  | "PROJECT_INVITATION_ACCEPTED"
  | "PROJECT_INVITATION_REVOKED"
  | "PROJECT_MEMBER_PERMISSIONS_CHANGED"
  | "PROJECT_MEMBER_SUSPENDED"
  | "PROJECT_MEMBER_RESTORED"
  | "PROJECT_MEMBER_SHARED"
  | "PROJECT_MEMBER_REMOVED"
  | "MEDIA_VISIBILITY_CHANGED"
  | "MEDIA_DELETED"
  | "PROJECT_MOVED_TO_TRASH"
  | "PROJECT_RESTORED"
  | "PROJECT_PURGE_STARTED"
  | "PROJECT_PURGE_COMPLETED"
  | "PROJECT_PURGE_FAILED"
  | "BUNNY_STATUS_SYNCED";

export async function writeAuditEvent(input: {
  workspaceId: string;
  projectId?: string | null;
  action: AuditAction;
  performedBy: string;
  affectedUserId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
}) {
  const db = getAdminDb();
  await db.collection(auditEventsPath(input.workspaceId)).add({
    projectId: input.projectId || null,
    action: input.action,
    performedBy: input.performedBy,
    affectedUserId: input.affectedUserId || null,
    previousValue: input.previousValue ?? null,
    newValue: input.newValue ?? null,
    createdAt: FieldValue.serverTimestamp(),
  });
}
