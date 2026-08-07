import { NextResponse } from "next/server";
import {
  authErrorResponse,
  verifyAuthenticatedRequest,
} from "@/lib/server/auth";
import { listProjectsForUser } from "@/lib/server/project-directory";

export const runtime = "nodejs";

/**
 * Authoritative Project discovery for the signed-in USER: Projects they
 * created, merged with Projects where they hold an ACTIVE membership.
 * Never consults users/{uid}.role, company admin or workspace owner status.
 */
export async function GET(request: Request) {
  try {
    const user = await verifyAuthenticatedRequest(request);
    if (!user.emailVerified) {
      return NextResponse.json({ error: "Email not verified." }, { status: 403 });
    }
    const projects = await listProjectsForUser(user.uid);
    return NextResponse.json({ ok: true, projects });
  } catch (err) {
    const { status, message } = authErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
