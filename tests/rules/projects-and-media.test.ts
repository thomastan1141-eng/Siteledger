import { readFileSync } from "fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  where,
} from "firebase/firestore";

const PROJECT_ID = "siteledger-rules-test";
const COMPANY_ID = "acme";

let testEnv: RulesTestEnvironment;

const PROJECT_A = "p-assigned";
const PROJECT_B = "p-other";
const TRASHED_PROJECT = "p-trashed";
const ADMIN_UID = "admin-1";
const STAFF_UID = "staff-1";
const OTHER_STAFF_UID = "staff-2";
const CLIENT_UID = "client-1";
const OTHER_UID = "other-1";

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `companies/${COMPANY_ID}/users/${ADMIN_UID}`), {
      role: "admin",
      active: true,
      companyId: COMPANY_ID,
    });
    await setDoc(doc(db, `companies/${COMPANY_ID}/users/${STAFF_UID}`), {
      role: "staff",
      active: true,
      companyId: COMPANY_ID,
    });
    await setDoc(doc(db, `companies/${COMPANY_ID}/users/${OTHER_STAFF_UID}`), {
      role: "staff",
      active: true,
      companyId: COMPANY_ID,
    });
    await setDoc(doc(db, `companies/${COMPANY_ID}/users/${CLIENT_UID}`), {
      role: "client",
      active: true,
      companyId: COMPANY_ID,
    });

    await setDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}`), {
      workspaceId: COMPANY_ID,
      companyId: COMPANY_ID,
      status: "in_progress",
      createdBy: ADMIN_UID,
      staffIds: [STAFF_UID],
      clientUserIds: [CLIENT_UID],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await setDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_B}`), {
      workspaceId: COMPANY_ID,
      companyId: COMPANY_ID,
      status: "in_progress",
      createdBy: ADMIN_UID,
      staffIds: [],
      clientUserIds: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await setDoc(doc(db, `companies/${COMPANY_ID}/projects/${TRASHED_PROJECT}`), {
      workspaceId: COMPANY_ID,
      companyId: COMPANY_ID,
      status: "trashed",
      createdBy: ADMIN_UID,
      staffIds: [STAFF_UID],
      clientUserIds: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    await setDoc(
      doc(
        db,
        `companies/${COMPANY_ID}/projects/${PROJECT_A}/members/${STAFF_UID}`,
      ),
      {
        uid: STAFF_UID,
        workspaceId: COMPANY_ID,
        projectId: PROJECT_A,
        memberType: "COLLEAGUE",
        permissionPreset: "VIEW_ONLY",
        status: "ACTIVE",
        permissions: {
          viewProject: true,
          viewSchedule: true,
          viewJournal: true,
          viewMedia: true,
          downloadMedia: true,
          viewPurchases: true,
        },
      },
    );
    await setDoc(
      doc(
        db,
        `companies/${COMPANY_ID}/projects/${PROJECT_A}/members/${CLIENT_UID}`,
      ),
      {
        uid: CLIENT_UID,
        workspaceId: COMPANY_ID,
        projectId: PROJECT_A,
        memberType: "CLIENT",
        permissionPreset: "CLIENT",
        status: "ACTIVE",
      },
    );

    const mediaBase = `companies/${COMPANY_ID}/projects/${PROJECT_A}/media`;
    await setDoc(doc(db, `${mediaBase}/m-active-client-visible`), {
      mediaLifecycle: "active",
      clientVisible: true,
      visibility: "client_visible",
      createdAt: "2026-01-03T00:00:00.000Z",
    });
    await setDoc(doc(db, `${mediaBase}/m-active-internal`), {
      mediaLifecycle: "active",
      clientVisible: false,
      visibility: "internal",
      createdAt: "2026-01-02T00:00:00.000Z",
    });
    await setDoc(doc(db, `${mediaBase}/m-tombstoned`), {
      mediaLifecycle: "tombstoned",
      status: "DELETED",
      clientVisible: false,
      visibility: "internal",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });
});

describe("projects list and get assignment boundaries", () => {
  it("admin can list workspace projects by workspaceId+status", async () => {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    const q = query(
      collection(db, `companies/${COMPANY_ID}/projects`),
      where("workspaceId", "==", COMPANY_ID),
      where("status", "in", ["in_progress", "upcoming", "completed", "on_hold"]),
    );
    const snap = await assertSucceeds(getDocs(q));
    const ids = snap.docs.map((d) => d.id);
    expect(ids).toContain(PROJECT_A);
    expect(ids).toContain(PROJECT_B);
    expect(ids).not.toContain(TRASHED_PROJECT);
  });

  it("assigned colleague can list only staffIds-matching projects", async () => {
    const db = testEnv.authenticatedContext(STAFF_UID).firestore();
    const q = query(
      collection(db, `companies/${COMPANY_ID}/projects`),
      where("staffIds", "array-contains", STAFF_UID),
      where("status", "in", ["in_progress", "upcoming", "completed", "on_hold"]),
    );
    const snap = await assertSucceeds(getDocs(q));
    expect(snap.docs.map((d) => d.id)).toEqual([PROJECT_A]);
  });

  it("assigned colleague can get assigned project and cannot get another", async () => {
    const db = testEnv.authenticatedContext(STAFF_UID).firestore();
    await assertSucceeds(
      getDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}`)),
    );
    await assertFails(
      getDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_B}`)),
    );
  });

  it("unassigned staff in same workspace cannot get either project", async () => {
    const db = testEnv.authenticatedContext(OTHER_STAFF_UID).firestore();
    await assertFails(
      getDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}`)),
    );
    await assertFails(
      getDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_B}`)),
    );
  });

  it("client can get assigned project only", async () => {
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertSucceeds(
      getDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}`)),
    );
    await assertFails(
      getDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_B}`)),
    );
  });

  it("creator can list their own trashed projects", async () => {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    const q = query(
      collection(db, `companies/${COMPANY_ID}/projects`),
      where("status", "==", "trashed"),
      where("createdBy", "==", ADMIN_UID),
    );
    const snap = await assertSucceeds(getDocs(q));
    expect(snap.docs.map((d) => d.id)).toEqual([TRASHED_PROJECT]);
  });

  it("a non-creator cannot list another user's trashed projects", async () => {
    const db = testEnv.authenticatedContext(OTHER_UID).firestore();
    const q = query(
      collection(db, `companies/${COMPANY_ID}/projects`),
      where("status", "==", "trashed"),
      where("createdBy", "==", ADMIN_UID),
    );
    await assertFails(getDocs(q));
  });

  it("removed colleague loses project read immediately", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(
        doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}`),
        {
          workspaceId: COMPANY_ID,
          companyId: COMPANY_ID,
          status: "in_progress",
          createdBy: ADMIN_UID,
          staffIds: [],
          clientUserIds: [CLIENT_UID],
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        { merge: true },
      );
      await setDoc(
        doc(
          db,
          `companies/${COMPANY_ID}/projects/${PROJECT_A}/members/${STAFF_UID}`,
        ),
        { status: "REMOVED" },
        { merge: true },
      );
    });

    const db = testEnv.authenticatedContext(STAFF_UID).firestore();
    await assertFails(
      getDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}`)),
    );
  });

  it("stale staffIds without ACTIVE member is denied", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(
        doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}`),
        {
          workspaceId: COMPANY_ID,
          companyId: COMPANY_ID,
          status: "in_progress",
          createdBy: ADMIN_UID,
          staffIds: [STAFF_UID],
          clientUserIds: [CLIENT_UID],
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        { merge: true },
      );
      await setDoc(
        doc(
          db,
          `companies/${COMPANY_ID}/projects/${PROJECT_A}/members/${STAFF_UID}`,
        ),
        { status: "REMOVED" },
        { merge: true },
      );
    });

    const db = testEnv.authenticatedContext(STAFF_UID).firestore();
    await assertFails(
      getDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}`)),
    );
  });

  it("stale clientUserIds without ACTIVE member is denied", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(
        doc(
          db,
          `companies/${COMPANY_ID}/projects/${PROJECT_A}/members/${CLIENT_UID}`,
        ),
        { status: "REMOVED" },
        { merge: true },
      );
    });

    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(
      getDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}`)),
    );
  });
});

describe("media list queries", () => {
  it("assigned staff can list active media and never sees tombstones", async () => {
    const db = testEnv.authenticatedContext(STAFF_UID).firestore();
    const q = query(
      collection(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}/media`),
      where("mediaLifecycle", "==", "active"),
      orderBy("createdAt", "desc"),
    );
    const snap = await assertSucceeds(getDocs(q));
    const ids = snap.docs.map((d) => d.id);
    expect(ids).toEqual(
      expect.arrayContaining(["m-active-client-visible", "m-active-internal"]),
    );
    expect(ids).not.toContain("m-tombstoned");
  });

  it("unassigned staff cannot list media on another project", async () => {
    const db = testEnv.authenticatedContext(OTHER_STAFF_UID).firestore();
    const q = query(
      collection(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}/media`),
      where("mediaLifecycle", "==", "active"),
      orderBy("createdAt", "desc"),
    );
    await assertFails(getDocs(q));
  });

  it("client can list only clientVisible+active media", async () => {
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    const q = query(
      collection(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}/media`),
      where("clientVisible", "==", true),
      where("mediaLifecycle", "==", "active"),
      orderBy("createdAt", "desc"),
    );
    const snap = await assertSucceeds(getDocs(q));
    expect(snap.docs.map((d) => d.id)).toEqual(["m-active-client-visible"]);
  });

  it("client cannot getDoc internal media", async () => {
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(
      getDoc(
        doc(
          db,
          `companies/${COMPANY_ID}/projects/${PROJECT_A}/media/m-active-internal`,
        ),
      ),
    );
  });

  it("staff cannot getDoc a tombstoned media item directly", async () => {
    const db = testEnv.authenticatedContext(STAFF_UID).firestore();
    await assertFails(
      getDoc(
        doc(
          db,
          `companies/${COMPANY_ID}/projects/${PROJECT_A}/media/m-tombstoned`,
        ),
      ),
    );
  });

  it("client cannot getDoc a tombstoned media item directly", async () => {
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(
      getDoc(
        doc(
          db,
          `companies/${COMPANY_ID}/projects/${PROJECT_A}/media/m-tombstoned`,
        ),
      ),
    );
  });

  it("staff cannot getDoc tombstoned media and active lists exclude them", async () => {
    const db = testEnv.authenticatedContext(STAFF_UID).firestore();
    await assertFails(
      getDoc(
        doc(
          db,
          `companies/${COMPANY_ID}/projects/${PROJECT_A}/media/m-tombstoned`,
        ),
      ),
    );
    const q = query(
      collection(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}/media`),
      where("mediaLifecycle", "==", "active"),
      orderBy("createdAt", "desc"),
    );
    const snap = await assertSucceeds(getDocs(q));
    expect(snap.docs.map((d) => d.id)).not.toContain("m-tombstoned");
  });
});
