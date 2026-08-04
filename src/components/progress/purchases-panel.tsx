"use client";

import {
  FormEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  ImagePlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  SiteButton,
  SiteField,
  SiteInput,
  SiteSelect,
  SiteTextarea,
} from "@/components/progress/primitives";
import { useAuth } from "@/lib/auth-context";
import {
  calcRmbSgdTotals,
  emptyLightingSpecs,
  formatLightingSpecs,
  formatRmb,
  formatSgd,
  parseMoney,
} from "@/lib/money";
import {
  canManagePurchase,
  createPurchase,
  deletePurchase,
  duplicatePurchase,
  exportPurchasesCsv,
  listPurchases,
  recalculatePurchaseTotals,
  removePurchasePhoto,
  summarizeCategory,
  updatePurchase,
  uploadPurchasePhotos,
  type PurchaseInput,
} from "@/lib/services/purchases";
import { updateProject } from "@/lib/services/projects";
import type {
  AppUser,
  LightingSpecifications,
  Project,
  PurchaseCategory,
  PurchaseItem,
  PurchasePhoto,
  PurchaseResponsibility,
  PurchaseStatus,
} from "@/lib/types";
import {
  DEFAULT_PURCHASE_LOCATIONS,
  DEFAULT_RMB_TO_SGD_RATE,
  PURCHASE_CATEGORY_LABELS,
  PURCHASE_RESPONSIBILITY_LABELS,
  PURCHASE_STATUS_LABELS,
} from "@/lib/types";

const CATEGORIES: PurchaseCategory[] = [
  "LIGHTING",
  "KITCHEN_APPLIANCES",
  "BATHROOM_SANITARY",
];

type SaveState = "" | "saving" | "saved" | "error";

type PendingPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

function defaultForm(
  category: PurchaseCategory,
  asOwner: boolean,
): PurchaseInput {
  return {
    category,
    itemName: "",
    description: "",
    locations: [],
    lightingSpecifications:
      category === "LIGHTING" ? emptyLightingSpecs() : undefined,
    purchaseResponsibility: asOwner ? "OWNER" : "STUDIO",
    quantity: 1,
    unitPriceRMB: 0,
    purchaseStatus: "TO_CONFIRM",
    action: "",
    photos: [],
    coverImageUrl: "",
  };
}

function summarizeLocations(locations: string[]) {
  if (!locations.length) return { preview: "—", extra: 0 };
  if (locations.length <= 2) {
    return { preview: locations.join(" / "), extra: 0 };
  }
  return {
    preview: `${locations[0]} / ${locations[1]}`,
    extra: locations.length - 2,
  };
}

