import { NextResponse } from "next/server";
import { verifyAuthenticatedRequest, authErrorResponse } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { getProjectDisplayTitle } from "@/lib/utils";

export const runtime = "nodejs";

// Access management lists only Projects created by the current USER — no
// workspaceId param, no company-admin/workspace-admin authority.
export async function GET(request: Request) {
  try {
    const user = await verifyAuthenticatedRequest(request);
    const db = getAdminDb();

    const ownedSnap = await db
      .collectionGroup("projects")
      .where("createdBy", "==", user.uid)
      .get();

    const projectTitles = new Map<string, string>();
    const ownedRefs = ownedSnap.docs
      .filter((doc) => doc.ref.path.startsWith("companies/"))
      .filter((doc) => {
        const status = String(doc.data()?.status || "");
        return status !== "trashed" && status !== "purging";
      });

    for (const doc of ownedRefs) {
      const data = doc.data() || {};
      projectTitles.set(
        doc.id,
        getProjectDisplayTitle({
          address: (data.address as string) ?? null,
          name: (data.name as string) ?? null,
        }),
      );
    }

    const [membersByProject, invitationsByProject] = await Promise.all([
      Promise.all(ownedRefs.map((doc) => doc.ref.collection("members").get())),
      Promise.all(
        ownedRefs.map((doc) => doc.ref.collection("invitations").get()),
      ),
    ]);

    const members = membersByProject
      .flatMap((snap) => snap.docs)
      .map((doc) => {
        const data = doc.data() || {};
        const projectId = String(data.projectId || "");
        return {
          uid: String(data.uid || doc.id),
          projectId,
          projectTitle: projectTitles.get(projectId) || "Untitled project",
          displayName: (data.displayName as string) || null,
          email: String(data.email || ""),
          memberType: String(
            data.memberType || (data.role === "CLIENT" ? "CLIENT" : "COLLEAGUE"),
          ),
          permissionPreset: (data.permissionPreset as string) || null,
          status: String(data.status || "ACTIVE"),
          invitedAt: (data.invitedAt as string) || null,
          acceptedAt: (data.acceptedAt as string) || null,
        };
      })
      .filter((m) => m.status !== "REMOVED" && Boolean(m.projectId))
      .filter((m) => m.memberType !== "OWNER" && m.permissionPreset !== "OWNER")
      .sort((a, b) =>
        (b.acceptedAt || b.invitedAt || "").localeCompare(
          a.acceptedAt || a.invitedAt || "",
        ),
      );

    const pendingInvitations = invitationsByProject
      .flatMap((snap) => snap.docs)
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
