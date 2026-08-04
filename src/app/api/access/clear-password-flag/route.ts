import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { COMPANY_ID } from "@/lib/constants";

export const runtime = "nodejs";

/** After client-side updatePassword, clear mustChangePassword via Admin. */
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
    const body = (await request.json().catch(() => ({}))) as {
      workspaceId?: string;
    };
    const db = getAdminDb();
    const account = await db.doc(`users/${decoded.uid}`).get();

    const candidates = Array.from(
      new Set(
        [
          body.workspaceId,
          account.data()?.defaultWorkspaceId,
          account.data()?.companyId,
          COMPANY_ID,
        ]
          .map((v) => String(v || "").trim())
          .filter(Boolean),
      ),
    );

    const now = new Date().toISOString();
    let cleared = false;

    for (const workspaceId of candidates) {
      const userRef = db.doc(`companies/${workspaceId}/users/${decoded.uid}`);
      const userSnap = await userRef.get();
      if (!userSnap.exists) continue;
      await userRef.set(
        { mustChangePassword: false, updatedAt: now },
        { merge: true },
      );
      const projectIds = Array.isArray(userSnap.data()?.projectIds)
        ? (userSnap.data()?.projectIds as string[])
        : [];
      await Promise.all(
        projectIds.map((projectId) =>
          db
            .doc(
              `companies/${workspaceId}/projects/${projectId}/members/${decoded.uid}`,
            )
            .set(
              { mustChangePassword: false, updatedAt: now },
              { merge: true },
            )
            .catch(() => undefined),
        ),
      );
      cleared = true;
      break;
    }

    if (!cleared) {
      // Still succeed if Auth password was changed; profile flag may already be false.
      return NextResponse.json({ ok: true, cleared: false });
    }

    return NextResponse.json({ ok: true, cleared: true });
  } catch (err) {
    console.error("[clear-password-flag]", err);
    return NextResponse.json(
      { error: "We could not update your password status." },
      { status: 500 },
    );
  }
}
