import { describe, expect, it } from "vitest";
import {
  canManagePurchase,
  canManagePurchasePhotos,
  canViewPurchase,
  createPurchase,
  deletePurchase,
  duplicatePurchase,
  recalculatePurchaseTotals,
  removePurchasePhoto,
  uploadPurchasePhotos,
  updatePurchase,
  type PurchaseActor,
} from "@/lib/services/purchases";
import type { PurchaseItem } from "@/lib/types";

// Purchase authorization is driven entirely by a Project-scoped
// PurchaseActor (canManageAll / isClient) derived from the resolved Project
// access — never the legacy global users/{uid}.role. See purchases-panel.tsx.
const OWNER_ITEM: Pick<PurchaseItem, "purchaseResponsibility"> = {
  purchaseResponsibility: "OWNER",
};
const STUDIO_ITEM: Pick<PurchaseItem, "purchaseResponsibility"> = {
  purchaseResponsibility: "STUDIO",
};

describe("canManagePurchase — PurchaseActor matrix", () => {
  it("creator/EDITOR (canManageAll) can manage any item", () => {
    const actor: PurchaseActor = { uid: "u1", canManageAll: true, isClient: false };
    expect(canManagePurchase(actor, OWNER_ITEM)).toBe(true);
    expect(canManagePurchase(actor, STUDIO_ITEM)).toBe(true);
    expect(canManagePurchasePhotos(actor, OWNER_ITEM)).toBe(true);
  });

  it("a Client cannot manage Purchase details or photos, including OWNER items", () => {
    const actor: PurchaseActor = { uid: "u2", canManageAll: false, isClient: true };
    expect(canManagePurchase(actor, OWNER_ITEM)).toBe(false);
    expect(canManagePurchase(actor, STUDIO_ITEM)).toBe(false);
    expect(canManagePurchasePhotos(actor, OWNER_ITEM)).toBe(false);
    expect(canManagePurchasePhotos(actor, STUDIO_ITEM)).toBe(false);
  });

  it("a Client may only view OWNER-responsibility Purchases", () => {
    const actor: PurchaseActor = { uid: "u2", canManageAll: false, isClient: true };
    expect(canViewPurchase(actor, OWNER_ITEM)).toBe(true);
    expect(canViewPurchase(actor, STUDIO_ITEM)).toBe(false);
  });

  it("a VIEW_ONLY/UPDATE_PROGRESS colleague (neither canManageAll nor isClient) can manage nothing", () => {
    const actor: PurchaseActor = { uid: "u3", canManageAll: false, isClient: false };
    expect(canManagePurchase(actor, OWNER_ITEM)).toBe(false);
    expect(canManagePurchase(actor, STUDIO_ITEM)).toBe(false);
    expect(canViewPurchase(actor, STUDIO_ITEM)).toBe(true);
  });

  it("no actor can never manage anything", () => {
    expect(canManagePurchase(null, OWNER_ITEM)).toBe(false);
    expect(canManagePurchase(undefined, STUDIO_ITEM)).toBe(false);
    expect(canViewPurchase(null, OWNER_ITEM)).toBe(false);
  });
});

describe("Purchases service — no defaultWorkspaceId fallback", () => {
  const actor: PurchaseActor = { uid: "u1", canManageAll: true, isClient: false };

  it("createPurchase throws instead of guessing a workspace when none is passed", async () => {
    await expect(
      createPurchase(
        "proj-1",
        {
          category: "LIGHTING",
          itemName: "Test",
          description: "",
          locations: [],
          purchaseResponsibility: "STUDIO",
          currency: "RMB",
          quantity: 1,
          unitPriceRMB: 10,
          unitPriceSGD: 0,
          purchaseStatus: "TO_CONFIRM",
        },
        actor,
        undefined,
        undefined,
      ),
    ).rejects.toThrow(/workspace/i);
  });

  it("updatePurchase/deletePurchase/duplicatePurchase/recalculatePurchaseTotals/photo helpers all require an explicit workspaceId", async () => {
    await expect(
      updatePurchase("proj-1", "item-1", {}, actor, undefined, undefined),
    ).rejects.toThrow(/workspace/i);
    await expect(
      deletePurchase("proj-1", "item-1", actor, undefined),
    ).rejects.toThrow(/workspace/i);
    await expect(
      duplicatePurchase("proj-1", "item-1", actor, undefined, undefined),
    ).rejects.toThrow(/workspace/i);
    await expect(
      recalculatePurchaseTotals("proj-1", 5, actor, undefined),
    ).rejects.toThrow(/workspace/i);
    await expect(
      uploadPurchasePhotos("proj-1", "item-1", [], actor, undefined, undefined, undefined),
    ).rejects.toThrow(/workspace/i);
    await expect(
      removePurchasePhoto("proj-1", "item-1", "photo-1", actor, undefined, undefined),
    ).rejects.toThrow(/workspace/i);
  });
});

describe("Purchases service — Client write paths", () => {
  const clientActor: PurchaseActor = {
    uid: "client-1",
    canManageAll: false,
    isClient: true,
  };

  it("rejects Client creation before any Firestore write", async () => {
    await expect(
      createPurchase(
        "proj-1",
        {
          category: "LIGHTING",
          itemName: "Owner item",
          description: "",
          locations: [],
          purchaseResponsibility: "OWNER",
          currency: "RMB",
          quantity: 1,
          unitPriceRMB: 10,
          unitPriceSGD: 0,
          purchaseStatus: "TO_CONFIRM",
        },
        clientActor,
        5,
        "ws-1",
      ),
    ).rejects.toThrow(/cannot create/i);
  });

  it("rejects Client delete before any Firestore write", async () => {
    await expect(
      deletePurchase("proj-1", "item-1", clientActor, "ws-1"),
    ).rejects.toThrow(/cannot delete/i);
  });
});

describe("recalculatePurchaseTotals — exchange rate is a manage-only action", () => {
  it("rejects a non-managing actor even if it happens to be a Client", async () => {
    const clientActor: PurchaseActor = { uid: "u2", canManageAll: false, isClient: true };
    await expect(
      recalculatePurchaseTotals("proj-1", 5, clientActor, "ws-1"),
    ).rejects.toThrow(/studio/i);
  });
});
