/**
 * Dry-run report for migrating Project Access from invitations to direct sharing.
 *
 * Does NOT grant access from PENDING invitations.
 * Does NOT delete historical records.
 *
 * Usage:
 *   npx tsx scripts/report-access-migration.ts
 *   npx tsx scripts/report-access-migration.ts --workspace <workspaceId>
 */
import { writeFileSync } from "fs";
import { getScriptDb } from "./lib/admin";

type InvitationRow = {
  path: string;
  workspaceId: string;
  projectId: string;
  status: string;
  email: string;
  inviteType: string;
  expiresAt: string;
};

type MemberRow = {
  path: string;
  workspaceId: string;
  projectId: string;
  uid: string;
  status: string;
  memberType: string;
  inStaffIds: boolean;
  inClientUserIds: boolean;
};

type StaffMirrorRow = {
  path: string;
  workspaceId: string;
  uid: string;
  role: string;
  active: boolean;
  projectIds: string[];
  assignedProjectCount: number;
};

async function main() {
  const args = process.argv.slice(2);
  const wsIdx = args.indexOf("--workspace");
  const workspaceFilter =
    wsIdx >= 0 ? String(args[wsIdx + 1] || "").trim() : "";

  const db = await getScriptDb();
  const invitations: InvitationRow[] = [];
  const members: MemberRow[] = [];
  const staffMirrors: StaffMirrorRow[] = [];

  const inviteSnap = await db.collectionGroup("invitations").get();
  for (const doc of inviteSnap.docs) {
    if (!doc.ref.path.includes("/projects/")) continue;
    const data = doc.data() || {};
    const workspaceId = String(data.workspaceId || "");
    if (workspaceFilter && workspaceId !== workspaceFilter) continue;
    invitations.push({
      path: doc.ref.path,
      workspaceId,
      projectId: String(data.projectId || ""),
      status: String(data.status || ""),
      email: String(data.normalizedEmail || data.email || ""),
      inviteType: String(data.inviteType || ""),
      expiresAt: String(data.expiresAt || ""),
    });
  }

  const memberSnap = await db.collectionGroup("members").get();
  for (const doc of memberSnap.docs) {
    if (!doc.ref.path.includes("/projects/")) continue;
    const data = doc.data() || {};
    const workspaceId = String(data.workspaceId || "");
    const projectId = String(data.projectId || "");
    if (workspaceFilter && workspaceId !== workspaceFilter) continue;
    if (!workspaceId || !projectId) continue;

    const projectSnap = await db
      .doc(`companies/${workspaceId}/projects/${projectId}`)
      .get();
    const project = projectSnap.data() || {};
    const staffIds = Array.isArray(project.staffIds)
      ? project.staffIds.map(String)
      : [];
    const clientUserIds = Array.isArray(project.clientUserIds)
      ? project.clientUserIds.map(String)
      : [];
    const uid = String(data.uid || doc.id);
    members.push({
      path: doc.ref.path,
      workspaceId,
      projectId,
      uid,
      status: String(data.status || ""),
      memberType: String(data.memberType || data.role || ""),
      inStaffIds: staffIds.includes(uid),
      inClientUserIds: clientUserIds.includes(uid),
    });
  }

  const companiesSnap = await db.collection("companies").get();
  for (const company of companiesSnap.docs) {
    const workspaceId = company.id;
    if (workspaceFilter && workspaceId !== workspaceFilter) continue;
    const usersSnap = await db
      .collection(`companies/${workspaceId}/users`)
      .where("role", "==", "staff")
      .get();
    for (const userDoc of usersSnap.docs) {
      const data = userDoc.data() || {};
      const uid = userDoc.id;
      const projectIds = Array.isArray(data.projectIds)
        ? data.projectIds.map(String)
        : [];
      const assignedSnap = await db
        .collection(`companies/${workspaceId}/projects`)
        .where("staffIds", "array-contains", uid)
        .get();
      staffMirrors.push({
        path: userDoc.ref.path,
        workspaceId,
        uid,
        role: String(data.role || ""),
        active: data.active !== false,
        projectIds,
        assignedProjectCount: assignedSnap.size,
      });
    }
  }

  const pendingOnly = invitations.filter((i) => i.status === "PENDING");
  const accepted = invitations.filter((i) => i.status === "ACCEPTED");
  const activeMembers = members.filter((m) => m.status === "ACTIVE");
  const inconsistentMembers = activeMembers.filter((m) => {
    if (m.memberType === "CLIENT") return !m.inClientUserIds;
    if (m.memberType === "COLLEAGUE" || m.memberType === "STAFF")
      return !m.inStaffIds;
    return false;
  });
  const legacyStaffWithNoAssignments = staffMirrors.filter(
    (s) => s.active && s.assignedProjectCount === 0,
  );

  const report = {
    generatedAt: new Date().toISOString(),
    workspaceFilter: workspaceFilter || null,
    summary: {
      invitationsTotal: invitations.length,
      invitationsPending: pendingOnly.length,
      invitationsAccepted: accepted.length,
      projectMembersTotal: members.length,
      projectMembersActive: activeMembers.length,
      inconsistentActiveMembers: inconsistentMembers.length,
      companyStaffUsers: staffMirrors.length,
      companyStaffWithZeroStaffIdsAssignments:
        legacyStaffWithNoAssignments.length,
    },
    notes: [
      "PENDING invitations must NOT be auto-granted. Revoke or ask owners to Share again.",
      "ACCEPTED invitations are historical; live access should come from ACTIVE members + arrays.",
      "company staff with zero staffIds assignments currently lose project access under tightened Rules (expected).",
      "This script does not mutate data.",
    ],
    pendingInvitations: pendingOnly,
    inconsistentActiveMembers: inconsistentMembers,
    legacyStaffWithNoAssignments,
  };

  const outPath = `scripts/access-migration-report-${Date.now()}.json`;
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Wrote dry-run report: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
