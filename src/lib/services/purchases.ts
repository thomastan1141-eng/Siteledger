import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from "firebase/storage";
import { getFirebaseDb, getFirebaseStorage } from "../firebase";
import { AUTH_BYPASS } from "../demo";
import { COMPANY_ID } from "../constants";
import { compressImageFile } from "../image-compress";
import { calcPurchaseTotals, roundMoney } from "../money";
import {
  purchasesPath,
  requireTenantId,
  storagePurchasePhotoPath,
} from "../paths";
import type {
  AppUser,
  LightingSpecifications,
  PurchaseCategory,
  PurchaseCurrency,
  PurchaseItem,
  PurchasePhoto,
  PurchaseResponsibility,
  PurchaseStatus,
} from "../types";
import { DEFAULT_RMB_TO_SGD_RATE } from "../types";

function purchaseWorkspace(user?: AppUser | null, workspaceId?: string) {
  return requireTenantId(
    workspaceId || user?.defaultWorkspaceId || user?.companyId,
  );
}

export type PurchaseInput = {
  category: PurchaseCategory;
  itemName: string;
  description: string;
  locations: string[];
  lightingSpecifications?: LightingSpecifications;
  coverImageUrl?: string;
  photos?: PurchasePhoto[];
  purchaseResponsibility: PurchaseResponsibility;
  currency: PurchaseCurrency;
  quantity: number;
  unitPriceRMB: number;
  unitPriceSGD: number;
  purchaseStatus: PurchaseStatus;
  action?: string;
};

