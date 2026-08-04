import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";

/**
 * One-way Personal → Company organization migration.
 *
 * Contract (enforced here when enabled):
 * - Only PERSONAL → COMPANY is allowed (never COMPANY → PERSONAL).
 * - Projects, journal, media, purchases, schedule move with the org.
 * - Previous personal org becomes MIGRATED/ARCHIVED.
 * - Leaving a company removes access only — company data stays.
 * - Must run with Admin SDK; clients cannot rewrite organizationId.
 *
 * Full invitation-driven transfer is not enabled yet; this endpoint
 * rejects unsafe directions and documents the security boundary.
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await getAdminAuth().verifyIdToken(token);
    const body = (await request.json().catch(() => ({}))) as {
      direction?: string;
      sourceOrganizationId?: string;
      targetOrganizationId?: string;
    };

    if (body.direction === "COMPANY_TO_PERSONAL") {
      return NextResponse.json(
        {
          error:
            "Company data cannot be transferred into a personal organization.",
        },
        { status: 403 },
      );
    }

    return NextResponse.json(
      {
        error:
          "Personal-to-company migration is not enabled yet. Accept company invitations when that flow is released.",
      },
      { status: 501 },
    );
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
