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
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

const PROJECT_ID = "siteledger-client-boundary-test";
const COMPANY_ID = "acme3";

let testEnv: RulesTestEnvironment;

const PROJECT_NO_PUBLISH = "p-no-publish";
const PROJECT_ALLOW_PUBLISH = "p-allow-publish";
const OWNERLESS_PROJECT = "p-ownerless";

const CREATOR_UID = "creator-1";
const EDITOR_UID = "editor-1";
const PROGRESS_UID = "progress-1";
const CLIENT_UID = "client-1";
const OTHER_CLIENT_UID = "client-2";

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

async function seedProject(
  id: string,
  overrides: Record<string, unknown> = {},
) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `companies/${COMPANY_ID}/projects/${id}`), {
      workspaceId: COMPANY_ID,
      companyId: COMPANY_ID,
      status: "in_progress",
      createdBy: CREATOR_UID,
      staffIds: [EDITOR_UID, PROGRESS_UID],
      clientUserIds: [CLIENT_UID],
      allowStaffPublish: false,
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    });
  });
}

async function seedMember(
  projectId: string,
  uid: string,
  member: Record<string, unknown>,
) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(
        ctx.firestore(),
        `companies/${COMPANY_ID}/projects/${projectId}/members/${uid}`,
      ),
      { uid, workspaceId: COMPANY_ID, projectId, status: "ACTIVE", ...member },
    );
  });
}

beforeEach(async () => {
  await testEnv.clearFirestore();

  for (const projectId of [PROJECT_NO_PUBLISH, PROJECT_ALLOW_PUBLISH]) {
    await seedProject(projectId, {
      allowStaffPublish: projectId === PROJECT_ALLOW_PUBLISH,
    });
    await seedMember(projectId, EDITOR_UID, {
      memberType: "COLLEAGUE",
      permissionPreset: "EDITOR",
    });
    await seedMember(projectId, PROGRESS_UID, {
      memberType: "COLLEAGUE",
      permissionPreset: "UPDATE_PROGRESS",
    });
    await seedMember(projectId, CLIENT_UID, {
      memberType: "CLIENT",
      permissionPreset: "CLIENT",
    });
  }
});

describe("Protected Project fields — no caller, including the creator, may bypass Admin-SDK routes", () => {
  it("EDITOR cannot change createdBy, workspaceId, staffIds, clientUserIds, or push status into trashed/purging", async () => {
    const db = testEnv.authenticatedContext(EDITOR_UID).firestore();
    const ref = doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_NO_PUBLISH}`);

    await assertFails(updateDoc(ref, { createdBy: EDITOR_UID }));
    await assertFails(updateDoc(ref, { workspaceId: "other-workspace" }));
    await assertFails(updateDoc(ref, { staffIds: [EDITOR_UID, PROGRESS_UID, "new-uid"] }));
    await assertFails(updateDoc(ref, { clientUserIds: [] }));
    await assertFails(updateDoc(ref, { status: "trashed" }));
    // Normal content is still editable.
    await assertSucceeds(updateDoc(ref, { internalNotes: "editor note" }));
  });

  it("the Project creator cannot move staffIds/clientUserIds through the generic update path either", async () => {
    const db = testEnv.authenticatedContext(CREATOR_UID).firestore();
    const ref = doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_NO_PUBLISH}`);

    await assertFails(updateDoc(ref, { staffIds: [] }));
    await assertFails(updateDoc(ref, { clientUserIds: [] }));
    // Creator's normal edits still work.
    await assertSucceeds(updateDoc(ref, { internalNotes: "creator note" }));
  });
});

describe("Ownerless Projects — no company/workspace admin fallback", () => {
  it("a Project with no createdBy grants nobody creator-level authority", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `companies/${COMPANY_ID}/projects/${OWNERLESS_PROJECT}`),
        {
          workspaceId: COMPANY_ID,
          companyId: COMPANY_ID,
          status: "in_progress",
          staffIds: [],
          clientUserIds: [],
        },
      );
    });
    const db = testEnv.authenticatedContext(CREATOR_UID).firestore();
    await assertFails(
      getDoc(doc(db, `companies/${COMPANY_ID}/projects/${OWNERLESS_PROJECT}`)),
    );
    await assertFails(
      updateDoc(doc(db, `companies/${COMPANY_ID}/projects/${OWNERLESS_PROJECT}`), {
        internalNotes: "nope",
      }),
    );
  });
});

