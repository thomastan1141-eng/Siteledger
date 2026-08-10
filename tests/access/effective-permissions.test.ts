import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { resolveEffectivePermissions } = await import(
  "@/lib/server/project-directory"
);

// resolveEffectivePermissions is the single resolver used by the Projects
// list/resolve API (src/lib/server/project-directory.ts) and by
// src/lib/server/project-permissions.ts for every Media/Journal/Purchase
// permission check — see AGENTS-facing note in project-directory.ts.
describe("resolveEffectivePermissions — creator / client", () => {
  it("Project creator always gets full OWNER permissions", () => {
    const perms = resolveEffectivePermissions({
      isOwner: true,
      memberType: null,
      permissionPreset: null,
    });
    expect(perms?.manageProjectAccess).toBe(true);
    expect(perms?.deleteAllMedia).toBe(true);
    expect(perms?.editPurchases).toBe(true);
  });

  it("a CLIENT member never resolves Colleague permissions (client boundary is separate)", () => {
    const perms = resolveEffectivePermissions({
      isOwner: false,
      memberType: "CLIENT",
      permissionPreset: "CLIENT",
    });
    expect(perms).toBeNull();
  });
});

describe("resolveEffectivePermissions — named presets with no stored override", () => {
  it("VIEW_ONLY resolves the read-only preset table", () => {
    const perms = resolveEffectivePermissions({
      isOwner: false,
      memberType: "COLLEAGUE",
      permissionPreset: "VIEW_ONLY",
    });
    expect(perms?.viewMedia).toBe(true);
    expect(perms?.uploadMedia).toBe(false);
    expect(perms?.editPurchases).toBe(false);
  });

  it("canonical VIEWER accessLevel matches VIEW_ONLY rights", () => {
    const perms = resolveEffectivePermissions({
      isOwner: false,
      memberType: "COLLEAGUE",
      accessLevel: "VIEWER",
      permissionPreset: null,
    });
    expect(perms?.viewMedia).toBe(true);
    expect(perms?.downloadMedia).toBe(true);
    expect(perms?.uploadMedia).toBe(false);
    expect(perms?.manageProjectAccess).toBe(false);
  });

  it("UPDATE_PROGRESS resolves own-scope update/journal/media only", () => {
    const perms = resolveEffectivePermissions({
      isOwner: false,
      memberType: "COLLEAGUE",
      permissionPreset: "UPDATE_PROGRESS",
    });
    expect(perms?.updateSchedule).toBe(true);
    expect(perms?.uploadMedia).toBe(true);
    expect(perms?.editOwnMedia).toBe(true);
    expect(perms?.deleteAllMedia).toBe(false);
    expect(perms?.manageProjectAccess).toBe(false);
    expect(perms?.editPurchases).toBe(false);
  });

  it("EDITOR resolves broad content edit rights but never Access management", () => {
    const perms = resolveEffectivePermissions({
      isOwner: false,
      memberType: "COLLEAGUE",
      permissionPreset: "EDITOR",
    });
    expect(perms?.editAllMedia).toBe(true);
    expect(perms?.editPurchases).toBe(true);
    expect(perms?.editProjectDetails).toBe(true);
    expect(perms?.manageProjectAccess).toBe(false);
  });
});

describe("resolveEffectivePermissions — historical CUSTOM records", () => {
  it("resolves the record's own stored permissions verbatim, not a preset default", () => {
    const perms = resolveEffectivePermissions({
      isOwner: false,
      memberType: "COLLEAGUE",
      permissionPreset: "CUSTOM",
      permissions: { viewMedia: true, uploadMedia: true },
    });
    expect(perms?.viewMedia).toBe(true);
    expect(perms?.uploadMedia).toBe(true);
    // Everything not explicitly granted in the stored map defaults to false —
    // never inherited from another preset's broader table.
    expect(perms?.editAllMedia).toBe(false);
    expect(perms?.deleteAllMedia).toBe(false);
    expect(perms?.editPurchases).toBe(false);
    expect(perms?.manageProjectAccess).toBe(false);
  });

  it("a CUSTOM record with no stored permissions grants nothing beyond viewProject", () => {
    const perms = resolveEffectivePermissions({
      isOwner: false,
      memberType: "COLLEAGUE",
      permissionPreset: "CUSTOM",
      permissions: null,
    });
    expect(perms?.viewProject).toBe(true);
    expect(perms?.viewMedia).toBe(false);
    expect(perms?.manageProjectAccess).toBe(false);
  });

  it("an explicit stored permissions map on a named preset overrides the preset defaults", () => {
    // Not a shape the app's own /api/access/share route writes today (new
    // shares always store permissions: null), but defensive for any legacy
    // record that does carry one — explicit data must never be widened.
    const perms = resolveEffectivePermissions({
      isOwner: false,
      memberType: "COLLEAGUE",
      permissionPreset: "EDITOR",
      permissions: { viewMedia: true },
    });
    expect(perms?.viewMedia).toBe(true);
    expect(perms?.editAllMedia).toBe(false);
    expect(perms?.editPurchases).toBe(false);
  });
});