export function PurchasesPanel({
  project,
  onProjectUpdated,
  clientMode = false,
}: {
  project: Project;
  onProjectUpdated?: (project: Project) => void;
  clientMode?: boolean;
}) {
  const { profile } = useAuth();
  const [category, setCategory] = useState<PurchaseCategory>("LIGHTING");
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseItem | null>(null);
  const [gallery, setGallery] = useState<PurchaseItem | null>(null);
  const [saveHint, setSaveHint] = useState<SaveState>("");
  const [error, setError] = useState("");
  const [rateDraft, setRateDraft] = useState(
    String(project.purchaseSettings?.rmbToSgdRate ?? DEFAULT_RMB_TO_SGD_RATE),
  );
  const [rateDirty, setRateDirty] = useState(false);

  const rate =
    project.purchaseSettings?.rmbToSgdRate ?? DEFAULT_RMB_TO_SGD_RATE;
  const purchaseWs = project.workspaceId || project.companyId;
  const canEditRate =
    !clientMode && (profile?.role === "admin" || profile?.role === "staff");
  const rateValue = rateDirty ? rateDraft : String(rate);
  const expandTable = !clientMode;

  async function reload(active = category) {
    const list = await listPurchases(project.id, {
      category: active,
      rmbToSgdRate: rate,
      workspaceId: purchaseWs,
    });
    setItems(list);
  }

  useEffect(() => {
    let cancelled = false;
    listPurchases(project.id, { category, rmbToSgdRate: rate, workspaceId: purchaseWs }).then((list) => {
      if (cancelled) return;
      setItems(list);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [project.id, category, rate]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const hay = `${item.itemName}\n${item.description}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, search]);

  const summary = useMemo(() => summarizeCategory(filtered), [filtered]);

  function flash(state: SaveState) {
    setSaveHint(state);
    if (state === "saved") {
      window.setTimeout(() => setSaveHint(""), 1200);
    }
  }

  async function patchItem(item: PurchaseItem, patch: Partial<PurchaseInput>) {
    if (!profile) return;
    flash("saving");
    try {
      const next = await updatePurchase(
        project.id,
        item.id,
        patch,
        profile,
        rate,
        purchaseWs,
      );
      setItems((prev) => prev.map((p) => (p.id === next.id ? next : p)));
      if (gallery?.id === next.id) setGallery(next);
      flash("saved");
    } catch (err) {
      flash("error");
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function saveRate() {
    if (!profile || !canEditRate) return;
    const nextRate = parseMoney(rateDirty ? rateDraft : String(rate));
    if (nextRate <= 0) {
      setError("Exchange rate must be greater than 0.");
      return;
    }
    flash("saving");
    try {
      const updated = await updateProject(project.id, {
        purchaseSettings: { rmbToSgdRate: nextRate },
      });
      onProjectUpdated?.(updated);
      await recalculatePurchaseTotals(project.id, nextRate, profile, purchaseWs);
      setRateDirty(false);
      await reload(category);
      flash("saved");
    } catch (err) {
      flash("error");
      setError(err instanceof Error ? err.message : "Rate save failed");
    }
  }

  function downloadCsv() {
    const csv = exportPurchasesCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `purchases-${category.toLowerCase()}-${project.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className="site-purchases"
      data-full-table={expandTable ? "true" : "false"}
    >
      <div className="site-purchase-rate-row">
        <label>
          RMB to SGD rate:
          {canEditRate ? (
            <input
              className="site-purchase-rate-input"
              type="number"
              min={0}
              step="0.01"
              value={rateValue}
              onChange={(e) => {
                setRateDirty(true);
                setRateDraft(e.target.value);
              }}
              onBlur={() => void saveRate()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void saveRate();
                }
              }}
            />
          ) : (
            <strong style={{ marginLeft: 8 }}>{rate}</strong>
          )}
        </label>
        {saveHint ? (
          <span className="site-purchase-save" data-state={saveHint}>
            {saveHint === "saving"
              ? "Saving…"
              : saveHint === "saved"
                ? "Saved"
                : "Error"}
          </span>
        ) : null}
      </div>

      <div className="site-purchase-tabs" role="tablist">
        {CATEGORIES.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            className="site-chip"
            data-active={category === key}
            aria-selected={category === key}
            onClick={() => {
              setCategory(key);
              setLoading(true);
            }}
          >
            {PURCHASE_CATEGORY_LABELS[key]}
          </button>
        ))}
      </div>

      <div className="site-purchase-summary-simple">
        <strong>{PURCHASE_CATEGORY_LABELS[category]}</strong>
        <span>{summary.count} items</span>
        <span>Total RMB {formatRmb(summary.totalRMB)}</span>
        <span>Total SGD {formatSgd(summary.totalSGD)}</span>
        <span>Rate {rate}</span>
      </div>

      <div className="site-purchase-toolbar">
        <div className="site-purchase-search">
          <Search size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search item name or description…"
          />
        </div>
        <SiteButton type="button" variant="ghost" onClick={downloadCsv}>
          Export CSV
        </SiteButton>
        <SiteButton
          type="button"
          variant="accent"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus size={16} /> Add item
        </SiteButton>
      </div>

      {error ? (
        <p style={{ color: "var(--site-danger)", fontSize: 13 }}>{error}</p>
      ) : null}

      {loading ? (
        <p className="site-3d-empty">Loading…</p>
      ) : !filtered.length ? (
        <div className="site-empty">
          <strong>No items in {PURCHASE_CATEGORY_LABELS[category]}</strong>
          <p style={{ marginTop: 8 }}>Add products for this sheet.</p>
        </div>
      ) : (
        <>
          <div className="site-purchase-desktop">
            <div className="purchase-table-full-width">
              <div className="purchase-table-scroll site-purchase-table-wrap">
                <table
                  className={
                    category === "LIGHTING"
                      ? "site-purchase-table site-purchase-table-simple is-lighting"
                      : "site-purchase-table site-purchase-table-simple is-simple"
                  }
                >
                  <colgroup>
                    <col className="col-photo" />
                    <col className="col-item" />
                    <col className="col-desc" />
                    <col className="col-location" />
                    {category === "LIGHTING" ? (
                      <col className="col-specs" />
                    ) : null}
                    <col className="col-by" />
                    <col className="col-qty" />
                    <col className="col-unit" />
                    <col className="col-rmb" />
                    <col className="col-sgd" />
                    <col className="col-status" />
                    <col className="col-action" />
                    <col className="col-more" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Photo</th>
                      <th>Item</th>
                      <th>Description</th>
                      <th>Location</th>
                      {category === "LIGHTING" ? (
                        <th>Specifications</th>
                      ) : null}
                      <th>Purchased by</th>
                      <th>Quantity</th>
                      <th>Unit Price RMB</th>
                      <th>Total RMB</th>
                      <th>Total SGD</th>
                      <th>Status</th>
                      <th>Action</th>
                      <th>More</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item) => (
                      <PurchaseRow
                        key={item.id}
                        item={item}
                        showLightingSpecs={category === "LIGHTING"}
                        user={profile}
                        rate={rate}
                        onGallery={() => setGallery(item)}
                        onEdit={() => {
                          setEditing(item);
                          setFormOpen(true);
                        }}
                        onPatch={(patch) => patchItem(item, patch)}
                        onDuplicate={async () => {
                          if (!profile) return;
                          await duplicatePurchase(
                            project.id,
                            item.id,
                            profile,
                            rate,
                            purchaseWs,
                          );
                          await reload();
                        }}
                        onDelete={async () => {
                          if (!profile) return;
                          if (!confirm(`Delete “${item.itemName}”?`)) return;
                          await deletePurchase(project.id, item.id, profile, purchaseWs);
                          await reload();
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="site-purchase-mobile">
            {filtered.map((item) => (
              <article key={item.id} className="site-purchase-card">
                <button
                  type="button"
                  className="site-purchase-card-photo"
                  onClick={() => setGallery(item)}
                >
                  {item.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.coverImageUrl} alt="" />
                  ) : (
                    <span>No photo</span>
                  )}
                </button>
                <div className="site-purchase-card-body">
                  <strong>{item.itemName}</strong>
                  <div className="site-purchase-desc-preview">
                    {item.description || "—"}
                  </div>
                  <LocationSummary locations={item.locations} />
                  {item.category === "LIGHTING" &&
                  formatLightingSpecs(item.lightingSpecifications) ? (
                    <pre className="site-purchase-spec-block">
                      {formatLightingSpecs(item.lightingSpecifications)}
                    </pre>
                  ) : null}
                  <p>
                    {PURCHASE_RESPONSIBILITY_LABELS[item.purchaseResponsibility]}{" "}
                    · Qty {item.quantity}
                  </p>
                  <p>
                    {formatRmb(item.totalRMB)} · {formatSgd(item.totalSGD)}
                  </p>
                  <span
                    className="site-purchase-status"
                    data-status={item.purchaseStatus}
                  >
                    {PURCHASE_STATUS_LABELS[item.purchaseStatus]}
                  </span>
                  {item.action ? (
                    <p className="site-purchase-card-action">{item.action}</p>
                  ) : null}
                  {canManagePurchase(profile, item) ? (
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button
                        type="button"
                        className="site-chip"
                        onClick={() => {
                          setEditing(item);
                          setFormOpen(true);
                        }}
                      >
                        Edit
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {formOpen ? (
        <PurchaseFormSheet
          category={category}
          rate={rate}
          user={profile}
          initial={editing}
          clientMode={clientMode || profile?.role === "client"}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={async (draft, pending, removedIds, coverPendingId) => {
            if (!profile) return;
            let saved: PurchaseItem;
            if (editing) {
              for (const photoId of removedIds) {
                await removePurchasePhoto(
                  project.id,
                  editing.id,
                  photoId,
                  profile,
                  rate,
                  purchaseWs,
                );
              }
              saved = await updatePurchase(
                project.id,
                editing.id,
                draft,
                profile,
                rate,
                purchaseWs,
              );
            } else {
              saved = await createPurchase(
                project.id,
                { ...draft, category },
                profile,
                rate,
                purchaseWs,
              );
            }
            if (pending.length) {
              const beforeCount = saved.photos.length;
              saved = await uploadPurchasePhotos(
                project.id,
                saved.id,
                pending.map((p) => p.file),
                profile,
                rate,
                undefined,
                purchaseWs,
              );
              if (coverPendingId) {
                const idx = pending.findIndex((p) => p.id === coverPendingId);
                const coverPhoto =
                  idx >= 0 ? saved.photos[beforeCount + idx] : undefined;
                if (coverPhoto?.url) {
                  saved = await updatePurchase(
                    project.id,
                    saved.id,
                    { coverImageUrl: coverPhoto.url },
                    profile,
                    rate,
                    purchaseWs,
                  );
                }
              }
            }
            setFormOpen(false);
            setEditing(null);
            await reload();
          }}
        />
      ) : null}

      {gallery ? (
        <PurchaseGallery
          item={gallery}
          user={profile}
          projectId={project.id}
          rate={rate}
          onClose={() => setGallery(null)}
          onChanged={async () => {
            await reload();
            const next = (
              await listPurchases(project.id, { rmbToSgdRate: rate, workspaceId: purchaseWs })
            ).find((p) => p.id === gallery.id);
            if (next) setGallery(next);
          }}
        />
      ) : null}
    </div>
  );
}

function LocationSummary({ locations }: { locations: string[] }) {
  const { preview, extra } = summarizeLocations(locations);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const canExpand = locations.length > 0;

  function place() {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = 240;
    const left = Math.min(
      Math.max(12, rect.left),
      window.innerWidth - width - 12,
    );
    const top = Math.min(rect.bottom + 8, window.innerHeight - 12);
    setCoords({ top, left });
  }

  function openPopover() {
    if (!canExpand) return;
    place();
    setOpen(true);
  }

  function closePopover() {
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onScroll() {
      place();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open) closePopover();
      else openPopover();
    } else if (e.key === "Escape") {
      closePopover();
    }
  }

  const label = locations.length
    ? `${locations.length} locations: ${locations.join(", ")}`
    : "No locations";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="site-purchase-location-summary"
        aria-expanded={open}
        aria-describedby={open ? labelId : undefined}
        aria-label={label}
        disabled={!canExpand}
        onMouseEnter={() => {
          if (window.matchMedia("(hover: hover)").matches) openPopover();
        }}
        onMouseLeave={(e) => {
          if (!window.matchMedia("(hover: hover)").matches) return;
          const next = e.relatedTarget as Node | null;
          if (popoverRef.current?.contains(next)) return;
          closePopover();
        }}
        onClick={() => {
          if (window.matchMedia("(hover: hover)").matches) return;
          if (open) closePopover();
          else openPopover();
        }}
        onKeyDown={onKeyDown}
      >
        {preview}
        {extra > 0 ? (
          <span className="site-purchase-location-extra"> +{extra}</span>
        ) : null}
      </button>
      {open && coords && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              id={labelId}
              role="tooltip"
              className="site-purchase-location-popover"
              style={{ top: coords.top, left: coords.left }}
              onMouseEnter={() => setOpen(true)}
              onMouseLeave={closePopover}
            >
              <ul>
                {locations.map((loc) => (
                  <li key={loc}>{loc}</li>
                ))}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function PurchaseRow({
  item,
  showLightingSpecs,
  user,
  rate,
  onGallery,
  onEdit,
  onPatch,
  onDuplicate,
  onDelete,
}: {
  item: PurchaseItem;
  showLightingSpecs: boolean;
  user?: AppUser | null;
  rate: number;
  onGallery: () => void;
  onEdit: () => void;
  onPatch: (patch: Partial<PurchaseInput>) => void | Promise<void>;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const editable = canManagePurchase(user, item);
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionSaving, setActionSaving] = useState(false);
  const live = calcRmbSgdTotals({
    quantity: item.quantity,
    unitPriceRMB: item.unitPriceRMB,
    rmbToSgdRate: rate,
  });
  const lightingText = formatLightingSpecs(item.lightingSpecifications);

  return (
    <tr>
      <td>
        <button
          type="button"
          className="site-purchase-thumb"
          onClick={onGallery}
        >
          {item.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.coverImageUrl} alt="" />
          ) : (
            <span>No photo</span>
          )}
        </button>
      </td>
      <td>
        <strong className="site-purchase-item-name">{item.itemName}</strong>
      </td>
      <td className="site-purchase-desc-cell">
        <div className="site-purchase-desc-preview">
          {item.description || "—"}
        </div>
      </td>
      <td className="site-purchase-location-cell">
        <LocationSummary locations={item.locations} />
      </td>
      {showLightingSpecs ? (
        <td className="site-purchase-spec-cell">
          <pre className="site-purchase-spec-block">
            {lightingText || "—"}
          </pre>
        </td>
      ) : null}
      <td>
        {editable && user?.role !== "client" ? (
          <select
            className="site-purchase-inline"
            value={item.purchaseResponsibility}
            onChange={(e) =>
              onPatch({
                purchaseResponsibility: e.target
                  .value as PurchaseResponsibility,
              })
            }
          >
            <option value="STUDIO">Studio</option>
            <option value="OWNER">Owner</option>
          </select>
        ) : (
          PURCHASE_RESPONSIBILITY_LABELS[item.purchaseResponsibility]
        )}
      </td>
      <td className="site-purchase-qty-cell">
        {editable ? (
          <input
            className="site-purchase-inline site-purchase-qty"
            type="number"
            min={0}
            step={1}
            defaultValue={item.quantity}
            key={`qty-${item.id}-${item.quantity}`}
            onBlur={(e) => {
              const quantity = parseMoney(e.target.value);
              if (quantity !== item.quantity) onPatch({ quantity });
            }}
          />
        ) : (
          item.quantity
        )}
      </td>
      <td>
        {editable ? (
          <input
            className="site-purchase-inline site-purchase-price"
            type="number"
            min={0}
            step="any"
            defaultValue={item.unitPriceRMB}
            key={`price-${item.id}-${item.unitPriceRMB}`}
            onBlur={(e) => {
              const unitPriceRMB = parseMoney(e.target.value);
              if (unitPriceRMB !== item.unitPriceRMB) onPatch({ unitPriceRMB });
            }}
          />
        ) : (
          formatRmb(item.unitPriceRMB)
        )}
      </td>
      <td>{formatRmb(live.totalRMB)}</td>
      <td>{formatSgd(live.totalSGD)}</td>
      <td>
        {editable ? (
          <select
            className="site-purchase-inline site-purchase-status-select"
            value={item.purchaseStatus}
            onChange={(e) =>
              onPatch({ purchaseStatus: e.target.value as PurchaseStatus })
            }
          >
            {Object.entries(PURCHASE_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        ) : (
          <span
            className="site-purchase-status"
            data-status={item.purchaseStatus}
          >
            {PURCHASE_STATUS_LABELS[item.purchaseStatus]}
          </span>
        )}
      </td>
      <td>
        {editable ? (
          <div className="site-purchase-action-wrap">
            <input
              className="site-purchase-inline site-purchase-action-input"
              defaultValue={item.action || ""}
              key={`action-${item.id}-${item.action || ""}`}
              placeholder="Next action…"
              onBlur={async (e) => {
                const action = e.target.value.trim();
                if (action === (item.action || "")) return;
                setActionSaving(true);
                await onPatch({ action });
                setActionSaving(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
            {actionSaving ? (
              <span className="site-purchase-action-saving">Saving…</span>
            ) : null}
          </div>
        ) : (
          item.action || "—"
        )}
      </td>
      <td className="site-purchase-more">
        <button
          type="button"
          className="site-chip"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="More"
        >
          <MoreHorizontal size={14} />
        </button>
        {menuOpen ? (
          <div className="site-purchase-menu">
            {editable ? (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onEdit();
                }}
              >
                <Pencil size={13} /> Edit
              </button>
            ) : null}
            {user?.role === "admin" || user?.role === "staff" ? (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  void onDuplicate();
                }}
              >
                <Copy size={13} /> Duplicate
              </button>
            ) : null}
            {user?.role === "admin" || user?.role === "staff" ? (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  void onDelete();
                }}
              >
                <Trash2 size={13} /> Delete
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onGallery();
              }}
            >
              View photos
            </button>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

function LocationPicker({
  value,
  onChange,
  allowCustom,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  allowCustom: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const selected = new Set(value);
  const rootRef = useRef<HTMLDivElement>(null);

  function toggle(loc: string) {
    if (selected.has(loc)) {
      onChange(value.filter((v) => v !== loc));
    } else {
      onChange([...value, loc]);
    }
  }

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const triggerLabel = !value.length
    ? "Select locations…"
    : value.length <= 2
      ? value.join(" / ")
      : `${value.length} locations selected`;

  return (
    <div className="site-purchase-locations" ref={rootRef}>
      <button
        type="button"
        className="site-purchase-location-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {triggerLabel}
      </button>
      {value.length ? (
        <div className="site-purchase-location-tags">
          {value.map((loc) => (
            <button
              key={loc}
              type="button"
              className="site-purchase-location-tag"
              onClick={() => onChange(value.filter((v) => v !== loc))}
              aria-label={`Remove ${loc}`}
            >
              {loc}
              <X size={12} />
            </button>
          ))}
        </div>
      ) : null}
      {open ? (
        <div className="site-purchase-location-panel">
          <div className="site-purchase-location-grid">
            {DEFAULT_PURCHASE_LOCATIONS.map((loc) => (
              <label key={loc} className="site-stage-check">
                <input
                  type="checkbox"
                  checked={selected.has(loc)}
                  onChange={() => toggle(loc)}
                />
                <span>{loc}</span>
              </label>
            ))}
          </div>
          {allowCustom && selected.has("Others") ? (
            <div className="site-purchase-custom-loc">
              <SiteInput
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Custom location"
              />
              <SiteButton
                type="button"
                variant="soft"
                onClick={() => {
                  const name = custom.trim();
                  if (!name) return;
                  if (!value.includes(name)) onChange([...value, name]);
                  setCustom("");
                }}
              >
                Add location
              </SiteButton>
            </div>
          ) : null}
          <SiteButton
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
          >
            Done
          </SiteButton>
        </div>
      ) : null}
    </div>
  );
}

function PhotoField({
  existing,
  coverImageUrl,
  pending,
  onExistingChange,
  onCoverChange,
  onPendingChange,
}: {
  existing: PurchasePhoto[];
  coverImageUrl?: string;
  pending: PendingPhoto[];
  onExistingChange: (photos: PurchasePhoto[]) => void;
  onCoverChange: (url: string, pendingId?: string | null) => void;
  onPendingChange: (photos: PendingPhoto[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function moveExisting(index: number, delta: number) {
    const next = [...existing];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [row] = next.splice(index, 1);
    next.splice(target, 0, row);
    onExistingChange(next);
  }

  function movePending(index: number, delta: number) {
    const next = [...pending];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [row] = next.splice(index, 1);
    next.splice(target, 0, row);
    onPendingChange(next);
  }

  function removePending(id: string) {
    const target = pending.find((p) => p.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    const next = pending.filter((p) => p.id !== id);
    onPendingChange(next);
    if (target && coverImageUrl === target.previewUrl) {
      if (existing[0]) onCoverChange(existing[0].url, null);
      else if (next[0]) onCoverChange(next[0].previewUrl, next[0].id);
      else onCoverChange("", null);
    }
  }

  return (
    <div className="site-purchase-photo-field">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (!files.length) return;
          const added: PendingPhoto[] = files.map((file) => ({
            id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            file,
            previewUrl: URL.createObjectURL(file),
          }));
          onPendingChange([...pending, ...added]);
          if (!coverImageUrl && !existing.length && added[0]) {
            onCoverChange(added[0].previewUrl, added[0].id);
          }
          e.target.value = "";
        }}
      />
      <div className="site-purchase-photo-actions">
        <SiteButton
          type="button"
          variant="soft"
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus size={16} /> Upload photos
        </SiteButton>
        {pending.length ? (
          <span className="site-purchase-muted">
            {pending.length} photo{pending.length === 1 ? "" : "s"} selected
          </span>
        ) : null}
      </div>
      {existing.length || pending.length ? (
        <div className="site-purchase-photo-grid">
          {existing.map((photo, index) => (
            <PhotoThumb
              key={photo.id}
              url={photo.url}
              isCover={coverImageUrl === photo.url}
              onCover={() => onCoverChange(photo.url, null)}
              onRemove={() => {
                const next = existing.filter((p) => p.id !== photo.id);
                onExistingChange(next);
                if (coverImageUrl === photo.url) {
                  if (next[0]) onCoverChange(next[0].url, null);
                  else if (pending[0])
                    onCoverChange(pending[0].previewUrl, pending[0].id);
                  else onCoverChange("", null);
                }
              }}
              onLeft={() => moveExisting(index, -1)}
              onRight={() => moveExisting(index, 1)}
              canLeft={index > 0}
              canRight={index < existing.length - 1}
            />
          ))}
          {pending.map((photo, index) => (
            <PhotoThumb
              key={photo.id}
              url={photo.previewUrl}
              isCover={coverImageUrl === photo.previewUrl}
              pending
              onCover={() => onCoverChange(photo.previewUrl, photo.id)}
              onRemove={() => removePending(photo.id)}
              onLeft={() => movePending(index, -1)}
              onRight={() => movePending(index, 1)}
              canLeft={index > 0}
              canRight={index < pending.length - 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PhotoThumb({
  url,
  isCover,
  pending,
  onCover,
  onRemove,
  onLeft,
  onRight,
  canLeft,
  canRight,
}: {
  url: string;
  isCover: boolean;
  pending?: boolean;
  onCover: () => void;
  onRemove: () => void;
  onLeft: () => void;
  onRight: () => void;
  canLeft: boolean;
  canRight: boolean;
}) {
  return (
    <div
      className="site-purchase-photo-thumb"
      data-cover={isCover}
      data-pending={pending ? "true" : "false"}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" />
      <div className="site-purchase-photo-thumb-actions">
        <button type="button" onClick={onCover} disabled={isCover}>
          {isCover ? "Cover" : "Set cover"}
        </button>
        <button type="button" onClick={onRemove} aria-label="Remove photo">
          <Trash2 size={12} />
        </button>
        <button
          type="button"
          onClick={onLeft}
          disabled={!canLeft}
          aria-label="Move left"
        >
          <ChevronLeft size={12} />
        </button>
        <button
          type="button"
          onClick={onRight}
          disabled={!canRight}
          aria-label="Move right"
        >
          <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}

function PurchaseFormSheet({
  category,
  rate,
  user,
  initial,
  clientMode,
  onClose,
  onSaved,
}: {
  category: PurchaseCategory;
  rate: number;
  user?: AppUser | null;
  initial: PurchaseItem | null;
  clientMode: boolean;
  onClose: () => void;
  onSaved: (
    draft: PurchaseInput,
    pending: PendingPhoto[],
    removedIds: string[],
    coverPendingId: string | null,
  ) => void | Promise<void>;
}) {
  const initialPhotos = initial?.photos || [];
  const [form, setForm] = useState<PurchaseInput>(() =>
    initial
      ? {
          category: initial.category,
          itemName: initial.itemName,
          description: initial.description,
          locations: [...initial.locations],
          lightingSpecifications:
            initial.category === "LIGHTING"
              ? {
                  ...emptyLightingSpecs(),
                  ...initial.lightingSpecifications,
                }
              : undefined,
          purchaseResponsibility: initial.purchaseResponsibility,
          quantity: initial.quantity,
          unitPriceRMB: initial.unitPriceRMB,
          purchaseStatus: initial.purchaseStatus,
          action: initial.action,
          photos: [...initialPhotos],
          coverImageUrl: initial.coverImageUrl || "",
        }
      : defaultForm(category, clientMode),
  );
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [coverPendingId, setCoverPendingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const totals = calcRmbSgdTotals({
    quantity: form.quantity,
    unitPriceRMB: form.unitPriceRMB,
    rmbToSgdRate: rate,
  });
  const isLighting = category === "LIGHTING";

  useEffect(() => {
    return () => {
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setLighting<K extends keyof LightingSpecifications>(
    key: K,
    value: string,
  ) {
    setForm((s) => ({
      ...s,
      lightingSpecifications: {
        ...emptyLightingSpecs(),
        ...s.lightingSpecifications,
        [key]: value,
      },
    }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!form.itemName.trim()) {
      setError("Item name is required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const draft: PurchaseInput = {
        ...form,
        category,
        lightingSpecifications: isLighting
          ? form.lightingSpecifications || emptyLightingSpecs()
          : undefined,
        photos: form.photos || [],
        coverImageUrl: coverPendingId
          ? form.photos?.[0]?.url || ""
          : form.coverImageUrl || form.photos?.[0]?.url || "",
      };
      await onSaved(draft, pending, removedIds, coverPendingId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="site-sheet-backdrop" onClick={onClose}>
      <div
        className="site-sheet site-sheet-wide site-purchase-form-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="site-sheet-head">
          <div>
            <div className="site-page-kicker">
              {PURCHASE_CATEGORY_LABELS[category]}
            </div>
            <h3>{initial ? "Edit item" : "Add item"}</h3>
          </div>
          <SiteButton type="button" variant="ghost" onClick={onClose}>
            <X size={16} />
          </SiteButton>
        </div>
        <form className="site-sheet-body" onSubmit={onSubmit}>
          <h4 className="site-section-title">Basic information</h4>
          <SiteField label="Item name">
            <SiteInput
              value={form.itemName}
              onChange={(e) =>
                setForm((s) => ({ ...s, itemName: e.target.value }))
              }
              required
            />
          </SiteField>
          <SiteField label="Description">
            <SiteTextarea
              rows={6}
              value={form.description}
              onChange={(e) =>
                setForm((s) => ({ ...s, description: e.target.value }))
              }
              placeholder="Paste product details from Google Sheets or product pages…"
            />
          </SiteField>
          <SiteField label="Location">
            <LocationPicker
              value={form.locations}
              onChange={(locations) => setForm((s) => ({ ...s, locations }))}
              allowCustom={!clientMode}
            />
          </SiteField>
          <SiteField label="Product photos">
            <PhotoField
              existing={form.photos || []}
              coverImageUrl={
                coverPendingId
                  ? pending.find((p) => p.id === coverPendingId)?.previewUrl ||
                    form.coverImageUrl
                  : form.coverImageUrl
              }
              pending={pending}
              onExistingChange={(photos) => {
                const removed = (form.photos || [])
                  .filter((p) => !photos.some((x) => x.id === p.id))
                  .map((p) => p.id);
                if (removed.length) {
                  setRemovedIds((prev) => [...new Set([...prev, ...removed])]);
                }
                setForm((s) => ({ ...s, photos }));
              }}
              onCoverChange={(coverImageUrl, pendingId) => {
                if (pendingId) {
                  setCoverPendingId(pendingId);
                  setForm((s) => ({ ...s, coverImageUrl }));
                } else {
                  setCoverPendingId(null);
                  setForm((s) => ({ ...s, coverImageUrl }));
                }
              }}
              onPendingChange={(next) => {
                setPending(next);
                if (
                  coverPendingId &&
                  !next.some((p) => p.id === coverPendingId)
                ) {
                  setCoverPendingId(null);
                }
              }}
            />
          </SiteField>

          {isLighting ? (
            <>
              <h4 className="site-section-title">Lighting specifications</h4>
              <div className="site-purchase-lighting-grid">
                <SiteField label="Watt">
                  <SiteInput
                    list="lighting-watt"
                    value={form.lightingSpecifications?.watt || ""}
                    onChange={(e) => setLighting("watt", e.target.value)}
                    placeholder="e.g. 12W"
                  />
                  <datalist id="lighting-watt">
                    <option value="7W" />
                    <option value="12W" />
                    <option value="15W" />
                    <option value="20W" />
                  </datalist>
                </SiteField>
                <SiteField label="Fitting colour">
                  <SiteInput
                    list="lighting-fitting"
                    value={form.lightingSpecifications?.fittingColour || ""}
                    onChange={(e) =>
                      setLighting("fittingColour", e.target.value)
                    }
                    placeholder="e.g. Black"
                  />
                  <datalist id="lighting-fitting">
                    <option value="Black" />
                    <option value="White" />
                    <option value="Gold" />
                    <option value="Silver" />
                  </datalist>
                </SiteField>
                <SiteField label="Colour temperature">
                  <SiteInput
                    list="lighting-ct"
                    value={
                      form.lightingSpecifications?.colourTemperature || ""
                    }
                    onChange={(e) =>
                      setLighting("colourTemperature", e.target.value)
                    }
                    placeholder="e.g. 3000K"
                  />
                  <datalist id="lighting-ct">
                    <option value="2700K" />
                    <option value="3000K" />
                    <option value="4000K" />
                    <option value="6000K" />
                  </datalist>
                </SiteField>
                <SiteField label="Cut-out size">
                  <SiteInput
                    list="lighting-cutout"
                    value={form.lightingSpecifications?.cutOutSize || ""}
                    onChange={(e) => setLighting("cutOutSize", e.target.value)}
                    placeholder="e.g. 65mm"
                  />
                  <datalist id="lighting-cutout">
                    <option value="65mm" />
                    <option value="75mm" />
                    <option value="90mm" />
                  </datalist>
                </SiteField>
              </div>
            </>
          ) : null}

          <h4 className="site-section-title">Purchase information</h4>
          <div className="site-stage-grid">
            <SiteField label="Purchased by">
              <SiteSelect
                value={form.purchaseResponsibility}
                disabled={clientMode}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    purchaseResponsibility: e.target
                      .value as PurchaseResponsibility,
                  }))
                }
              >
                <option value="STUDIO">Studio</option>
                <option value="OWNER">Owner</option>
              </SiteSelect>
            </SiteField>
            <SiteField label="Status">
              <SiteSelect
                value={form.purchaseStatus}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    purchaseStatus: e.target.value as PurchaseStatus,
                  }))
                }
              >
                {Object.entries(PURCHASE_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </SiteSelect>
            </SiteField>
            <SiteField label="Quantity">
              <SiteInput
                type="number"
                min={0}
                step={1}
                value={form.quantity}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    quantity: parseMoney(e.target.value),
                  }))
                }
              />
            </SiteField>
            <SiteField label="Unit price RMB">
              <SiteInput
                type="number"
                min={0}
                step="any"
                value={form.unitPriceRMB}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    unitPriceRMB: parseMoney(e.target.value),
                  }))
                }
              />
            </SiteField>
          </div>
          <p className="site-purchase-calc">
            Total RMB: <strong>{formatRmb(totals.totalRMB)}</strong>
            {" · "}
            Total SGD: <strong>{formatSgd(totals.totalSGD)}</strong>
            {" · "}
            Rate {rate}
          </p>
          <SiteField label="Action">
            <SiteInput
              value={form.action || ""}
              onChange={(e) =>
                setForm((s) => ({ ...s, action: e.target.value }))
              }
              placeholder="e.g. Owner to confirm colour"
            />
          </SiteField>

          {error ? (
            <p style={{ color: "var(--site-danger)", fontSize: 13 }}>{error}</p>
          ) : null}
          <SiteButton type="submit" variant="accent" disabled={busy}>
            {busy ? "Saving…" : initial ? "Save changes" : "Add item"}
          </SiteButton>
        </form>
      </div>
    </div>
  );
}

function PurchaseGallery({
  item,
  user,
  projectId,
  rate,
  onClose,
  onChanged,
}: {
  item: PurchaseItem;
  user?: AppUser | null;
  projectId: string;
  rate: number;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const canEdit = canManagePurchase(user, item);
  const [index, setIndex] = useState(0);
  const photos = item.photos;
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="site-sheet-backdrop" onClick={onClose}>
      <div
        className="site-sheet site-sheet-wide"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="site-sheet-head">
          <div>
            <div className="site-page-kicker">Photos</div>
            <h3>{item.itemName}</h3>
          </div>
          <SiteButton type="button" variant="ghost" onClick={onClose}>
            Close
          </SiteButton>
        </div>
        <div className="site-sheet-body">
          {photos.length ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photos[index]?.url}
                alt=""
                className="site-purchase-gallery-main"
              />
              <div className="site-purchase-gallery-thumbs">
                {photos.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    data-active={i === index}
                    onClick={() => setIndex(i)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="site-3d-empty">No photos yet.</p>
          )}
          {canEdit && user ? (
            <div className="site-purchase-gallery-actions">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                hidden
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  if (!files.length) return;
                  await uploadPurchasePhotos(
                    projectId,
                    item.id,
                    files,
                    user,
                    rate,
                  );
                  await onChanged();
                  e.target.value = "";
                }}
              />
              <SiteButton
                type="button"
                variant="soft"
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus size={16} /> Upload photos
              </SiteButton>
              {photos[index] ? (
                <>
                  <SiteButton
                    type="button"
                    variant="ghost"
                    onClick={async () => {
                      await updatePurchase(
                        projectId,
                        item.id,
                        { coverImageUrl: photos[index].url },
                        user,
                        rate,
                      );
                      await onChanged();
                    }}
                  >
                    Set as cover
                  </SiteButton>
                  <SiteButton
                    type="button"
                    variant="ghost"
                    onClick={async () => {
                      await removePurchasePhoto(
                        projectId,
                        item.id,
                        photos[index].id,
                        user,
                        rate,
                      );
                      setIndex(0);
                      await onChanged();
                    }}
                  >
                    Remove photo
                  </SiteButton>
                  {index > 0 ? (
                    <SiteButton
                      type="button"
                      variant="ghost"
                      onClick={async () => {
                        const next = [...photos];
                        const [row] = next.splice(index, 1);
                        next.splice(index - 1, 0, row);
                        await updatePurchase(
                          projectId,
                          item.id,
                          { photos: next },
                          user,
                          rate,
                        );
                        setIndex(index - 1);
                        await onChanged();
                      }}
                    >
                      Move left
                    </SiteButton>
                  ) : null}
                  {index < photos.length - 1 ? (
                    <SiteButton
                      type="button"
                      variant="ghost"
                      onClick={async () => {
                        const next = [...photos];
                        const [row] = next.splice(index, 1);
                        next.splice(index + 1, 0, row);
                        await updatePurchase(
                          projectId,
                          item.id,
                          { photos: next },
                          user,
                          rate,
                        );
                        setIndex(index + 1);
                        await onChanged();
                      }}
                    >
                      Move right
                    </SiteButton>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