describe("Client boundary — Schedule", () => {
  it("Client can only read stages explicitly marked client-visible", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const base = `companies/${COMPANY_ID}/projects/${PROJECT_NO_PUBLISH}/schedule`;
      await setDoc(doc(ctx.firestore(), `${base}/visible`), {
        name: "Framing",
        sortOrder: 0,
        clientVisible: true,
      });
      await setDoc(doc(ctx.firestore(), `${base}/internal`), {
        name: "Internal punch list",
        sortOrder: 1,
        clientVisible: false,
        internalNotes: "do not show client",
      });
    });
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertSucceeds(
      getDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_NO_PUBLISH}/schedule/visible`)),
    );
    await assertFails(
      getDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_NO_PUBLISH}/schedule/internal`)),
    );
    // A client-scoped query (where clientVisible == true) is the only shape
    // that can succeed as a list — see src/lib/services/schedule.ts.
    const scoped = query(
      collection(db, `companies/${COMPANY_ID}/projects/${PROJECT_NO_PUBLISH}/schedule`),
      where("clientVisible", "==", true),
      orderBy("sortOrder", "asc"),
    );
    const snap = await assertSucceeds(getDocs(scoped));
    expect(snap.docs.map((d) => d.id)).toEqual(["visible"]);
  });
});

describe("Client boundary — dailyPlans", () => {
  it("Client can read visible + legacy-unset plans; explicitly false stays private", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const base = `companies/${COMPANY_ID}/projects/${PROJECT_NO_PUBLISH}/dailyPlans`;
      await setDoc(doc(ctx.firestore(), `${base}/visible`), {
        date: "2026-08-08",
        items: [{ workText: "Visible work" }],
        clientVisible: true,
      });
      await setDoc(doc(ctx.firestore(), `${base}/internal`), {
        date: "2026-08-09",
        items: [{ workText: "Internal work" }],
        clientVisible: false,
      });
      await setDoc(doc(ctx.firestore(), `${base}/legacy-unset`), {
        date: "2026-08-10",
        items: [{ workText: "Legacy shared work" }],
      });
    });
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertSucceeds(
      getDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_NO_PUBLISH}/dailyPlans/visible`)),
    );
    await assertFails(
      getDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_NO_PUBLISH}/dailyPlans/internal`)),
    );
    await assertSucceeds(
      getDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_NO_PUBLISH}/dailyPlans/legacy-unset`)),
    );
  });
});

describe("Client boundary — Journal (updates)", () => {
  it("Client can only read client_visible Journal entries", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const base = `companies/${COMPANY_ID}/projects/${PROJECT_NO_PUBLISH}/updates`;
      await setDoc(doc(ctx.firestore(), `${base}/visible`), {
        note: "Client update",
        visibility: "client_visible",
        createdBy: CREATOR_UID,
      });
      await setDoc(doc(ctx.firestore(), `${base}/internal`), {
        note: "Internal only",
        visibility: "internal",
        createdBy: CREATOR_UID,
      });
    });
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertSucceeds(
      getDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_NO_PUBLISH}/updates/visible`)),
    );
    await assertFails(
      getDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_NO_PUBLISH}/updates/internal`)),
    );
  });

  it("an outsider Client (not assigned to this Project) can never read either entry", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(
          ctx.firestore(),
          `companies/${COMPANY_ID}/projects/${PROJECT_NO_PUBLISH}/updates/visible`,
        ),
        { note: "Client update", visibility: "client_visible", createdBy: CREATOR_UID },
      );
    });
    const db = testEnv.authenticatedContext(OTHER_CLIENT_UID).firestore();
    await assertFails(
      getDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_NO_PUBLISH}/updates/visible`)),
    );
  });
});

