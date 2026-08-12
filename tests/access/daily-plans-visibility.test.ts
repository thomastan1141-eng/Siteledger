import { describe, expect, it, vi } from "vitest";
import { eachDateKeyInclusive } from "@/lib/utils";

vi.mock("@/lib/demo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/demo")>();
  return { ...actual, AUTH_BYPASS: true };
});

vi.mock("@/lib/firebase", () => ({
  getFirebaseDb: () => {
    throw new Error("Firebase should not be called in AUTH_BYPASS unit tests");
  },
}));

const {
  isDailyPlanClientVisible,
  listDailyPlans,
  listClientVisiblePlans,
  saveDailyPlan,
  saveDailyPlansInRange,
} = await import("@/lib/services/daily-plans");

describe("dailyPlans clientVisible — Schedule-compatible defaults", () => {
  it("treats missing clientVisible as visible", () => {
    expect(isDailyPlanClientVisible({})).toBe(true);
    expect(isDailyPlanClientVisible({ clientVisible: undefined })).toBe(true);
    expect(isDailyPlanClientVisible({ clientVisible: true })).toBe(true);
    expect(isDailyPlanClientVisible({ clientVisible: false })).toBe(false);
  });

  it("saveDailyPlan stamps clientVisible true by default (Share with client)", async () => {
    const plan = await saveDailyPlan({
      projectId: "demo-berwick",
      date: "2099-01-15",
      items: [{ workText: "Share default", color: "#111" }],
      workspaceId: "siteledger",
    });
    expect(plan.clientVisible).toBe(true);
  });

  it("saveDailyPlan can hide a plan from Client", async () => {
    const plan = await saveDailyPlan({
      projectId: "demo-berwick",
      date: "2099-01-16",
      items: [{ workText: "Internal only", color: "#111" }],
      clientVisible: false,
      workspaceId: "siteledger",
    });
    expect(plan.clientVisible).toBe(false);
  });

  it("listDailyPlans clientOnly excludes explicitly hidden plans", async () => {
    await saveDailyPlan({
      projectId: "demo-berwick",
      date: "2099-02-01",
      items: [{ workText: "Visible", color: "#111" }],
      clientVisible: true,
      workspaceId: "siteledger",
    });
    await saveDailyPlan({
      projectId: "demo-berwick",
      date: "2099-02-02",
      items: [{ workText: "Hidden", color: "#111" }],
      clientVisible: false,
      workspaceId: "siteledger",
    });

    const visible = await listDailyPlans("demo-berwick", {
      workspaceId: "siteledger",
      clientOnly: true,
    });
    expect(visible.every((p) => p.clientVisible !== false)).toBe(true);
    expect(visible.some((p) => p.date === "2099-02-01")).toBe(true);
    expect(visible.some((p) => p.date === "2099-02-02")).toBe(false);
  });

  it("listClientVisiblePlans requires the Project workspaceId (no silent fallback)", async () => {
    await expect(listClientVisiblePlans("demo-berwick")).rejects.toThrow(
      /workspace/i,
    );
  });

  it("UI Share-with-client contract: shared checkbox state is client-visible", () => {
    // Mirrors month-calendar default clientVisible=true and !== false save.
    expect(isDailyPlanClientVisible({ clientVisible: true })).toBe(true);
    expect(isDailyPlanClientVisible({ clientVisible: false })).toBe(false);
  });

  it("eachDateKeyInclusive covers 14–18 Aug as five days", () => {
    expect(eachDateKeyInclusive("2026-08-14", "2026-08-18")).toEqual([
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
      "2026-08-17",
      "2026-08-18",
    ]);
  });

  it("eachDateKeyInclusive with no end is a single day", () => {
    expect(eachDateKeyInclusive("2026-08-14", "")).toEqual(["2026-08-14"]);
    expect(eachDateKeyInclusive("2026-08-14", "2026-08-14")).toEqual([
      "2026-08-14",
    ]);
  });

  it("saveDailyPlansInRange writes the same plan across inclusive days", async () => {
    const saved = await saveDailyPlansInRange({
      projectId: "demo-berwick",
      startDate: "2099-03-14",
      endDate: "2099-03-18",
      items: [{ workText: "Range tiling", color: "#111" }],
      reminder: "Delivery",
      note: "Range note",
      workspaceId: "siteledger",
    });
    expect(saved).toHaveLength(5);
    expect(saved.map((p) => p.date)).toEqual([
      "2099-03-14",
      "2099-03-15",
      "2099-03-16",
      "2099-03-17",
      "2099-03-18",
    ]);
    expect(saved.every((p) => p.items[0]?.workText === "Range tiling")).toBe(
      true,
    );
    expect(saved.every((p) => p.reminder === "Delivery")).toBe(true);
  });
});
