import { describe, expect, it } from "vitest";
import { permissionsForPreset } from "@/lib/permissions";

// Company-admin / workspace-role based Project discovery has been removed
// entirely. Discovery is now server-authenticated (createdBy or ACTIVE
// membership only) — see tests/rules for the Firestore-enforced behaviour
// and src/lib/server/project-directory.ts for the implementation.
describe("permissionsForPreset — three current presets", () => {
  it("VIEW_ONLY can read but never create, update, upload, or delete", () => {
    const perms = permissionsForPreset("VIEW_ONLY");
    expect(perms.viewProject).toBe(true);
    expect(perms.viewMedia).toBe(true);
    expect(perms.downloadMedia).toBe(true);
    expect(perms.updateSchedule).toBe(false);
    expect(perms.addJournal).toBe(false);
    expect(perms.uploadMedia).toBe(false);
    expect(perms.deleteOwnMedia).toBe(false);
    expect(perms.deleteAllMedia).toBe(false);
    expect(perms.editProjectDetails).toBe(false);
    expect(perms.manageProjectAccess).toBe(false);
  });

  it("UPDATE_PROGRESS can update progress and own Journal/Media only", () => {
    const perms = permissionsForPreset("UPDATE_PROGRESS");
    expect(perms.updateSchedule).toBe(true);
    expect(perms.addJournal).toBe(true);
    expect(perms.editOwnJournal).toBe(true);
    expect(perms.uploadMedia).toBe(true);
    expect(perms.editOwnMedia).toBe(true);
    expect(perms.deleteOwnMedia).toBe(true);
    // Never "all" scope, never project settings/Purchases/Access/ownership.
    expect(perms.editAllJournal).toBe(false);
    expect(perms.deleteAllJournal).toBe(false);
    expect(perms.editAllMedia).toBe(false);
    expect(perms.deleteAllMedia).toBe(false);
    expect(perms.editProjectDetails).toBe(false);
    expect(perms.editPurchases).toBe(false);
    expect(perms.manageProjectAccess).toBe(false);
  });

  it("EDITOR can manage all normal content but never Access or ownership", () => {
    const perms = permissionsForPreset("EDITOR");
    expect(perms.editAllJournal).toBe(true);
    expect(perms.deleteAllJournal).toBe(true);
    expect(perms.editAllMedia).toBe(true);
    expect(perms.deleteAllMedia).toBe(true);
    expect(perms.editPurchases).toBe(true);
    expect(perms.editProjectDetails).toBe(true);
    // Never Access management, member permissions, ownership, or full delete.
    expect(perms.manageProjectAccess).toBe(false);
  });

  it("CUSTOM stays readable for historical records only (never selectable for new shares)", () => {
    const perms = permissionsForPreset("CUSTOM");
    expect(perms.viewProject).toBe(true);
    // A bare CUSTOM preset with no stored permissions grants nothing else —
    // historical CUSTOM records carry their own explicit permissions map,
    // which mergePermissions layers on top of this base.
    expect(perms.manageProjectAccess).toBe(false);
    expect(perms.deleteAllMedia).toBe(false);
  });
});
