import { describe, expect, it } from "vitest";
import {
  calcPurchaseTotalCost,
  calcPurchaseTotalCostSgd,
  canViewPrivatePurchaseCost,
  resolvePurchaseCostTotals,
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
  it("computes quantity × unitCost (RMB)", () => {
    expect(calcPurchaseTotalCost(71, 78)).toBe(5538);
    expect(calcPurchaseTotalCost(3, 12.5)).toBe(37.5);
  });

  it("treats negative inputs as zero", () => {
    expect(calcPurchaseTotalCost(-2, 10)).toBe(0);
    expect(calcPurchaseTotalCost(2, -10)).toBe(0);
  });
});

describe("calcPurchaseTotalCostSgd", () => {
  it("derives SGD from RMB total × rate", () => {
    expect(calcPurchaseTotalCostSgd(5538, 0.19)).toBe(1052.22);
  });
});

describe("resolvePurchaseCostTotals", () => {
  it("returns null when unitCost is missing", () => {
    expect(resolvePurchaseCostTotals(baseItem(), 0.19)).toBeNull();
  });

  it("derives live RMB and SGD from quantity × unitCost × rate", () => {
    expect(
      resolvePurchaseCostTotals(
        baseItem({ quantity: 71, unitCost: 78, totalCost: 9999 }),
        0.19,
      ),
    ).toEqual({ totalCostRmb: 5538, totalCostSgd: 1052.22 });
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
  it("sums cost using current rate and ignores items without cost / cancelled", () => {
    const summary = summarizeCategory(
      [
        baseItem({
          id: "a",
          quantity: 71,
          unitCost: 78,
          totalCost: 5538,
          purchaseStatus: "TO_PURCHASE",
        }),
        baseItem({
          id: "b",
          quantity: 10,
          unitCost: 100,
          totalCost: 1000,
          purchaseStatus: "PURCHASED",
        }),
        baseItem({
          id: "c",
          quantity: 5,
          unitCost: 50,
          totalCost: 250,
          purchaseStatus: "CANCELLED",
        }),
        baseItem({ id: "d" }),
      ],
      0.19,
    );
    // 5538 + 1000 = 6538 RMB; SGD = 6538 * 0.19
    expect(summary.totalCostRMB).toBe(6538);
    expect(summary.totalCostSGD).toBe(1242.22);
  });

  it("recalculates SGD when rate changes", () => {
    const items = [
      baseItem({
        quantity: 71,
        unitCost: 78,
        totalCost: 5538,
      }),
    ];
    expect(summarizeCategory(items, 0.19).totalCostSGD).toBe(1052.22);
    expect(summarizeCategory(items, 0.2).totalCostSGD).toBe(1107.6);
  });

  it("legacy items without cost still summarize selling totals", () => {
    const summary = summarizeCategory([baseItem()], 0.19);
    expect(summary.count).toBe(1);
    expect(summary.totalRMB).toBe(200);
    expect(summary.totalCostRMB).toBe(0);
    expect(summary.totalCostSGD).toBe(0);
  });
});
