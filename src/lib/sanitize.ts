/**
 * Recursively remove undefined and normalise blank optional values
 * before every Firestore write. Never pass undefined to Firestore.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

/** Trim strings; blank → null. Preserve false/0. Drop undefined keys. */
export function sanitizeForFirestore<T>(input: T): T {
  return sanitizeValue(input) as T;
}

function sanitizeValue(value: unknown): unknown {
  if (value === undefined) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value;
  }

  // Firestore Timestamp / FieldValue — leave as-is
  if (
    typeof value === "object" &&
    value !== null &&
    ("toDate" in value ||
      "isEqual" in value ||
      "_methodName" in value ||
      "seconds" in value)
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (child === undefined) {
        out[key] = null;
        continue;
      }
      out[key] = sanitizeValue(child);
    }
    return out;
  }

  return value;
}

/** Optional string for forms: trim or null. */
export function optionalString(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

/** YYYY-MM-DD or empty → string | null; throws if invalid non-empty. */
export function optionalDateString(value?: string | null): string | null {
  const raw = optionalString(value);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error(`Invalid date: ${raw}`);
  }
  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${raw}`);
  }
  return raw;
}
