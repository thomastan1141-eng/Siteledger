import { NextResponse } from "next/server";
import { verifyAuthenticatedRequest, authErrorResponse } from "@/lib/server/auth";
import { assertWorkspaceAdmin } from "@/lib/server/invitations";
import { getAdminDb } from "@/lib/firebase-admin";
import { getProjectDisplayTitle } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await verifyAuthenticatedRequest(request);
    const { searchParams } = new URL(request.url);
    const workspaceId = (searchParams.get("workspaceId") || "").trim();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required." },
        { status: 400 },
      );
    }

    await assertWorkspaceAdmin(user.uid, workspaceId);

    const db = getAdminDb();
    const [projectsSnap, membersSnap, invitationsSnap] = await Promise.all([
      db.collection(`companies/${workspaceId}/projects`).get(),
      db
        .collectionGroup("members")
        .where("workspaceId", "==", workspaceId)
        .get(),
      db
        .collectionGroup("invitations")
        .where("workspaceId", "==", workspaceId)
        .get(),
    ]);

    const projectTitles = new Map<string, string>();
    for (const doc of projectsSnap.docs) {
      const data = doc.data() || {};
      projectTitles.set(
        doc.id,
        getProjectDisplayTitle({
          address: (data.address as string) ?? null,
          name: (data.name as string) ?? null,
        }),
      );
    }

    // collectionGroup("members") also matches workspaces/*/members — keep project members only.
    const members = membersSnap.docs
      .filter((doc) => doc.ref.path.includes("/projects/"))
      .map((doc) => {
        const data = doc.data() || {};
        const projectId = String(data.projectId || "");
        return {
          uid: String(data.uid || doc.id),
          projectId,
          projectTitle: projectTitles.get(projectId) || "Untitled project",
          displayName: (data.displayName as string) || null,
          email: String(data.email || ""),
          memberType: String(data.memberType || (data.role === "CLIENT" ? "CLIENT" : "COLLEAGUE")),
          permissionPreset: (data.permissionPreset as string) || null,
          status: String(data.status || "ACTIVE"),
          invitedAt: (data.invitedAt as string) || null,
          acceptedAt: (data.acceptedAt as string) || null,
        };
      })
      .filter((m) => m.status !== "REMOVED" && Boolean(m.projectId))
      .filter((m) => m.memberType !== "OWNER" && m.permissionPreset !== "OWNER")
      .sort((a, b) => (b.acceptedAt || b.invitedAt || "").localeCompare(a.acceptedAt || a.invitedAt || ""));

    const pendingInvitations = invitationsSnap.docs
      .map((doc) => {
        const data = doc.data() || {};
        const projectId = String(data.projectId || "");
        return {
          id: doc.id,
          projectId,
          projectTitle: projectTitles.get(projectId) || "Untitled project",
          inviteType: String(data.inviteType || "CLIENT"),
          email: String(data.email || ""),
          displayName: (data.displayName as string) || null,
          colleaguePreset: (data.colleaguePreset as string) || null,
          status: String(data.status || "PENDING"),
          invitedAt: String(data.invitedAt || ""),
          expiresAt: String(data.expiresAt || ""),
        };
      })
      .filter((invite) => invite.status === "PENDING")
      .sort((a, b) => b.invitedAt.localeCompare(a.invitedAt));

    return NextResponse.json({ ok: true, members, pendingInvitations });
  } catch (err) {
    const { status, message } = authErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
