import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

type Body = {
  uid?: string;
  workspaceId?: string;
  projectId?: string;
};

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";
    if (!token) {
      return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
    }
    const decoded = await getAdminAuth().verifyIdToken(token);
    const body = (await request.json()) as Body;
    const uid = (body.uid || "").trim();
    const workspaceId = (body.workspaceId || "").trim();
    const projectId = (body.projectId || "").trim();

    if (!uid || !workspaceId) {
      return NextResponse.json(
        { error: "Missing user or workspace." },
        { status: 400 },
      );
    }

    const db = getAdminDb();
    const requester = await db
      .doc(`companies/${workspaceId}/users/${decoded.uid}`)
      .get();
    const member = await db
      .doc(`workspaces/${workspaceId}/members/${decoded.uid}`)
      .get();
    const allowed =
      (requester.exists && requester.data()?.role === "admin") ||
      (member.exists && member.data()?.role === "OWNER");
    if (!allowed) {
      return NextResponse.json(
        { error: "You do not have permission to manage project access." },
        { status: 403 },
      );
    }

    const nowIso = new Date().toISOString();
    const userRef = db.doc(`companies/${workspaceId}/users/${uid}`);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const projectIds = Array.isArray(userSnap.data()?.projectIds)
      ? (userSnap.data()?.projectIds as string[])
      : [];
    const targets = projectId ? [projectId] : projectIds;

    for (const pid of targets) {
      const memberRef = db.doc(
        `companies/${workspaceId}/projects/${pid}/members/${uid}`,
      );
      const memberSnap = await memberRef.get();
      if (memberSnap.exists) {
        await memberRef.set(
          {
            status: "REVOKED",
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
      await db.doc(`companies/${workspaceId}/projects/${pid}`).set(
        {
          clientUserIds: FieldValue.arrayRemove(uid),
          staffIds: FieldValue.arrayRemove(uid),
          updatedAt: nowIso,
        },
        { merge: true },
      );
    }

    const remaining = projectId
      ? projectIds.filter((id) => id !== projectId)
      : [];

    await userRef.set(
      {
        projectIds: remaining,
        active: remaining.length > 0 ? userSnap.data()?.active !== false : false,
        updatedAt: nowIso,
      },
      { merge: true },
    );

    if (remaining.length === 0) {
      try {
        await getAdminAuth().updateUser(uid, { disabled: true });
      } catch (err) {
        console.error("[access/revoke] disable auth user", err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[access/revoke]", err);
    return NextResponse.json(
      { error: "We could not revoke access. Please try again." },
      { status: 500 },
    );
  }
}
