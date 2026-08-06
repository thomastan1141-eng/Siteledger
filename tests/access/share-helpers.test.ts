import { describe, expect, it } from "vitest";
import { countSharedUsers } from "../../src/lib/services/invites";
import { workspaceIdsForProfile } from "../../src/lib/services/projects";

describe("countSharedUsers", () => {
  it("counts staff and clients and excludes creator", () => {
    expect(
      countSharedUsers({
        createdBy: "owner-1",
        staffIds: ["owner-1", "staff-2"],
        clientUserIds: ["client-1", "client-2"],
      }),
    ).toBe(3);
  });

  it("returns zero when empty", () => {
    expect(countSharedUsers({})).toBe(0);
  });
});

describe("workspaceIdsForProfile", () => {
  it("includes shared workspaces without replacing default", () => {
    expect(
      workspaceIdsForProfile({
        defaultWorkspaceId: "home",
        companyId: "home",
        sharedWorkspaceIds: ["other", "home"],
      }),
    ).toEqual(["home", "other"]);
  });
});
