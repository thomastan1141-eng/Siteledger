/** Money helpers — avoid float display errors via cent rounding. */

import type { PurchaseCurrency } from "./types";

export function roundMoney(value: number, decimals = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function parseMoney(input: string | number) {
  if (typeof input === "number") return roundMoney(input);
  const cleaned = String(input).replace(/,/g, "").trim();
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? roundMoney(n) : 0;
}

/**
 * Currency-aware purchase totals.
 * - RMB items: user enters unitPriceRMB; totalRMB = qty × unitPriceRMB;
 *   totalSGD is derived by converting totalRMB at rmbToSgdRate.
 * - SGD items: user enters unitPriceSGD; totalSGD = qty × unitPriceSGD;
 *   totalRMB is always 0 (never converted/stored) and unaffected by rate.
 */
export function calcPurchaseTotals(input: {
  currency: PurchaseCurrency;
  quantity: number;
  unitPriceRMB: number;
  unitPriceSGD: number;
  rmbToSgdRate: number;
}) {
  const currency: PurchaseCurrency = input.currency === "SGD" ? "SGD" : "RMB";
  const quantity = Math.max(0, roundMoney(input.quantity, 4));
  const rmbToSgdRate = Math.max(0, roundMoney(input.rmbToSgdRate, 6));

  if (currency === "SGD") {
    const unitPriceSGD = Math.max(0, roundMoney(input.unitPriceSGD));
    const totalSGD = roundMoney(quantity * unitPriceSGD);
    return {
      currency,
      quantity,
      unitPriceRMB: 0,
      unitPriceSGD,
      rmbToSgdRate,
      totalRMB: 0,
      totalSGD,
    };
  }

  const unitPriceRMB = Math.max(0, roundMoney(input.unitPriceRMB));
  const totalRMB = roundMoney(quantity * unitPriceRMB);
  const totalSGD = roundMoney(totalRMB * rmbToSgdRate);
  return {
    currency,
    quantity,
    unitPriceRMB,
    unitPriceSGD: 0,
    rmbToSgdRate,
    totalRMB,
    totalSGD,
  };
}

export function formatRmb(value: number) {
  return `¥${roundMoney(value).toLocaleString("en-SG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatSgd(value: number) {
  return `S$${roundMoney(value).toLocaleString("en-SG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatLightingSpecs(specs?: {
  watt?: string;
  fittingColour?: string;
  colourTemperature?: string;
  cutOutSize?: string;
} | null) {
  if (!specs) return "";
  const watt = (specs.watt || "").trim();
  const colour = (specs.fittingColour || "").trim();
  const temp = (specs.colourTemperature || "").trim();
  const cutOut = (specs.cutOutSize || "").trim();
  const mid = [colour, temp].filter(Boolean).join(" · ");
  const lines = [
    watt,
    mid,
    cutOut ? `Cut-out ${cutOut}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

export function emptyLightingSpecs() {
  return {
    watt: "",
    fittingColour: "",
    colourTemperature: "",
    cutOutSize: "",
  };
}
