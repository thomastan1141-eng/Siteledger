import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";

/** Store idempotent create results under companies/{ws}/createRequests/{uid}_{requestId} */
export async function getCreateRequest(
  workspaceId: string,
  uid: string,
  clientRequestId: string,
) {
  const id = `${uid}_${clientRequestId}`;
  const ref = getAdminDb().doc(
    `companies/${workspaceId}/createRequests/${id}`,
  );
  const snap = await ref.get();
  if (!snap.exists) return null;
  return { id, ref, data: snap.data() as Record<string, unknown> };
}

export async function saveCreateRequest(
  workspaceId: string,
  uid: string,
  clientRequestId: string,
  result: Record<string, unknown>,
) {
  const id = `${uid}_${clientRequestId}`;
  const ref = getAdminDb().doc(
    `companies/${workspaceId}/createRequests/${id}`,
  );
  await ref.set(
    {
      uid,
      clientRequestId,
      workspaceId,
      result,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return ref;
}
