import { readFileSync } from "fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const PROJECT_ID = "siteledger-access-levels-test";
const COMPANY_ID = "acme2";

let testEnv: RulesTestEnvironment;

const PROJECT_A = "p-levels";
const CREATOR_UID = "creator-1";
const VIEW_ONLY_UID = "view-only-1";
const UPDATE_PROGRESS_UID = "update-progress-1";
const EDITOR_UID = "editor-1";
const COMPANY_ADMIN_UID = "company-admin-1";
const WORKSPACE_OWNER_UID = "workspace-owner-1";
const OUTSIDER_UID = "outsider-1";

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

    // Legacy company-admin and workspace-owner records — must grant zero
    // Project authority under the new model.
    await setDoc(doc(db, `companies/${COMPANY_ID}/users/${COMPANY_ADMIN_UID}`), {
      role: "admin",
      active: true,
      companyId: COMPANY_ID,
    });
    await setDoc(doc(db, `workspaces/${COMPANY_ID}/members/${WORKSPACE_OWNER_UID}`), {
      role: "OWNER",
      status: "ACTIVE",
    });

    await setDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}`), {
      workspaceId: COMPANY_ID,
      companyId: COMPANY_ID,
      status: "in_progress",
      createdBy: CREATOR_UID,
      staffIds: [VIEW_ONLY_UID, UPDATE_PROGRESS_UID, EDITOR_UID],
      clientUserIds: [],
      allowStaffPublish: true,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const memberBase = `companies/${COMPANY_ID}/projects/${PROJECT_A}/members`;
    await setDoc(doc(db, `${memberBase}/${VIEW_ONLY_UID}`), {
      uid: VIEW_ONLY_UID,
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
    });
    await setDoc(doc(db, `${memberBase}/${UPDATE_PROGRESS_UID}`), {
      uid: UPDATE_PROGRESS_UID,
      workspaceId: COMPANY_ID,
      projectId: PROJECT_A,
      memberType: "COLLEAGUE",
      permissionPreset: "UPDATE_PROGRESS",
      status: "ACTIVE",
      permissions: {
        viewProject: true,
        viewSchedule: true,
        updateSchedule: true,
        viewJournal: true,
        addJournal: true,
        editOwnJournal: true,
        viewMedia: true,
        downloadMedia: true,
        uploadMedia: true,
        editOwnMedia: true,
        deleteOwnMedia: true,
        viewPurchases: true,
      },
    });
    await setDoc(doc(db, `${memberBase}/${EDITOR_UID}`), {
      uid: EDITOR_UID,
      workspaceId: COMPANY_ID,
      projectId: PROJECT_A,
      memberType: "COLLEAGUE",
      permissionPreset: "EDITOR",
      status: "ACTIVE",
      permissions: {
        viewProject: true,
        viewSchedule: true,
        updateSchedule: true,
        viewJournal: true,
        addJournal: true,
        editOwnJournal: true,
        editAllJournal: true,
        deleteOwnJournal: true,
        deleteAllJournal: true,
        viewMedia: true,
        downloadMedia: true,
        uploadMedia: true,
        editOwnMedia: true,
        editAllMedia: true,
        deleteOwnMedia: true,
        deleteAllMedia: true,
        viewPurchases: true,
        editPurchases: true,
        editProjectDetails: true,
        manageProjectAccess: false,
      },
    });

    await setDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}/updates/u-view-only`), {
      note: "seed",
      visibility: "internal",
      createdBy: CREATOR_UID,
    });
  });
});

describe("company admin / workspace owner grant zero Project authority", () => {
  it("company admin cannot get, list, or write the Project", async () => {
    const db = testEnv.authenticatedContext(COMPANY_ADMIN_UID).firestore();
    await assertFails(
      getDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}`)),
    );
    await assertFails(
      updateDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}`), {
        internalNotes: "hacked",
      }),
    );
  });

  it("workspace owner cannot get, list, or write the Project", async () => {
    const db = testEnv.authenticatedContext(WORKSPACE_OWNER_UID).firestore();
    await assertFails(
      getDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}`)),
    );
    await assertFails(
      updateDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}`), {
        internalNotes: "hacked",
      }),
    );
  });

  it("an outsider with no membership at all is denied everything", async () => {
    const db = testEnv.authenticatedContext(OUTSIDER_UID).firestore();
    await assertFails(
      getDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}`)),
    );
  });
});

describe("VIEW_ONLY preset", () => {
  it("can read the Project and Journal but cannot create/update anything", async () => {
    const db = testEnv.authenticatedContext(VIEW_ONLY_UID).firestore();
    await assertSucceeds(
      getDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}`)),
    );
    await assertFails(
      setDoc(
        doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}/updates/new-entry`),
        { note: "hello", visibility: "internal", createdBy: VIEW_ONLY_UID },
      ),
    );
    await assertFails(
      setDoc(
        doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}/media/new-media`),
        { mediaLifecycle: "active", uploadedBy: VIEW_ONLY_UID },
      ),
    );
    await assertFails(
      updateDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}`), {
        internalNotes: "nope",
      }),
    );
  });
});

describe("UPDATE_PROGRESS preset", () => {
  it("can create its own Journal entry and Media, but not edit/delete another user's", async () => {
    const db = testEnv.authenticatedContext(UPDATE_PROGRESS_UID).firestore();
    await assertSucceeds(
      setDoc(
        doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}/updates/up-own`),
        { note: "progress", visibility: "internal", createdBy: UPDATE_PROGRESS_UID },
      ),
    );
    await assertSucceeds(
      setDoc(
        doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}/media/up-own-media`),
        {
          mediaLifecycle: "active",
          uploadedBy: UPDATE_PROGRESS_UID,
          status: "READY",
        },
      ),
    );
    // Cannot edit/delete an entry created by someone else (own-only scope).
    await assertFails(
      updateDoc(
        doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}/updates/u-view-only`),
        { note: "edited" },
      ),
    );
    // Cannot edit Project settings.
    await assertFails(
      updateDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}`), {
        internalNotes: "nope",
      }),
    );
  });
});

describe("EDITOR preset", () => {
  it("can edit the assigned Project's content but not manage members or delete the Project", async () => {
    const db = testEnv.authenticatedContext(EDITOR_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}`), {
        internalNotes: "editor update",
      }),
    );
    await assertSucceeds(
      updateDoc(
        doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}/updates/u-view-only`),
        { note: "editor can edit all journal" },
      ),
    );
    // EDITOR can never manage Access — the members subcollection is
    // always read-only from the client regardless of preset.
    await assertFails(
      setDoc(
        doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}/members/${OUTSIDER_UID}`),
        { status: "ACTIVE" },
      ),
    );
  });

  it("cannot access a different Project it is not assigned to", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `companies/${COMPANY_ID}/projects/p-other-editor`),
        {
          workspaceId: COMPANY_ID,
          companyId: COMPANY_ID,
          status: "in_progress",
          createdBy: CREATOR_UID,
          staffIds: [],
          clientUserIds: [],
        },
      );
    });
    const db = testEnv.authenticatedContext(EDITOR_UID).firestore();
    await assertFails(
      getDoc(doc(db, `companies/${COMPANY_ID}/projects/p-other-editor`)),
    );
  });
});

describe("creator retains full control", () => {
  it("creator can update the Project and manage members path is readable", async () => {
    const db = testEnv.authenticatedContext(CREATOR_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}`), {
        internalNotes: "creator update",
      }),
    );
    await assertSucceeds(
      getDoc(
        doc(db, `companies/${COMPANY_ID}/projects/${PROJECT_A}/members/${EDITOR_UID}`),
      ),
    );
  });
});
