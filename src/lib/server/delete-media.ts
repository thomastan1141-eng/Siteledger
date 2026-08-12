import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { softDeleteMedia, updateMediaAdmin } from "@/lib/bunny/media-store";
import { deleteBunnyVideo } from "@/lib/bunny/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { storagePathsToDelete } from "@/lib/media-storage-paths";
import { writeAuditEvent } from "@/lib/server/audit";
import { resolveProjectForUser } from "@/lib/server/project-directory";
import { assertProjectPermission } from "@/lib/server/project-permissions";

export { storagePathsToDelete } from "@/lib/media-storage-paths";

async function deleteStorageObject(path: string) {
  const trimmed = path.trim();
  if (!trimmed) return;
  try {
    await getStorage().bucket().file(trimmed).delete({ ignoreNotFound: true });
  } catch {
    // Best-effort — Firestore/update cleanup must still proceed.
  }
}

async function detachFromJournalUpdate(
  workspaceId: string,
  projectId: string,
  mediaId: string,
  updateId: string | undefined,
) {
  if (!updateId) return;
  const updateRef = getAdminDb().doc(
    `companies/${workspaceId}/projects/${projectId}/updates/${updateId}`,
  );
  try {
    await updateRef.update({
      mediaIds: FieldValue.arrayRemove(mediaId),
      updatedAt: new Date().toISOString(),
    });
  } catch {
    // Update may already be gone — ignore.
  }
}

/**
 * Single source of truth for Media + Journal/Journey deletes.
 * Photos: hard-delete Storage (original + thumb) + Firestore + journal refs.
 * Bunny videos: delete Bunny object + soft-delete (tombstone) the media doc.
 */
export async function deleteProjectMediaItem(input: {
  uid: string;
  projectId: string;
  workspaceId?: string;
  mediaId: string;
}): Promise<{ kind: "photo" | "video" }> {
  const projectId = input.projectId.trim();
  const mediaId = input.mediaId.trim();
  if (!projectId || !mediaId) {
    throw Object.assign(new Error("Media not found."), { status: 404 });
  }

  const resolved = await resolveProjectForUser(
    input.uid,
    projectId,
    input.workspaceId,
  );
  if (!resolved) {
    throw Object.assign(new Error("Project not found."), { status: 404 });
  }

  const db = getAdminDb();
  const ref = db.doc(
    `companies/${resolved.workspaceId}/projects/${projectId}/media/${mediaId}`,
  );
  const snap = await ref.get();
  if (!snap.exists) {
    throw Object.assign(new Error("Media not found."), { status: 404 });
  }
  const data = snap.data() || {};

  await assertProjectPermission({
    uid: input.uid,
    projectId,
    workspaceId: resolved.workspaceId,
    action: "DELETE_MEDIA",
    uploadedBy: (data.uploadedBy as string | null) ?? null,
  });

  const provider = String(data.provider || "");
  if (provider === "BUNNY_STREAM") {
    const bunnyVideoId = String(data.bunnyVideoId || "");
    if (!bunnyVideoId) {
      throw Object.assign(new Error("Media not found."), { status: 404 });
    }
    const previousStatus = data.status || "READY";
    await updateMediaAdmin(resolved.workspaceId, projectId, mediaId, {
      status: "DELETING",
    });
    const deleted = await deleteBunnyVideo(bunnyVideoId);
    if (!deleted) {
      await updateMediaAdmin(resolved.workspaceId, projectId, mediaId, {
        status: previousStatus,
      });
      throw Object.assign(
        new Error("The video could not be deleted. Please try again."),
        { status: 502 },
      );
    }
    await softDeleteMedia(resolved.workspaceId, projectId, mediaId);
    await detachFromJournalUpdate(
      resolved.workspaceId,
      projectId,
      mediaId,
      typeof data.updateId === "string" ? data.updateId : undefined,
    );
    await writeAuditEvent({
      workspaceId: resolved.workspaceId,
      projectId,
      action: "MEDIA_DELETED",
      performedBy: input.uid,
      previousValue: { mediaId, kind: "video", provider: "BUNNY_STREAM" },
    });
    return { kind: "video" };
  }

  for (const path of storagePathsToDelete(data)) {
    await deleteStorageObject(path);
  }
  await detachFromJournalUpdate(
    resolved.workspaceId,
    projectId,
    mediaId,
    typeof data.updateId === "string" ? data.updateId : undefined,
  );
  await ref.delete();
  await writeAuditEvent({
    workspaceId: resolved.workspaceId,
    projectId,
    action: "MEDIA_DELETED",
    performedBy: input.uid,
    previousValue: { mediaId, kind: "photo" },
  });
  return { kind: "photo" };
}
