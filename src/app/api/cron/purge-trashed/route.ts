import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { deleteBunnyVideo } from "@/lib/bunny/server";
import { writeAuditEvent } from "@/lib/server/audit";
import { getStorage } from "firebase-admin/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily purge of soft-deleted projects past purgeAt.
 * Secure with CRON_SECRET header: Authorization: Bearer <CRON_SECRET>
 * Configure Cloud Scheduler to hit this route once daily.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET || "";
  const auth = request.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminDb();
  const nowIso = new Date().toISOString();
  const snap = await db
    .collectionGroup("projects")
    .where("status", "==", "trashed")
    .where("purgeAt", "<=", nowIso)
    .limit(10)
    .get();

  const results: Array<{ projectId: string; ok: boolean; error?: string }> = [];

  for (const doc of snap.docs) {
    const parts = doc.ref.path.split("/");
    const workspaceId = parts[1] || "";
    const projectId = doc.id;
    try {
      await doc.ref.update({
        status: "purging",
        updatedAt: FieldValue.serverTimestamp(),
      });
      await writeAuditEvent({
        workspaceId,
        projectId,
        action: "PROJECT_PURGE_STARTED",
        performedBy: "system:cron",
      });

      // Delete Bunny videos
      const mediaSnap = await db
        .collection(`companies/${workspaceId}/projects/${projectId}/media`)
        .get();
      for (const media of mediaSnap.docs) {
        const data = media.data();
        if (data.provider === "BUNNY_STREAM" && data.bunnyVideoId) {
          await deleteBunnyVideo(String(data.bunnyVideoId));
        }
        if (data.storagePath) {
          try {
            const bucket = getStorage().bucket();
            await bucket.file(String(data.storagePath)).delete({ ignoreNotFound: true });
          } catch {
            /* continue */
          }
        }
        await media.ref.delete();
      }

      // Delete subcollections
      for (const sub of [
        "schedule",
        "updates",
        "dailyPlans",
        "purchases",
        "members",
        "invitations",
      ]) {
        const subSnap = await db
          .collection(`companies/${workspaceId}/projects/${projectId}/${sub}`)
          .limit(400)
          .get();
        const batch = db.batch();
        subSnap.docs.forEach((d) => batch.delete(d.ref));
        if (!subSnap.empty) await batch.commit();
      }

      await doc.ref.delete();
      await writeAuditEvent({
        workspaceId,
        projectId,
        action: "PROJECT_PURGE_COMPLETED",
        performedBy: "system:cron",
      });
      results.push({ projectId, ok: true });
    } catch (err) {
      await writeAuditEvent({
        workspaceId,
        projectId,
        action: "PROJECT_PURGE_FAILED",
        performedBy: "system:cron",
        newValue: {
          error: err instanceof Error ? err.message : "purge_failed",
        },
      }).catch(() => undefined);
      // Leave as purging/trashed for retry — reset to trashed if stuck
      await doc.ref
        .update({
          status: "trashed",
          updatedAt: FieldValue.serverTimestamp(),
        })
        .catch(() => undefined);
      results.push({
        projectId,
        ok: false,
        error: err instanceof Error ? err.message : "purge_failed",
      });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
