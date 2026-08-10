import { readFileSync } from "fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import {
  deleteObject,
  getBytes,
  ref,
  uploadBytes,
} from "firebase/storage";

// Storage Rules cross-service firestore.get/exists calls resolve against the
// Firebase CLI emulator project, so this must match .firebaserc.
const PROJECT_ID = "siteledger-52e17";
const WORKSPACE = "storage-ws";
const PROJECT = "storage-project";
const CREATOR = "creator";
const VIEW_ONLY = "viewer";
const PROGRESS = "progress";
const EDITOR = "editor";
const CLIENT = "client";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
    storage: {
      rules: readFileSync("storage.rules", "utf8"),
      host: "127.0.0.1",
      port: 9199,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

async function seedMember(
  uid: string,
  permissionPreset: string,
  memberType = "COLLEAGUE",
) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(
        ctx.firestore(),
        `companies/${WORKSPACE}/projects/${PROJECT}/members/${uid}`,
      ),
      {
        uid,
        status: "ACTIVE",
        memberType,
        permissionPreset,
      },
    );
  });
}

function fullMediaMeta(
  uid: string,
  opts: { clientVisible?: string; mediaId?: string } = {},
) {
  return {
    mediaId: opts.mediaId || `media-${uid}`,
    clientVisible: opts.clientVisible ?? "false",
    uploadedBy: uid,
    projectId: PROJECT,
    workspaceId: WORKSPACE,
  };
}

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), `companies/${WORKSPACE}/projects/${PROJECT}`),
      {
        workspaceId: WORKSPACE,
        companyId: WORKSPACE,
        createdBy: CREATOR,
        status: "in_progress",
        allowStaffPublish: true,
        staffIds: [VIEW_ONLY, PROGRESS, EDITOR],
        clientUserIds: [CLIENT],
      },
    );
  });
  await seedMember(VIEW_ONLY, "VIEW_ONLY");
  await seedMember(PROGRESS, "UPDATE_PROGRESS");
  await seedMember(EDITOR, "EDITOR");
  await seedMember(CLIENT, "CLIENT", "CLIENT");
});

const mediaPath = (name: string, kind = "photos") =>
  `companies/${WORKSPACE}/projects/${PROJECT}/updates/2026-08-07/${kind}/${name}`;

async function seedObject(
  path: string,
  metadata: Record<string, string>,
) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), path), new Uint8Array([1, 2, 3]), {
      contentType: "image/jpeg",
      customMetadata: metadata,
    });
  });
}

