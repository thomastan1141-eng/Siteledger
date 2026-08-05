import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { COMPANY_ID } from "@/lib/constants";
import { sanitizeForFirestore } from "@/lib/sanitize";

export const runtime = "nodejs";

type Body = {
  studioName?: string | null;
  displayName?: string | null;
  /** When true, attach legacy companies/siteledger projects to this workspace if owner. */
  migrateLegacy?: boolean;
};

/**
 * Idempotent post-verification onboarding.
 * Creates users/{uid}, workspaces/{id}, membership, and company user mirror.
 *
 * Migration assumption (documented):
 * If migrateLegacy is requested and the caller is the existing bootstrap admin
 * for companies/siteledger/meta/setup, existing projects under
 * companies/siteledger/projects are stamped with workspaceId = "siteledger"
 * and remain in place (no duplication).
 */
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
    if (!decoded.email_verified) {
      return NextResponse.json(
        { error: "Email not verified" },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as Body;
    const db = getAdminDb();
    const uid = decoded.uid;
    const email = decoded.email || "";
    const displayName =
      (body.displayName || "").trim() ||
      decoded.name ||
      email.split("@")[0] ||
      "Owner";
    const studioName =
      (body.studioName || "").trim() || `${displayName}'s Studio`;

    const userRef = db.doc(`users/${uid}`);
    const existingUser = await userRef.get();

    if (existingUser.exists && existingUser.data()?.onboardingComplete) {
      const workspaceId = String(
        existingUser.data()?.defaultWorkspaceId ||
          existingUser.data()?.companyId ||
          "",
      );
      return NextResponse.json({
        ok: true,
        workspaceId,
        alreadyComplete: true,
      });
    }

    // Prefer legacy siteledger workspace if this user is the bootstrap admin.
    let workspaceId = "";
    const setupSnap = await db.doc(`companies/${COMPANY_ID}/meta/setup`).get();
    const isLegacyAdmin =
      setupSnap.exists && setupSnap.data()?.adminUid === uid;

    if (isLegacyAdmin) {
      workspaceId = COMPANY_ID;
    } else if (existingUser.exists && existingUser.data()?.defaultWorkspaceId) {
      workspaceId = String(existingUser.data()?.defaultWorkspaceId);
    } else {
      workspaceId = db.collection("workspaces").doc().id;
    }

    const now = FieldValue.serverTimestamp();
    const batch = db.batch();

    const workspaceRef = db.doc(`workspaces/${workspaceId}`);
    const workspaceSnap = await workspaceRef.get();
    if (!workspaceSnap.exists) {
      batch.set(
        workspaceRef,
        sanitizeForFirestore({
          name: isLegacyAdmin ? "SiteLedger" : studioName,
          ownerUid: uid,
          plan: "FREE",
          subscriptionStatus: "NONE",
          trialStartsAt: null,
          trialEndsAt: null,
          createdAt: now,
          updatedAt: now,
        }),
      );
    }

    batch.set(
      db.doc(`workspaces/${workspaceId}/members/${uid}`),
      sanitizeForFirestore({
        uid,
        email,
        displayName,
        role: "OWNER",
        status: "ACTIVE",
        createdAt: now,
      }),
      { merge: true },
    );

    batch.set(
      userRef,
      sanitizeForFirestore({
        email,
        displayName,
        studioName: isLegacyAdmin ? "SiteLedger" : studioName,
        defaultWorkspaceId: workspaceId,
        companyId: workspaceId,
        onboardingComplete: true,
        emailVerified: true,
        role: "admin",
        projectIds: [],
        active: true,
        createdAt: existingUser.exists
          ? existingUser.data()?.createdAt || now
          : now,
        updatedAt: now,
      }),
      { merge: true },
    );

    // Mirror into company users for existing staff-path rules/services.
    batch.set(
      db.doc(`companies/${workspaceId}/users/${uid}`),
      sanitizeForFirestore({
        email,
        displayName,
        role: "admin",
        companyId: workspaceId,
        projectIds: [],
        active: true,
        createdAt: now,
        updatedAt: now,
      }),
      { merge: true },
    );

    if (!setupSnap.exists && workspaceId !== COMPANY_ID) {
      // New tenants do not claim the legacy setup lock.
    } else if (!setupSnap.exists && workspaceId === COMPANY_ID) {
      batch.set(db.doc(`companies/${COMPANY_ID}/meta/setup`), {
        completed: true,
        adminUid: uid,
        adminEmail: email,
        completedAt: now,
      });
    }

    await batch.commit();

    // Safe migration: stamp workspaceId onto legacy projects (no duplication).
    if (isLegacyAdmin || body.migrateLegacy) {
      const projectsSnap = await db
        .collection(`companies/${COMPANY_ID}/projects`)
        .get();
      const updates = projectsSnap.docs
        .filter((d) => {
          const data = d.data();
          return !data.workspaceId || !data.status;
        })
        .map((d) => {
          const data = d.data();
          return d.ref.set(
            {
              workspaceId: data.workspaceId || COMPANY_ID,
              companyId: data.companyId || COMPANY_ID,
              status: data.status || "upcoming",
              updatedAt: new Date().toISOString(),
            },
            { merge: true },
          );
        });
      await Promise.all(updates);
    }

    return NextResponse.json({ ok: true, workspaceId, alreadyComplete: false });
  } catch (err) {
    console.error("[onboarding]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Onboarding failed. Please try again.",
      },
      { status: 500 },
    );
  }
}
