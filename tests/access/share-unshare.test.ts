import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// ---- Minimal in-memory Firestore fake --------------------------------
// Supports .doc().get(), .batch().set(..., {merge:true}).commit(), and
// resolves arrayUnion / arrayRemove / serverTimestamp sentinels the same
// way the real emulator would for the fields shareProjectAccess and
// revokeProjectAccess actually write.
const store = new Map<string, Record<string, unknown> | undefined>();

function isTransform(value: unknown, ctorName: string) {
  return (
    typeof value === "object" && value !== null && value.constructor?.name === ctorName
  );
}

function resolveField(existingValue: unknown, incoming: unknown) {
  if (isTransform(incoming, "ArrayUnionTransform")) {
    const elements = (incoming as { elements: unknown[] }).elements;
    const base = Array.isArray(existingValue) ? existingValue.slice() : [];
    for (const el of elements) if (!base.includes(el)) base.push(el);
    return base;
  }
  if (isTransform(incoming, "ArrayRemoveTransform")) {
    const elements = (incoming as { elements: unknown[] }).elements;
    const base = Array.isArray(existingValue) ? existingValue.slice() : [];
    return base.filter((v) => !elements.includes(v));
  }
  if (isTransform(incoming, "ServerTimestampTransform")) {
    return "FAKE_SERVER_TIMESTAMP";
  }
  return incoming;
}

function applyMerge(path: string, patch: Record<string, unknown>) {
  const existing = store.get(path) || {};
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    merged[key] = resolveField(existing[key], value);
  }
  store.set(path, merged);
}

function fakeDoc(path: string) {
  return {
    path,
    get: async () => {
      const data = store.get(path);
      return { exists: data !== undefined, data: () => data };
    },
  };
}

function fakeDb() {
  return {
    doc: (path: string) => fakeDoc(path),
    batch: () => {
      const queued: Array<{ path: string; data: Record<string, unknown> }> = [];
      return {
        set: (
          ref: { path: string },
          data: Record<string, unknown>,
          _opts?: { merge?: boolean },
        ) => {
          queued.push({ path: ref.path, data });
        },
        commit: async () => {
          for (const op of queued) applyMerge(op.path, op.data);
        },
      };
    },
  };
}

// ---- Auth fake ---------------------------------------------------------
const authUsers = new Map<
  string,
  { uid: string; email: string; displayName?: string; emailVerified: boolean; disabled?: boolean }
>();

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: () => fakeDb(),
  getAdminAuth: () => ({
    getUserByEmail: async (email: string) => {
      const user = authUsers.get(email.toLowerCase());
      if (!user) {
        throw Object.assign(new Error("no user"), { code: "auth/user-not-found" });
      }
      return user;
    },
  }),
}));

vi.mock("@/lib/server/audit", () => ({
  writeAuditEvent: vi.fn(async () => {}),
}));

const { shareProjectAccess, revokeProjectAccess, ProjectAccessError } = await import(
  "@/lib/server/project-access"
);

const WORKSPACE = "ws-1";
const PROJECT = "proj-1";
const CREATOR = "creator-1";

beforeEach(() => {
  store.clear();
  authUsers.clear();
  store.set(`companies/${WORKSPACE}/projects/${PROJECT}`, {
    createdBy: CREATOR,
    status: "in_progress",
    staffIds: [],
    clientUserIds: [],
  });
});

function registerAuthUser(
  uid: string,
  email: string,
  opts: { emailVerified?: boolean; disabled?: boolean } = {},
) {
  authUsers.set(email.toLowerCase(), {
    uid,
    email,
    displayName: uid,
    emailVerified: opts.emailVerified ?? true,
    disabled: opts.disabled ?? false,
  });
}