describe("publishMediaToClient gate — never a bare uploadMedia/addJournal grant", () => {
  it("UPDATE_PROGRESS cannot create a client_visible Journal entry even though it can addJournal", async () => {
    const db = testEnv.authenticatedContext(PROGRESS_UID).firestore();
    await assertFails(
      setDoc(
        doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_ALLOW_PUBLISH}/updates/attempt`),
        { note: "sneaky", visibility: "client_visible", createdBy: PROGRESS_UID },
      ),
    );
    // Internal/pending_approval visibility still works for the same colleague.
    await assertSucceeds(
      setDoc(
        doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_ALLOW_PUBLISH}/updates/attempt-internal`),
        { note: "ok", visibility: "internal", createdBy: PROGRESS_UID },
      ),
    );
  });

  it("UPDATE_PROGRESS cannot upload a clientVisible Media item even though it can uploadMedia", async () => {
    const db = testEnv.authenticatedContext(PROGRESS_UID).firestore();
    await assertFails(
      setDoc(
        doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_ALLOW_PUBLISH}/media/attempt`),
        { mediaLifecycle: "active", uploadedBy: PROGRESS_UID, clientVisible: true },
      ),
    );
    await assertSucceeds(
      setDoc(
        doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_ALLOW_PUBLISH}/media/attempt-internal`),
        { mediaLifecycle: "active", uploadedBy: PROGRESS_UID, clientVisible: false },
      ),
    );
  });

  it("EDITOR cannot publish to client when the Project itself disallows staff publish", async () => {
    const db = testEnv.authenticatedContext(EDITOR_UID).firestore();
    await assertFails(
      setDoc(
        doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_NO_PUBLISH}/media/attempt`),
        { mediaLifecycle: "active", uploadedBy: EDITOR_UID, clientVisible: true },
      ),
    );
  });

  it("EDITOR can publish to client once the Project allows staff publish", async () => {
    const db = testEnv.authenticatedContext(EDITOR_UID).firestore();
    await assertSucceeds(
      setDoc(
        doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_ALLOW_PUBLISH}/media/attempt`),
        { mediaLifecycle: "active", uploadedBy: EDITOR_UID, clientVisible: true },
      ),
    );
  });

  it("UPDATE_PROGRESS cannot later flip their own Media to clientVisible via update", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `companies/${COMPANY_ID}/projects/${PROJECT_ALLOW_PUBLISH}/media/own`),
        { mediaLifecycle: "active", uploadedBy: PROGRESS_UID, clientVisible: false },
      );
    });
    const db = testEnv.authenticatedContext(PROGRESS_UID).firestore();
    await assertFails(
      updateDoc(
        doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_ALLOW_PUBLISH}/media/own`),
        { clientVisible: true },
      ),
    );
    // Editing a caption on their own, still-internal Media stays allowed.
    await assertSucceeds(
      updateDoc(
        doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_ALLOW_PUBLISH}/media/own`),
        { caption: "updated caption" },
      ),
    );
  });
});

describe("Purchases — Client OWNER-read only", () => {
  it("Client cannot create either OWNER or STUDIO Purchases", async () => {
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(
      setDoc(
        doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_NO_PUBLISH}/purchases/owner-item`),
        { purchaseResponsibility: "OWNER", projectId: PROJECT_NO_PUBLISH },
      ),
    );
    await assertFails(
      setDoc(
        doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_NO_PUBLISH}/purchases/studio-item`),
        { purchaseResponsibility: "STUDIO", projectId: PROJECT_NO_PUBLISH },
      ),
    );
  });

  it("Client reads only OWNER Purchases and cannot update or delete them", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const base = `companies/${COMPANY_ID}/projects/${PROJECT_NO_PUBLISH}/purchases`;
      await setDoc(doc(ctx.firestore(), `${base}/owner`), {
        projectId: PROJECT_NO_PUBLISH,
        purchaseResponsibility: "OWNER",
        photos: [],
      });
      await setDoc(doc(ctx.firestore(), `${base}/studio`), {
        projectId: PROJECT_NO_PUBLISH,
        purchaseResponsibility: "STUDIO",
        photos: [],
      });
    });
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    const base = `companies/${COMPANY_ID}/projects/${PROJECT_NO_PUBLISH}/purchases`;
    await assertSucceeds(getDoc(doc(db, `${base}/owner`)));
    await assertFails(getDoc(doc(db, `${base}/studio`)));
    await assertFails(
      updateDoc(doc(db, `${base}/owner`), {
        photos: [{ id: "photo-1" }],
        updatedBy: CLIENT_UID,
      }),
    );
    await assertFails(
      updateDoc(doc(db, `${base}/owner`), { quantity: 99 }),
    );
    await assertFails(deleteDoc(doc(db, `${base}/owner`)));
  });

  it("VIEW_ONLY/UPDATE_PROGRESS colleagues without editPurchases cannot create any Purchase", async () => {
    const db = testEnv.authenticatedContext(PROGRESS_UID).firestore();
    await assertFails(
      setDoc(
        doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_NO_PUBLISH}/purchases/attempt`),
        { purchaseResponsibility: "STUDIO", projectId: PROJECT_NO_PUBLISH },
      ),
    );
  });

  it("CLIENT cannot read private purchase cost even for OWNER-responsibility items", async () => {
    const costPath = `companies/${COMPANY_ID}/projects/${PROJECT_NO_PUBLISH}/purchases/owner/private/cost`;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const base = `companies/${COMPANY_ID}/projects/${PROJECT_NO_PUBLISH}/purchases`;
      await setDoc(doc(ctx.firestore(), `${base}/owner`), {
        projectId: PROJECT_NO_PUBLISH,
        purchaseResponsibility: "OWNER",
        photos: [],
      });
      await setDoc(doc(ctx.firestore(), costPath), {
        unitCost: 50,
        totalCost: 100,
        updatedBy: CREATOR_UID,
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
    });
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertSucceeds(
      getDoc(
        doc(
          db,
          `companies/${COMPANY_ID}/projects/${PROJECT_NO_PUBLISH}/purchases/owner`,
        ),
      ),
    );
    await assertFails(getDoc(doc(db, costPath)));
  });
});
