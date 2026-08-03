/** Money helpers — avoid float display errors via cent rounding. */

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

export function calcRmbSgdTotals(input: {
  quantity: number;
  unitPriceRMB: number;
  rmbToSgdRate: number;
}) {
  const quantity = Math.max(0, roundMoney(input.quantity, 4));
  const unitPriceRMB = Math.max(0, roundMoney(input.unitPriceRMB));
  const rmbToSgdRate = Math.max(0, roundMoney(input.rmbToSgdRate, 6));
  const totalRMB = roundMoney(quantity * unitPriceRMB);
  const totalSGD = roundMoney(totalRMB * rmbToSgdRate);
  return { quantity, unitPriceRMB, rmbToSgdRate, totalRMB, totalSGD };
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