describe("shareProjectAccess", () => {
  it("only the Project creator may share (creator-only Access management)", async () => {
    registerAuthUser("colleague-1", "colleague@example.com");
    await expect(
      shareProjectAccess({
        actorUid: "not-the-creator",
        workspaceId: WORKSPACE,
        projectId: PROJECT,
        email: "colleague@example.com",
        inviteType: "COLLEAGUE",
        colleaguePreset: "EDITOR",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects sharing with an unverified email account", async () => {
    registerAuthUser("colleague-1", "colleague@example.com", {
      emailVerified: false,
    });
    await expect(
      shareProjectAccess({
        actorUid: CREATOR,
        workspaceId: WORKSPACE,
        projectId: PROJECT,
        email: "colleague@example.com",
        inviteType: "COLLEAGUE",
        colleaguePreset: "EDITOR",
      }),
    ).rejects.toMatchObject({ code: "unverified", status: 403 });
  });

  it("rejects sharing with an account that does not exist", async () => {
    await expect(
      shareProjectAccess({
        actorUid: CREATOR,
        workspaceId: WORKSPACE,
        projectId: PROJECT,
        email: "nobody@example.com",
        inviteType: "COLLEAGUE",
        colleaguePreset: "EDITOR",
      }),
    ).rejects.toMatchObject({ code: "not_registered", status: 404 });
  });

  it("rejects sharing with the Project creator's own account", async () => {
    registerAuthUser(CREATOR, "creator@example.com");
    await expect(
      shareProjectAccess({
        actorUid: CREATOR,
        workspaceId: WORKSPACE,
        projectId: PROJECT,
        email: "creator@example.com",
        inviteType: "COLLEAGUE",
        colleaguePreset: "EDITOR",
      }),
    ).rejects.toMatchObject({ code: "self_share" });
  });

  it("activates access immediately, atomically updates member + indexes, and never changes role or defaultWorkspaceId", async () => {
    registerAuthUser("colleague-1", "colleague@example.com");
    store.set(`users/colleague-1`, {
      role: "client",
      defaultWorkspaceId: "some-other-ws",
      companyId: "some-other-ws",
      email: "old@example.com",
    });

    const result = await shareProjectAccess({
      actorUid: CREATOR,
      workspaceId: WORKSPACE,
      projectId: PROJECT,
      email: "colleague@example.com",
      inviteType: "COLLEAGUE",
      colleaguePreset: "EDITOR",
    });

    expect(result.ok).toBe(true);
    expect(result.alreadyShared).toBe(false);

    const member = store.get(
      `companies/${WORKSPACE}/projects/${PROJECT}/members/colleague-1`,
    );
    expect(member?.status).toBe("ACTIVE");
    expect(member?.permissionPreset).toBe("EDITOR");
    expect(member?.memberType).toBe("COLLEAGUE");

    const project = store.get(`companies/${WORKSPACE}/projects/${PROJECT}`);
    expect(project?.staffIds).toContain("colleague-1");
    expect(project?.clientUserIds).not.toContain("colleague-1");

    const account = store.get(`users/colleague-1`);
    // Role and defaultWorkspaceId on an existing account are never touched.
    expect(account?.role).toBe("client");
    expect(account?.defaultWorkspaceId).toBe("some-other-ws");
    expect(account?.sharedWorkspaceIds).toContain(WORKSPACE);
    expect(account?.projectIds).toContain(PROJECT);
  });

  it("is idempotent when the member is already ACTIVE", async () => {
    registerAuthUser("colleague-1", "colleague@example.com");
    await shareProjectAccess({
      actorUid: CREATOR,
      workspaceId: WORKSPACE,
      projectId: PROJECT,
      email: "colleague@example.com",
      inviteType: "COLLEAGUE",
      colleaguePreset: "VIEW_ONLY",
    });
    const second = await shareProjectAccess({
      actorUid: CREATOR,
      workspaceId: WORKSPACE,
      projectId: PROJECT,
      email: "colleague@example.com",
      inviteType: "COLLEAGUE",
      colleaguePreset: "EDITOR",
    });
    expect(second.alreadyShared).toBe(true);
    // Preset from the first share is untouched by the duplicate call.
    const member = store.get(
      `companies/${WORKSPACE}/projects/${PROJECT}/members/colleague-1`,
    );
    expect(member?.permissionPreset).toBe("VIEW_ONLY");
  });
});

describe("revokeProjectAccess (Unshare)", () => {
  it("only the Project creator may unshare", async () => {
    registerAuthUser("colleague-1", "colleague@example.com");
    await shareProjectAccess({
      actorUid: CREATOR,
      workspaceId: WORKSPACE,
      projectId: PROJECT,
      email: "colleague@example.com",
      inviteType: "COLLEAGUE",
      colleaguePreset: "EDITOR",
    });
    await expect(
      revokeProjectAccess({
        actorUid: "not-the-creator",
        workspaceId: WORKSPACE,
        projectId: PROJECT,
        uid: "colleague-1",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("marks membership REMOVED and strips every discovery index atomically", async () => {
    registerAuthUser("colleague-1", "colleague@example.com");
    await shareProjectAccess({
      actorUid: CREATOR,
      workspaceId: WORKSPACE,
      projectId: PROJECT,
      email: "colleague@example.com",
      inviteType: "COLLEAGUE",
      colleaguePreset: "EDITOR",
    });

    await revokeProjectAccess({
      actorUid: CREATOR,
      workspaceId: WORKSPACE,
      projectId: PROJECT,
      uid: "colleague-1",
    });

    const member = store.get(
      `companies/${WORKSPACE}/projects/${PROJECT}/members/colleague-1`,
    );
    expect(member?.status).toBe("REMOVED");

    const project = store.get(`companies/${WORKSPACE}/projects/${PROJECT}`);
    expect(project?.staffIds).not.toContain("colleague-1");
    expect(project?.clientUserIds).not.toContain("colleague-1");

    const account = store.get(`users/colleague-1`);
    expect(account?.projectIds).not.toContain(PROJECT);
    expect(account?.sharedWorkspaceIds).not.toContain(WORKSPACE);
  });
});