let demoPurchases: PurchaseItem[] = [
  {
    id: "pur-bw-1",
    projectId: "demo-berwick",
    companyId: COMPANY_ID,
    category: "LIGHTING",
    itemName: "Wall wash downlight",
    description: "Living / Dining\nRecessed wash light for ceiling",
    locations: ["Living Room", "Dining Room"],
    lightingSpecifications: {
      watt: "12W",
      fittingColour: "Black",
      colourTemperature: "3000K",
      cutOutSize: "75mm",
    },
    coverImageUrl:
      "https://images.unsplash.com/photo-1524484485614-1ffe1103bc6c?w=400&q=80",
    photos: [
      {
        id: "pp1",
        url: "https://images.unsplash.com/photo-1524484485614-1ffe1103bc6c?w=800&q=80",
        storagePath: "demo",
        fileName: "light.jpg",
        sizeBytes: 0,
      },
    ],
    purchaseResponsibility: "STUDIO",
    currency: "RMB",
    quantity: 20,
    unitPriceRMB: 150,
    unitPriceSGD: 0,
    totalRMB: 3000,
    totalSGD: 570,
    purchaseStatus: "TO_PURCHASE",
    action: "Confirm quantity with electrician",
    createdBy: "demo-admin",
    updatedBy: "demo-admin",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "pur-bw-2",
    projectId: "demo-berwick",
    companyId: COMPANY_ID,
    category: "BATHROOM_SANITARY",
    itemName: "Basin mixer",
    description: "Master Bathroom\nBrushed nickel finish\nHot and cold",
    locations: ["Master Bathroom"],
    coverImageUrl: "",
    photos: [],
    purchaseResponsibility: "OWNER",
    currency: "RMB",
    quantity: 2,
    unitPriceRMB: 1650,
    unitPriceSGD: 0,
    totalRMB: 3300,
    totalSGD: 627,
    purchaseStatus: "TO_CONFIRM",
    action: "Owner to confirm colour",
    createdBy: "demo-admin",
    updatedBy: "demo-admin",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "pur-bw-3",
    projectId: "demo-berwick",
    companyId: COMPANY_ID,
    category: "KITCHEN_APPLIANCES",
    itemName: "Built-in oven",
    description: "Dry Kitchen\n60cm oven\nBlack glass",
    locations: ["Dry Kitchen"],
    coverImageUrl: "",
    photos: [],
    purchaseResponsibility: "STUDIO",
    currency: "RMB",
    quantity: 1,
    unitPriceRMB: 4200,
    unitPriceSGD: 0,
    totalRMB: 4200,
    totalSGD: 798,
    purchaseStatus: "TO_PURCHASE",
    action: "Thomas to purchase",
    createdBy: "demo-admin",
    updatedBy: "demo-admin",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
];

const demoRates: Record<string, number> = {
  "demo-berwick": DEFAULT_RMB_TO_SGD_RATE,
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeCategory(raw: unknown): PurchaseCategory {
  const value = String(raw || "").trim();
  if (
    value === "LIGHTING" ||
    value === "KITCHEN_APPLIANCES" ||
    value === "BATHROOM_SANITARY"
  ) {
    return value;
  }
  const lower = value.toLowerCase();
  if (lower.includes("kitchen") || lower.includes("appliance")) {
    return "KITCHEN_APPLIANCES";
  }
  if (
    lower.includes("bath") ||
    lower.includes("sanitary") ||
    lower.includes("toilet")
  ) {
    return "BATHROOM_SANITARY";
  }
  if (lower.includes("light")) return "LIGHTING";
  return "LIGHTING";
}

function normalizeStatus(raw: unknown): PurchaseStatus {
  const value = String(raw || "TO_CONFIRM");
  if (value === "CONFIRMED") return "TO_CONFIRM";
  if (
    value === "TO_CONFIRM" ||
    value === "TO_PURCHASE" ||
    value === "PURCHASED" ||
    value === "CANCELLED"
  ) {
    return value;
  }
  return "TO_CONFIRM";
}

function specsToDescription(specs: Record<string, unknown> | undefined) {
  if (!specs || typeof specs !== "object") return "";
  const parts = [
    specs.cutOutSize ? `Cut-out ${specs.cutOutSize}` : "",
    specs.wattage,
    specs.beamAngle,
    specs.dimensions,
    specs.material,
    specs.finishColour,
    specs.colourTemperature,
    specs.additionalDetails,
  ]
    .map((p) => String(p || "").trim())
    .filter(Boolean);
  return parts.join("\n");
}

function normalizeLightingSpecs(
  category: PurchaseCategory,
  data: Record<string, unknown>,
): LightingSpecifications | undefined {
  if (category !== "LIGHTING") return undefined;
  const direct = data.lightingSpecifications as
    | Record<string, unknown>
    | undefined;
  const legacy = data.specifications as Record<string, unknown> | undefined;
  const source = direct || legacy || {};
  const specs: LightingSpecifications = {
    watt: String(source.watt ?? source.wattage ?? "").trim(),
    fittingColour: String(
      source.fittingColour ?? source.finishColour ?? "",
    ).trim(),
    colourTemperature: String(source.colourTemperature ?? "").trim(),
    cutOutSize: String(source.cutOutSize ?? "").trim(),
  };
  const hasAny = Object.values(specs).some(Boolean);
  return hasAny ? specs : { watt: "", fittingColour: "", colourTemperature: "", cutOutSize: "" };
}

/** Compatibility layer for older purchase documents. */
export function mapPurchase(
  id: string,
  data: Record<string, unknown>,
  rmbToSgdRate = DEFAULT_RMB_TO_SGD_RATE,
): PurchaseItem {
  const category = normalizeCategory(data.category);
  const legacySpecs = data.specifications as Record<string, unknown> | undefined;
  const hasLightingObject = Boolean(data.lightingSpecifications);
  const description =
    String(data.description || "").trim() ||
    (!hasLightingObject ? specsToDescription(legacySpecs) : "");

  let locations: string[] = [];
  if (Array.isArray(data.locations)) {
    locations = data.locations.map((l) => String(l).trim()).filter(Boolean);
  } else if (data.room) {
    locations = [String(data.room).trim()].filter(Boolean);
  }
  locations = locations.map((loc) => {
    if (loc === "Junior Master bedroom") return "Junior Master Bedroom";
    if (/^Bedroom\s+([2-6])$/i.test(loc)) {
      return loc.replace(/^Bedroom/i, "Room");
    }
    return loc;
  });

  const photos: PurchasePhoto[] = Array.isArray(data.photos)
    ? (data.photos as PurchasePhoto[])
    : Array.isArray(data.photoUrls)
      ? (data.photoUrls as string[]).map((url, i) => ({
          id: `legacy-${i}`,
          url,
          storagePath: "",
          fileName: `photo-${i + 1}`,
          sizeBytes: 0,
        }))
      : [];

  // Pre-currency-selector records have no `currency` field — treat as RMB
  // for backward compatibility, per existing unitPriceRMB semantics.
  const currency: PurchaseCurrency = data.currency === "SGD" ? "SGD" : "RMB";
  const quantity = Number(data.quantity) || 0;
  const unitPriceRMB = Number(data.unitPriceRMB ?? data.unitPrice ?? 0);
  const unitPriceSGD = Number(data.unitPriceSGD ?? 0);
  const totals = calcPurchaseTotals({
    currency,
    quantity,
    unitPriceRMB,
    unitPriceSGD,
    rmbToSgdRate,
  });

  return {
    id,
    projectId: String(data.projectId || ""),
    companyId: String(data.companyId || COMPANY_ID),
    category,
    itemName: String(data.itemName || ""),
    description,
    locations,
    lightingSpecifications: normalizeLightingSpecs(category, data),
    coverImageUrl: String(data.coverImageUrl || photos[0]?.url || ""),
    photos,
    purchaseResponsibility:
      (data.purchaseResponsibility as PurchaseResponsibility) || "STUDIO",
    currency: totals.currency,
    quantity: totals.quantity,
    unitPriceRMB: totals.unitPriceRMB,
    unitPriceSGD: totals.unitPriceSGD,
    totalRMB: totals.totalRMB,
    totalSGD: totals.totalSGD,
    purchaseStatus: normalizeStatus(data.purchaseStatus),
    action: String(data.action || ""),
    createdBy: String(data.createdBy || ""),
    updatedBy: String(data.updatedBy || ""),
    createdAt: String(data.createdAt || nowIso()),
    updatedAt: String(data.updatedAt || nowIso()),
  };
}

export function canManagePurchase(
  user: AppUser | null | undefined,
  item: Pick<PurchaseItem, "purchaseResponsibility">,
) {
  if (!user) return false;
  if (user.role === "admin" || user.role === "staff") return true;
  return user.role === "client" && item.purchaseResponsibility === "OWNER";
}

export function canViewPurchase(user: AppUser | null | undefined) {
  return Boolean(user);
}

export function getProjectRmbRate(
  projectId: string,
  projectRate?: number | null,
) {
  if (projectRate && projectRate > 0) return roundMoney(projectRate, 6);
  if (AUTH_BYPASS && demoRates[projectId]) return demoRates[projectId];
  return DEFAULT_RMB_TO_SGD_RATE;
}

export async function listPurchases(
  projectId: string,
  options?: { category?: PurchaseCategory; rmbToSgdRate?: number; workspaceId?: string },
) {
  const rate = getProjectRmbRate(projectId, options?.rmbToSgdRate);
  const ws = purchaseWorkspace(null, options?.workspaceId);
  let items: PurchaseItem[];

  if (AUTH_BYPASS) {
    items = demoPurchases
      .filter((p) => p.projectId === projectId)
      .map((p) =>
        mapPurchase(p.id, p as unknown as Record<string, unknown>, rate),
      );
  } else {
    const snap = await getDocs(
      query(
        collection(getFirebaseDb(), purchasesPath(projectId, ws)),
        orderBy("updatedAt", "desc"),
      ),
    );
    items = snap.docs.map((d) => mapPurchase(d.id, d.data(), rate));
  }

  if (options?.category) {
    items = items.filter((p) => p.category === options.category);
  }
  return items;
}

export async function createPurchase(
  projectId: string,
  input: PurchaseInput,
  user: AppUser,
  rmbToSgdRate = DEFAULT_RMB_TO_SGD_RATE,
  workspaceId?: string,
) {
  if (user.role === "client" && input.purchaseResponsibility !== "OWNER") {
    throw new Error("Owners can only create Owner purchase items.");
  }

  const ws = purchaseWorkspace(user, workspaceId);
  const totals = calcPurchaseTotals({
    currency: input.currency,
    quantity: input.quantity,
    unitPriceRMB: input.unitPriceRMB,
    unitPriceSGD: input.unitPriceSGD,
    rmbToSgdRate,
  });
  const now = nowIso();
  const photos = input.photos || [];
  const category = input.category;
  const data: Omit<PurchaseItem, "id"> = {
    projectId,
    companyId: ws,
    category,
    itemName: input.itemName.trim(),
    description: input.description || "",
    locations: (input.locations || []).map((l) => l.trim()).filter(Boolean),
    lightingSpecifications:
      category === "LIGHTING"
        ? {
            watt: input.lightingSpecifications?.watt?.trim() || "",
            fittingColour:
              input.lightingSpecifications?.fittingColour?.trim() || "",
            colourTemperature:
              input.lightingSpecifications?.colourTemperature?.trim() || "",
            cutOutSize: input.lightingSpecifications?.cutOutSize?.trim() || "",
          }
        : undefined,
    coverImageUrl: input.coverImageUrl || photos[0]?.url || "",
    photos,
    purchaseResponsibility:
      user.role === "client" ? "OWNER" : input.purchaseResponsibility,
    currency: totals.currency,
    quantity: totals.quantity,
    unitPriceRMB: totals.unitPriceRMB,
    unitPriceSGD: totals.unitPriceSGD,
    totalRMB: totals.totalRMB,
    totalSGD: totals.totalSGD,
    purchaseStatus: input.purchaseStatus,
    action: input.action?.trim() || "",
    createdBy: user.uid,
    updatedBy: user.uid,
    createdAt: now,
    updatedAt: now,
  };

  if (AUTH_BYPASS) {
    const item = { id: `pur-${Date.now()}`, ...data };
    demoPurchases = [item, ...demoPurchases];
    return item;
  }

  const refDoc = await addDoc(collection(getFirebaseDb(), purchasesPath(projectId, ws)), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: refDoc.id, ...data };
}

export async function updatePurchase(
  projectId: string,
  purchaseId: string,
  patch: Partial<PurchaseInput>,
  user: AppUser,
  rmbToSgdRate = DEFAULT_RMB_TO_SGD_RATE,
  workspaceId?: string,
) {
  const ws = purchaseWorkspace(user, workspaceId);
  const existing = (await listPurchases(projectId, { rmbToSgdRate, workspaceId: ws })).find(
    (p) => p.id === purchaseId,
  );
  if (!existing) throw new Error("Purchase item not found");
  if (!canManagePurchase(user, existing)) {
    throw new Error("You do not have permission to edit this item.");
  }
  if (user.role === "client" && patch.purchaseResponsibility === "STUDIO") {
    throw new Error("Owners cannot change Purchased by to Studio.");
  }

  const currency = patch.currency ?? existing.currency;
  const quantity = patch.quantity ?? existing.quantity;
  const unitPriceRMB = patch.unitPriceRMB ?? existing.unitPriceRMB;
  const unitPriceSGD = patch.unitPriceSGD ?? existing.unitPriceSGD;
  const totals = calcPurchaseTotals({
    currency,
    quantity,
    unitPriceRMB,
    unitPriceSGD,
    rmbToSgdRate,
  });
  const photos = patch.photos ?? existing.photos;
  const category = patch.category ?? existing.category;
  const lightingSpecifications =
    category === "LIGHTING"
      ? {
          watt:
            patch.lightingSpecifications?.watt ??
            existing.lightingSpecifications?.watt ??
            "",
          fittingColour:
            patch.lightingSpecifications?.fittingColour ??
            existing.lightingSpecifications?.fittingColour ??
            "",
          colourTemperature:
            patch.lightingSpecifications?.colourTemperature ??
            existing.lightingSpecifications?.colourTemperature ??
            "",
          cutOutSize:
            patch.lightingSpecifications?.cutOutSize ??
            existing.lightingSpecifications?.cutOutSize ??
            "",
        }
      : undefined;

  const payload = {
    category,
    itemName: (patch.itemName ?? existing.itemName).trim(),
    description: patch.description ?? existing.description,
    locations: (patch.locations ?? existing.locations)
      .map((l) => l.trim())
      .filter(Boolean),
    lightingSpecifications,
    coverImageUrl:
      patch.coverImageUrl ??
      existing.coverImageUrl ??
      photos[0]?.url ??
      "",
    photos,
    purchaseResponsibility:
      user.role === "client"
        ? ("OWNER" as const)
        : (patch.purchaseResponsibility ?? existing.purchaseResponsibility),
    currency: totals.currency,
    quantity: totals.quantity,
    unitPriceRMB: totals.unitPriceRMB,
    unitPriceSGD: totals.unitPriceSGD,
    totalRMB: totals.totalRMB,
    totalSGD: totals.totalSGD,
    purchaseStatus: patch.purchaseStatus ?? existing.purchaseStatus,
    action: (patch.action ?? existing.action ?? "").trim(),
    updatedBy: user.uid,
    updatedAt: nowIso(),
  };

  if (AUTH_BYPASS) {
    demoPurchases = demoPurchases.map((p) =>
      p.id === purchaseId ? { ...p, ...payload } : p,
    );
    return { ...existing, ...payload, id: purchaseId };
  }

  await updateDoc(doc(getFirebaseDb(), purchasesPath(projectId, ws), purchaseId), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
  return { ...existing, ...payload, id: purchaseId };
}

/** Recalculate SGD totals after project exchange rate changes. */
export async function recalculatePurchaseTotals(
  projectId: string,
  rmbToSgdRate: number,
  user: AppUser,
  workspaceId?: string,
) {
  if (user.role !== "admin" && user.role !== "staff") {
    throw new Error("Only studio users can change the exchange rate.");
  }
  const ws = purchaseWorkspace(user, workspaceId);
  const items = await listPurchases(projectId, { rmbToSgdRate, workspaceId: ws });
  for (const item of items) {
    // SGD items are entered directly in SGD and never convert off the RMB
    // rate — leave them completely untouched (no rewrite, no updatedAt bump).
    if (item.currency === "SGD") continue;
    await updatePurchase(
      projectId,
      item.id,
      {
        quantity: item.quantity,
        unitPriceRMB: item.unitPriceRMB,
      },
      user,
      rmbToSgdRate,
      ws,
    );
  }
  if (AUTH_BYPASS) {
    demoRates[projectId] = rmbToSgdRate;
  }
}

export async function deletePurchase(
  projectId: string,
  purchaseId: string,
  user: AppUser,
  workspaceId?: string,
) {
  const ws = purchaseWorkspace(user, workspaceId);
  const existing = (await listPurchases(projectId, { workspaceId: ws })).find(
    (p) => p.id === purchaseId,
  );
  if (!existing) return;
  if (user.role === "client") {
    throw new Error("Owners cannot delete purchase items. Ask the studio.");
  }
  if (!canManagePurchase(user, existing)) {
    throw new Error("You do not have permission to delete this item.");
  }

  if (!AUTH_BYPASS) {
    await Promise.all(
      existing.photos
        .filter((p) => p.storagePath && p.storagePath !== "demo")
        .map(async (p) => {
          try {
            await deleteObject(ref(getFirebaseStorage(), p.storagePath));
          } catch {
            /* ignore */
          }
        }),
    );
    await deleteDoc(doc(getFirebaseDb(), purchasesPath(projectId, ws), purchaseId));
  }
  demoPurchases = demoPurchases.filter((p) => p.id !== purchaseId);
}

export async function duplicatePurchase(
  projectId: string,
  purchaseId: string,
  user: AppUser,
  rmbToSgdRate = DEFAULT_RMB_TO_SGD_RATE,
  workspaceId?: string,
) {
  const ws = purchaseWorkspace(user, workspaceId);
  const existing = (await listPurchases(projectId, { rmbToSgdRate, workspaceId: ws })).find(
    (p) => p.id === purchaseId,
  );
  if (!existing) throw new Error("Purchase item not found");
  if (user.role !== "admin" && user.role !== "staff") {
    if (!canManagePurchase(user, existing)) {
      throw new Error("Cannot duplicate this item.");
    }
  }
  return createPurchase(
    projectId,
    {
      category: existing.category,
      itemName: `${existing.itemName} (copy)`,
      description: existing.description,
      locations: [...existing.locations],
      lightingSpecifications: existing.lightingSpecifications
        ? { ...existing.lightingSpecifications }
        : undefined,
      coverImageUrl: existing.coverImageUrl,
      photos: existing.photos.map((p) => ({ ...p })),
      purchaseResponsibility:
        user.role === "client" ? "OWNER" : existing.purchaseResponsibility,
      currency: existing.currency,
      quantity: existing.quantity,
      unitPriceRMB: existing.unitPriceRMB,
      unitPriceSGD: existing.unitPriceSGD,
      purchaseStatus: "TO_CONFIRM",
      action: existing.action,
    },
    user,
    rmbToSgdRate,
    ws,
  );
}

function uniqueFileName(file: File) {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
}

export async function uploadPurchasePhotos(
  projectId: string,
  purchaseId: string,
  files: File[],
  user: AppUser,
  rmbToSgdRate = DEFAULT_RMB_TO_SGD_RATE,
  onProgress?: (pct: number) => void,
  workspaceId?: string,
) {
  const ws = purchaseWorkspace(user, workspaceId);
  const existing = (await listPurchases(projectId, { rmbToSgdRate, workspaceId: ws })).find(
    (p) => p.id === purchaseId,
  );
  if (!existing) throw new Error("Purchase item not found");
  if (!canManagePurchase(user, existing)) {
    throw new Error("You do not have permission to upload photos.");
  }

  const uploaded: PurchasePhoto[] = [];
  for (let i = 0; i < files.length; i += 1) {
    const raw = files[i];
    if (!raw.type.startsWith("image/")) continue;
    if (raw.size > 20 * 1024 * 1024) {
      throw new Error(`${raw.name} is larger than 20MB.`);
    }
    const file = await compressImageFile(raw);

    if (AUTH_BYPASS) {
      uploaded.push({
        id: `pp-${Date.now()}-${i}`,
        url: URL.createObjectURL(file),
        storagePath: "demo",
        fileName: file.name,
        sizeBytes: file.size,
      });
      continue;
    }

    const path = storagePurchasePhotoPath(
      projectId,
      purchaseId,
      uniqueFileName(file),
      ws,
    );
    const storageRef = ref(getFirebaseStorage(), path);
    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type || "image/jpeg",
    });
    await new Promise<void>((resolve, reject) => {
      task.on(
        "state_changed",
        (snap) => {
          if (onProgress) {
            const base = (i / files.length) * 100;
            const part =
              (snap.bytesTransferred / snap.totalBytes) * (100 / files.length);
            onProgress(Math.round(base + part));
          }
        },
        reject,
        () => resolve(),
      );
    });
    uploaded.push({
      id: `pp-${Date.now()}-${i}`,
      url: await getDownloadURL(storageRef),
      storagePath: path,
      fileName: file.name,
      sizeBytes: file.size,
    });
  }

  const photos = [...existing.photos, ...uploaded];
  return updatePurchase(
    projectId,
    purchaseId,
    { photos, coverImageUrl: existing.coverImageUrl || photos[0]?.url || "" },
    user,
    rmbToSgdRate,
    ws,
  );
}

export async function removePurchasePhoto(
  projectId: string,
  purchaseId: string,
  photoId: string,
  user: AppUser,
  rmbToSgdRate = DEFAULT_RMB_TO_SGD_RATE,
  workspaceId?: string,
) {
  const ws = purchaseWorkspace(user, workspaceId);
  const existing = (await listPurchases(projectId, { rmbToSgdRate, workspaceId: ws })).find(
    (p) => p.id === purchaseId,
  );
  if (!existing) throw new Error("Purchase item not found");
  if (!canManagePurchase(user, existing)) {
    throw new Error("You do not have permission to remove photos.");
  }
  const target = existing.photos.find((p) => p.id === photoId);
  const photos = existing.photos.filter((p) => p.id !== photoId);
  if (
    target &&
    !AUTH_BYPASS &&
    target.storagePath &&
    target.storagePath !== "demo"
  ) {
    try {
      await deleteObject(ref(getFirebaseStorage(), target.storagePath));
    } catch {
      /* ignore */
    }
  }
  const coverImageUrl =
    existing.coverImageUrl && target && existing.coverImageUrl === target.url
      ? photos[0]?.url || ""
      : existing.coverImageUrl || photos[0]?.url || "";
  return updatePurchase(
    projectId,
    purchaseId,
    { photos, coverImageUrl },
    user,
    rmbToSgdRate,
    ws,
  );
}

export function summarizeCategory(items: PurchaseItem[]) {
  const active = items.filter((i) => i.purchaseStatus !== "CANCELLED");
  return {
    count: items.length,
    totalRMB: roundMoney(active.reduce((s, i) => s + i.totalRMB, 0)),
    totalSGD: roundMoney(active.reduce((s, i) => s + i.totalSGD, 0)),
  };
}

export function exportPurchasesCsv(items: PurchaseItem[]) {
  const headers = [
    "Category",
    "Item",
    "Description",
    "Locations",
    "Watt",
    "Fitting colour",
    "Colour temperature",
    "Cut-out size",
    "Purchased by",
    "Quantity",
    "Currency",
    "Unit Price",
    "Total RMB",
    "Total SGD",
    "Status",
    "Action",
    "Cover photo URL",
  ];
  const rows = items.map((item) => [
    item.category,
    item.itemName,
    item.description,
    item.locations.join(" / "),
    item.lightingSpecifications?.watt || "",
    item.lightingSpecifications?.fittingColour || "",
    item.lightingSpecifications?.colourTemperature || "",
    item.lightingSpecifications?.cutOutSize || "",
    item.purchaseResponsibility,
    String(item.quantity),
    item.currency,
    String(item.currency === "SGD" ? item.unitPriceSGD : item.unitPriceRMB),
    item.currency === "SGD" ? "" : String(item.totalRMB),
    String(item.totalSGD),
    item.purchaseStatus,
    item.action || "",
    item.coverImageUrl || "",
  ]);
  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  return [headers, ...rows]
    .map((row) => row.map((cell) => escape(String(cell))).join(","))
    .join("\n");
}
