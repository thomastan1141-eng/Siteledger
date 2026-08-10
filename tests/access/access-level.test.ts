import { describe, expect, it } from "vitest";
import {
  accessLevelToLegacyPreset,
  colleaguePresetToAccessLevel,
  resolveAccessLevel,
  resolveMemberAccessLevel,
} from "@/lib/permissions";

describe("Project accessLevel compatibility", () => {
  it("maps canonical VIEWER and legacy VIEW_ONLY to the same accessLevel", () => {
    expect(resolveAccessLevel("VIEWER")).toBe("VIEWER");
    expect(resolveAccessLevel("VIEW_ONLY")).toBe("VIEWER");
    expect(accessLevelToLegacyPreset("VIEWER")).toBe("VIEW_ONLY");
    expect(colleaguePresetToAccessLevel("VIEW_ONLY")).toBe("VIEWER");
  });

  it("prefers accessLevel over legacy permissionPreset", () => {
    expect(
      resolveMemberAccessLevel({
        accessLevel: "EDITOR",
        permissionPreset: "VIEW_ONLY",
      }),
    ).toBe("EDITOR");
  });

  it("falls back to permissionPreset when accessLevel is missing", () => {
    expect(
      resolveMemberAccessLevel({
        accessLevel: null,
        permissionPreset: "UPDATE_PROGRESS",
      }),
    ).toBe("UPDATE_PROGRESS");
  });

  it("does not invent an accessLevel for CUSTOM or OWNER presets", () => {
    expect(resolveAccessLevel("CUSTOM")).toBeNull();
    expect(resolveAccessLevel("OWNER")).toBeNull();
    expect(resolveAccessLevel("CLIENT")).toBeNull();
  });
});