describe("Storage Media permissions", () => {
  it("REMOVED membership loses Storage access immediately", async () => {
    await seedObject(mediaPath("visible.jpg"), fullMediaMeta(CREATOR, {
      clientVisible: "true",
    }));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(
          ctx.firestore(),
          `companies/${WORKSPACE}/projects/${PROJECT}/members/${CLIENT}`,
        ),
        { uid: CLIENT, status: "REMOVED", memberType: "CLIENT" },
      );
    });
    const storage = testEnv.authenticatedContext(CLIENT).storage();
    await assertFails(getBytes(ref(storage, mediaPath("visible.jpg"))));
  });

  it("Client without clientUserIds array membership cannot read even with ACTIVE member", async () => {
    await seedObject(mediaPath("visible.jpg"), fullMediaMeta(CREATOR, {
      clientVisible: "true",
    }));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `companies/${WORKSPACE}/projects/${PROJECT}`),
        {
          workspaceId: WORKSPACE,
          companyId: WORKSPACE,
          createdBy: CREATOR,
          status: "in_progress",
          allowStaffPublish: true,
          staffIds: [VIEW_ONLY, PROGRESS, EDITOR],
          clientUserIds: [],
        },
      );
    });
    const storage = testEnv.authenticatedContext(CLIENT).storage();
    await assertFails(getBytes(ref(storage, mediaPath("visible.jpg"))));
  });

  it("Client reads marked clientVisible Media and legacy photos/handover without metadata", async () => {
    await seedObject(mediaPath("visible.jpg"), fullMediaMeta(CREATOR, {
      clientVisible: "true",
    }));
    await seedObject(mediaPath("internal.jpg"), fullMediaMeta(CREATOR, {
      clientVisible: "false",
    }));
    await seedObject(mediaPath("legacy.jpg"), { uploadedBy: CREATOR });
    await seedObject(mediaPath("legacy-internal.jpg", "internal"), {
      uploadedBy: CREATOR,
    });
    const storage = testEnv.authenticatedContext(CLIENT).storage();
    await assertSucceeds(getBytes(ref(storage, mediaPath("visible.jpg"))));
    await assertFails(getBytes(ref(storage, mediaPath("internal.jpg"))));
    await assertSucceeds(getBytes(ref(storage, mediaPath("legacy.jpg"))));
    await assertFails(
      getBytes(ref(storage, mediaPath("legacy-internal.jpg", "internal"))),
    );
  });

  it("VIEW_ONLY may read but never upload or delete", async () => {
    await seedObject(mediaPath("owner.jpg"), fullMediaMeta(CREATOR));
    const storage = testEnv.authenticatedContext(VIEW_ONLY).storage();
    await assertSucceeds(getBytes(ref(storage, mediaPath("owner.jpg"))));
    await assertFails(
      uploadBytes(ref(storage, mediaPath("attempt.jpg")), new Uint8Array([1]), {
        contentType: "image/jpeg",
        customMetadata: fullMediaMeta(VIEW_ONLY),
      }),
    );
    await assertFails(deleteObject(ref(storage, mediaPath("owner.jpg"))));
  });

  it("UPDATE_PROGRESS uploads/deletes only own Media and cannot publish it to Client", async () => {
    await seedObject(mediaPath("other.jpg"), fullMediaMeta(CREATOR));
    const storage = testEnv.authenticatedContext(PROGRESS).storage();
    await assertSucceeds(
      uploadBytes(ref(storage, mediaPath("own.jpg")), new Uint8Array([1]), {
        contentType: "image/jpeg",
        customMetadata: fullMediaMeta(PROGRESS, { mediaId: "own-1" }),
      }),
    );
    await assertFails(
      uploadBytes(
        ref(storage, mediaPath("client.jpg")),
        new Uint8Array([1]),
        {
          contentType: "image/jpeg",
          customMetadata: fullMediaMeta(PROGRESS, {
            mediaId: "client-1",
            clientVisible: "true",
          }),
        },
      ),
    );
    await assertSucceeds(
      uploadBytes(ref(storage, mediaPath("own.jpg")), new Uint8Array([2]), {
        contentType: "image/jpeg",
        customMetadata: fullMediaMeta(PROGRESS, { mediaId: "own-1" }),
      }),
    );
    await assertFails(
      uploadBytes(ref(storage, mediaPath("other.jpg")), new Uint8Array([2]), {
        contentType: "image/jpeg",
        customMetadata: fullMediaMeta(CREATOR),
      }),
    );
    await assertSucceeds(deleteObject(ref(storage, mediaPath("own.jpg"))));
    await assertFails(deleteObject(ref(storage, mediaPath("other.jpg"))));
  });

  it("new Media uploads require full customMetadata keys", async () => {
    const storage = testEnv.authenticatedContext(EDITOR).storage();
    await assertFails(
      uploadBytes(ref(storage, mediaPath("incomplete.jpg")), new Uint8Array([1]), {
        contentType: "image/jpeg",
        customMetadata: {
          uploadedBy: EDITOR,
          clientVisible: "false",
        },
      }),
    );
    await assertSucceeds(
      uploadBytes(ref(storage, mediaPath("complete.jpg")), new Uint8Array([1]), {
        contentType: "image/jpeg",
        customMetadata: fullMediaMeta(EDITOR, { mediaId: "complete-1" }),
      }),
    );
  });

  it("EDITOR may upload client-visible Media and delete another user's Media", async () => {
    await seedObject(mediaPath("other.jpg"), fullMediaMeta(CREATOR));
    const storage = testEnv.authenticatedContext(EDITOR).storage();
    await assertSucceeds(
      uploadBytes(
        ref(storage, mediaPath("client-visible.jpg")),
        new Uint8Array([1]),
        {
          contentType: "image/jpeg",
          customMetadata: fullMediaMeta(EDITOR, {
            mediaId: "cv-1",
            clientVisible: "true",
          }),
        },
      ),
    );
    await assertSucceeds(deleteObject(ref(storage, mediaPath("other.jpg"))));
  });
});

