import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { sanitizeForFirestore } from "@/lib/sanitize";

export const runtime = "nodejs";

type Body = {
  email?: string;
  password?: string;
  displayName?: string;
  role?: "client" | "staff";
  projectId?: string;
  workspaceId?: string;
};

function friendlyCreateError(err: unknown): string {
  const code =
    typeof err === "object" && err && "code" in err
      ? String((err as { code?: string }).code || "")
      : "";
  if (code === "auth/email-already-exists") {
    return "An account already uses this email. Assign the existing user instead.";
  }
  if (code === "auth/invalid-email") {
    return "Enter a valid email address.";
  }
  if (code === "auth/weak-password" || code === "auth/invalid-password") {
    return "Use a stronger temporary password.";
  }
  return "We could not create access. Please try again.";
}

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
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";
    const displayName = (body.displayName || "").trim();
    const role = body.role;
    const projectId = (body.projectId || "").trim();
    const workspaceId = (body.workspaceId || "").trim();

    if (!email || !password || !displayName || !role) {
      return NextResponse.json(
        { error: "Please complete all required fields." },
        { status: 400 },
      );
    }
    if (role !== "client" && role !== "staff") {
      return NextResponse.json(
        { error: "Only Client or Staff access can be created here." },
        { status: 400 },
      );
    }
    if (!projectId) {
      return NextResponse.json(
        { error: "A project assignment is required." },
        { status: 400 },
      );
    }
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace is required." },
        { status: 400 },
      );
    }

    const db = getAdminDb();
    const requesterCompany = await db
      .doc(`companies/${workspaceId}/users/${decoded.uid}`)
      .get();
    const requesterAccount = await db.doc(`users/${decoded.uid}`).get();
    const isAdmin =
      (requesterCompany.exists &&
        requesterCompany.data()?.role === "admin" &&
        requesterCompany.data()?.active !== false) ||
      (requesterAccount.exists &&
        requesterAccount.data()?.role === "admin" &&
        requesterAccount.data()?.defaultWorkspaceId === workspaceId);

    const member = await db
      .doc(`workspaces/${workspaceId}/members/${decoded.uid}`)
      .get();
    const isOwner =
      member.exists &&
      member.data()?.role === "OWNER" &&
      member.data()?.status === "ACTIVE";

    if (!isAdmin && !isOwner) {
      return NextResponse.json(
        { error: "You do not have permission to manage project access." },
        { status: 403 },
      );
    }

    const projectRef = db.doc(
      `companies/${workspaceId}/projects/${projectId}`,
    );
    const projectSnap = await projectRef.get();
    if (!projectSnap.exists) {
      return NextResponse.json(
        { error: "A project assignment is required." },
        { status: 400 },
      );
    }
    const projectData = projectSnap.data() || {};
    const projectWorkspace =
      projectData.workspaceId || projectData.companyId || workspaceId;
    if (projectWorkspace !== workspaceId) {
      return NextResponse.json(
        { error: "A project assignment is required." },
        { status: 400 },
      );
    }

    const created = await getAdminAuth().createUser({
      email,
      password,
      displayName,
      emailVerified: true,
      disabled: false,
    });

    const now = FieldValue.serverTimestamp();
    const nowIso = new Date().toISOString();
    const batch = db.batch();

    batch.set(
      db.doc(`companies/${workspaceId}/users/${created.uid}`),
      sanitizeForFirestore({
        email,
        displayName,
        role,
        companyId: workspaceId,
        projectIds: [projectId],
        active: true,
        mustChangePassword: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      }),
      { merge: true },
    );

    batch.set(
      db.doc(
        `companies/${workspaceId}/projects/${projectId}/members/${created.uid}`,
      ),
      sanitizeForFirestore({
        uid: created.uid,
        workspaceId,
        projectId,
        displayName,
        email,
        role: role === "client" ? "CLIENT" : "STAFF",
        status: "ACTIVE",
        mustChangePassword: true,
        createdBy: decoded.uid,
        createdAt: now,
        updatedAt: now,
      }),
    );

    const projectPatch: Record<string, unknown> = {
      updatedAt: nowIso,
      workspaceId,
      companyId: workspaceId,
    };
    if (role === "client") {
      projectPatch.clientUserIds = FieldValue.arrayUnion(created.uid);
    } else {
      projectPatch.staffIds = FieldValue.arrayUnion(created.uid);
    }
    batch.set(projectRef, projectPatch, { merge: true });

    await batch.commit();

    return NextResponse.json({
      ok: true,
      uid: created.uid,
      email,
      displayName,
      role,
      projectId,
    });
  } catch (err) {
    console.error("[access/create]", err);
    return NextResponse.json(
      { error: friendlyCreateError(err) },
      { status: 500 },
    );
  }
}
