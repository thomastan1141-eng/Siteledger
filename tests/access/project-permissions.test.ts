import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type DocSeed = Record<string, unknown> | undefined;

const store = new Map<string, DocSeed>();

function fakeDoc(path: string) {
  return {
    get: async () => {
      const data = store.get(path);
      return {
        exists: data !== undefined,
        data: () => data,
      };
    },
  };
}

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: () => ({ doc: (path: string) => fakeDoc(path) }),
}));

const { assertProjectPermission, assertClientVisibleAllowed } = await import(
  "@/lib/server/project-permissions"
);

const WORKSPACE = "ws-1";
const PROJECT = "proj-1";
const CREATOR = "creator-1";

function seedProject(overrides: Record<string, unknown> = {}) {
  store.set(`companies/${WORKSPACE}/projects/${PROJECT}`, {
    createdBy: CREATOR,
    staffIds: [],
    clientUserIds: [],
    allowStaffPublish: false,
    ...overrides,
  });
}

function seedMember(uid: string, member: Record<string, unknown> | undefined) {
  store.set(
    `companies/${WORKSPACE}/projects/${PROJECT}/members/${uid}`,
    member,
  );
}

beforeEach(() => {
  store.clear();
});

describe("assertProjectPermission — creator", () => {
  it("the Project creator can view, upload, edit, and delete media without any membership doc", async () => {
    seedProject();
    for (const action of [
      "VIEW_MEDIA",
      "UPLOAD_MEDIA",
      "EDIT_MEDIA",
      "DELETE_MEDIA",
    ] as const) {
      const ctx = await assertProjectPermission({
        uid: CREATOR,
        projectId: PROJECT,
        workspaceId: WORKSPACE,
        action,
      });
      expect(ctx.role).toBe("owner");
      expect(ctx.isCreator).toBe(true);
    }
  });
});

describe("assertProjectPermission — VIEW_ONLY colleague", () => {
  it("can view media but cannot upload, edit, or delete", async () => {
    const uid = "view-only-1";
    seedProject({ staffIds: [uid] });
    seedMember(uid, {
      status: "ACTIVE",
      memberType: "COLLEAGUE",
      permissionPreset: "VIEW_ONLY",
      permissions: { viewMedia: true },
    });

    await expect(
      assertProjectPermission({
        uid,
        projectId: PROJECT,
        workspaceId: WORKSPACE,
        action: "VIEW_MEDIA",
      }),
    ).resolves.toBeTruthy();

    for (const action of ["UPLOAD_MEDIA", "EDIT_MEDIA", "DELETE_MEDIA"] as const) {
      await expect(
        assertProjectPermission({
          uid,
          projectId: PROJECT,
          workspaceId: WORKSPACE,
          action,
        }),
      ).rejects.toMatchObject({ status: 403 });
    }
  });
});

describe("assertProjectPermission — UPDATE_PROGRESS colleague", () => {
  it("can upload and edit/delete only its own media, never another user's", async () => {
    const uid = "progress-1";
    const other = "someone-else";
    seedProject({ staffIds: [uid] });
    seedMember(uid, {
      status: "ACTIVE",
      memberType: "COLLEAGUE",
      permissionPreset: "UPDATE_PROGRESS",
      permissions: {
        viewMedia: true,
        uploadMedia: true,
        editOwnMedia: true,
        deleteOwnMedia: true,
      },
    });

    await expect(
      assertProjectPermission({
        uid,
        projectId: PROJECT,
        workspaceId: WORKSPACE,
        action: "UPLOAD_MEDIA",
      }),
    ).resolves.toBeTruthy();

    await expect(
      assertProjectPermission({
        uid,
        projectId: PROJECT,
        workspaceId: WORKSPACE,
        action: "EDIT_MEDIA",
        uploadedBy: uid,
      }),
    ).resolves.toBeTruthy();

    await expect(
      assertProjectPermission({
        uid,
        projectId: PROJECT,
        workspaceId: WORKSPACE,
        action: "EDIT_MEDIA",
        uploadedBy: other,
      }),
    ).rejects.toMatchObject({ status: 403 });

    await expect(
      assertProjectPermission({
        uid,
        projectId: PROJECT,
        workspaceId: WORKSPACE,
        action: "DELETE_MEDIA",
        uploadedBy: other,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("assertProjectPermission — EDITOR colleague", () => {
  it("can edit and delete all media on the assigned Project", async () => {
    const uid = "editor-1";
    seedProject({ staffIds: [uid] });
    seedMember(uid, {
      status: "ACTIVE",
      memberType: "COLLEAGUE",
      permissionPreset: "EDITOR",
      permissions: {
        viewMedia: true,
        uploadMedia: true,
        editAllMedia: true,
        deleteAllMedia: true,
      },
    });

    for (const action of ["UPLOAD_MEDIA", "EDIT_MEDIA", "DELETE_MEDIA"] as const) {
      await expect(
        assertProjectPermission({
          uid,
          projectId: PROJECT,
          workspaceId: WORKSPACE,
          action,
          uploadedBy: "someone-else",
        }),
      ).resolves.toBeTruthy();
    }
  });

  it("has no access to a Project it is not assigned to", async () => {
    const uid = "editor-1";
    seedProject({ staffIds: [] });

    await expect(
      assertProjectPermission({
        uid,
        projectId: PROJECT,
        workspaceId: WORKSPACE,
        action: "VIEW_MEDIA",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("assertProjectPermission — REMOVED membership", () => {
  it("loses all access even though staffIds still lists the uid (stale index)", async () => {
    const uid = "removed-1";
    seedProject({ staffIds: [uid] });
    seedMember(uid, {
      status: "REMOVED",
      memberType: "COLLEAGUE",
      permissionPreset: "EDITOR",
      permissions: { viewMedia: true, uploadMedia: true },
    });

    await expect(
      assertProjectPermission({
        uid,
        projectId: PROJECT,
        workspaceId: WORKSPACE,
        action: "VIEW_MEDIA",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("assertProjectPermission — company/workspace role never substitutes", () => {
  it("ignores companies/{workspaceId}/users/{uid}.role entirely — no membership means no access", async () => {
    const uid = "company-admin-1";
    seedProject();
    // Legacy company-admin doc — never read by loadProjectPermissionContext.
    store.set(`companies/${WORKSPACE}/users/${uid}`, {
      role: "admin",
      active: true,
    });

    await expect(
      assertProjectPermission({
        uid,
        projectId: PROJECT,
        workspaceId: WORKSPACE,
        action: "VIEW_MEDIA",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("assertClientVisibleAllowed", () => {
  it("creator can always publish to client", async () => {
    seedProject();
    const ctx = await assertProjectPermission({
      uid: CREATOR,
      projectId: PROJECT,
      workspaceId: WORKSPACE,
      action: "VIEW_MEDIA",
    });
    await expect(
      assertClientVisibleAllowed(ctx, true),
    ).resolves.toBeUndefined();
  });

  it("a colleague without publishMediaToClient cannot mark media client-visible", async () => {
    const uid = "editor-1";
    seedProject({ staffIds: [uid], allowStaffPublish: true });
    seedMember(uid, {
      status: "ACTIVE",
      memberType: "COLLEAGUE",
      permissionPreset: "EDITOR",
      permissions: { viewMedia: true },
    });
    const ctx = await assertProjectPermission({
      uid,
      projectId: PROJECT,
      workspaceId: WORKSPACE,
      action: "VIEW_MEDIA",
    });
    await expect(assertClientVisibleAllowed(ctx, true)).rejects.toMatchObject({
      status: 403,
    });
  });
});