describe("Storage Purchase photo permissions", () => {
  const purchasePhotoPath = (purchaseId: string, name: string) =>
    `companies/${WORKSPACE}/projects/${PROJECT}/purchases/${purchaseId}/photos/${name}`;

  it("Client may read all Purchase photos but never upload or delete", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const base = `companies/${WORKSPACE}/projects/${PROJECT}/purchases`;
      await setDoc(doc(ctx.firestore(), `${base}/owner`), {
        purchaseResponsibility: "OWNER",
      });
      await setDoc(doc(ctx.firestore(), `${base}/studio`), {
        purchaseResponsibility: "STUDIO",
      });
    });
    await seedObject(purchasePhotoPath("owner", "photo.jpg"), {
      uploadedBy: CREATOR,
      purchaseId: "owner",
      projectId: PROJECT,
      workspaceId: WORKSPACE,
    });
    await seedObject(purchasePhotoPath("studio", "photo.jpg"), {
      uploadedBy: CREATOR,
      purchaseId: "studio",
      projectId: PROJECT,
      workspaceId: WORKSPACE,
    });

    const storage = testEnv.authenticatedContext(CLIENT).storage();
    await assertSucceeds(
      getBytes(ref(storage, purchasePhotoPath("owner", "photo.jpg"))),
    );
    await assertSucceeds(
      getBytes(ref(storage, purchasePhotoPath("studio", "photo.jpg"))),
    );
    await assertFails(
      uploadBytes(
        ref(storage, purchasePhotoPath("owner", "client.jpg")),
        new Uint8Array([1]),
        {
          contentType: "image/jpeg",
          customMetadata: {
            uploadedBy: CLIENT,
            purchaseId: "owner",
            projectId: PROJECT,
            workspaceId: WORKSPACE,
          },
        },
      ),
    );
    await assertFails(
      deleteObject(ref(storage, purchasePhotoPath("owner", "photo.jpg"))),
    );
  });

  it("VIEW_ONLY may read Purchase photos; EDITOR may upload", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(
          ctx.firestore(),
          `companies/${WORKSPACE}/projects/${PROJECT}/purchases/owner`,
        ),
        { purchaseResponsibility: "OWNER" },
      );
    });
    await seedObject(purchasePhotoPath("owner", "photo.jpg"), {
      uploadedBy: CREATOR,
      purchaseId: "owner",
    });
    const viewer = testEnv.authenticatedContext(VIEW_ONLY).storage();
    await assertSucceeds(
      getBytes(ref(viewer, purchasePhotoPath("owner", "photo.jpg"))),
    );
    await assertFails(
      uploadBytes(
        ref(viewer, purchasePhotoPath("owner", "nope.jpg")),
        new Uint8Array([1]),
        {
          contentType: "image/jpeg",
          customMetadata: { uploadedBy: VIEW_ONLY, purchaseId: "owner" },
        },
      ),
    );

    const editor = testEnv.authenticatedContext(EDITOR).storage();
    await assertSucceeds(
      uploadBytes(
        ref(editor, purchasePhotoPath("owner", "edit.jpg")),
        new Uint8Array([1]),
        {
          contentType: "image/jpeg",
          customMetadata: {
            uploadedBy: EDITOR,
            purchaseId: "owner",
            projectId: PROJECT,
            workspaceId: WORKSPACE,
          },
        },
      ),
    );
  });
});
