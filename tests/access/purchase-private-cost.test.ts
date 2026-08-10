import { describe, expect, it } from "vitest";
import {
  calcPurchaseTotalCost,
  canViewPrivatePurchaseCost,
  summarizeCategory,
  type PurchaseActor,
} from "@/lib/services/purchases";
import type { PurchaseItem } from "@/lib/types";

function baseItem(overrides: Partial<PurchaseItem> = {}): PurchaseItem {
  return {
    id: "p1",
    projectId: "proj",
    companyId: "ws",
    category: "LIGHTING",
    itemName: "Downlight",
    description: "Test",
    locations: ["Living Room"],
    photos: [],
    purchaseResponsibility: "STUDIO",
    currency: "RMB",
    quantity: 2,
    unitPriceRMB: 100,
    unitPriceSGD: 0,
    totalRMB: 200,
    totalSGD: 38,
    purchaseStatus: "TO_CONFIRM",
    createdBy: "u1",
    updatedBy: "u1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("calcPurchaseTotalCost", () => {
  it("computes quantity × unitCost", () => {
    expect(calcPurchaseTotalCost(3, 12.5)).toBe(37.5);
  });

  it("treats negative inputs as zero", () => {
    expect(calcPurchaseTotalCost(-2, 10)).toBe(0);
    expect(calcPurchaseTotalCost(2, -10)).toBe(0);
  });
});

describe("canViewPrivatePurchaseCost", () => {
  it("allows creator/EDITOR (canManageAll)", () => {
    const actor: PurchaseActor = {
      uid: "owner",
      canManageAll: true,
      isClient: false,
    };
    expect(canViewPrivatePurchaseCost(actor)).toBe(true);
  });

  it("denies VIEWER / UPDATE_PROGRESS colleagues", () => {
    const actor: PurchaseActor = {
      uid: "viewer",
      canManageAll: false,
      isClient: false,
    };
    expect(canViewPrivatePurchaseCost(actor)).toBe(false);
  });

  it("denies CLIENT", () => {
    const actor: PurchaseActor = {
      uid: "client",
      canManageAll: false,
      isClient: true,
    };
    expect(canViewPrivatePurchaseCost(actor)).toBe(false);
  });
});

describe("summarizeCategory private cost totals", () => {
  it("sums Cost by currency and ignores items without cost / cancelled", () => {
    const summary = summarizeCategory([
      baseItem({
        id: "a",
        currency: "RMB",
        totalCost: 100,
        purchaseStatus: "TO_PURCHASE",
      }),
      baseItem({
        id: "b",
        currency: "SGD",
        totalCost: 40,
        purchaseStatus: "PURCHASED",
      }),
      baseItem({
        id: "c",
        currency: "RMB",
        totalCost: 999,
        purchaseStatus: "CANCELLED",
      }),
      baseItem({ id: "d", currency: "RMB" }),
    ]);
    expect(summary.totalCostRMB).toBe(100);
    expect(summary.totalCostSGD).toBe(40);
  });

  it("legacy items without cost still summarize selling totals", () => {
    const summary = summarizeCategory([baseItem()]);
    expect(summary.count).toBe(1);
    expect(summary.totalRMB).toBe(200);
    expect(summary.totalCostRMB).toBe(0);
    expect(summary.totalCostSGD).toBe(0);
  });
});
