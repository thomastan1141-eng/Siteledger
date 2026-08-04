/** Client-side session mode helpers (no secrets / tokens stored). */

export const TRUSTED_UNTIL_KEY = "siteledgerTrustedUntil";
export const SESSION_MODE_KEY = "siteledgerSessionMode";
export const LOGOUT_REASON_KEY = "siteledgerLogoutReason";
export const AUTH_BROADCAST = "siteledger-auth";

export const TRUSTED_DAYS = 14;
export const INACTIVITY_MS = 30 * 60 * 1000;
export const INACTIVITY_WARN_MS = 28 * 60 * 1000;

export type SessionMode = "trusted" | "session";
export type LogoutReason = "inactive" | "expired" | "manual" | "revoked";

export function setSessionMode(mode: SessionMode) {
  if (typeof window === "undefined") return;
  if (mode === "trusted") {
    const until = Date.now() + TRUSTED_DAYS * 24 * 60 * 60 * 1000;
    window.localStorage.setItem(SESSION_MODE_KEY, "trusted");
    window.localStorage.setItem(TRUSTED_UNTIL_KEY, String(until));
    window.sessionStorage.removeItem(SESSION_MODE_KEY);
  } else {
    window.sessionStorage.setItem(SESSION_MODE_KEY, "session");
    window.localStorage.removeItem(SESSION_MODE_KEY);
    window.localStorage.removeItem(TRUSTED_UNTIL_KEY);
  }
}

export function getSessionMode(): SessionMode | null {
  if (typeof window === "undefined") return null;
  if (window.localStorage.getItem(SESSION_MODE_KEY) === "trusted") {
    return "trusted";
  }
  if (window.sessionStorage.getItem(SESSION_MODE_KEY) === "session") {
    return "session";
  }
  // Legacy local sessions without marker — treat as trusted-like local restore.
  if (window.localStorage.getItem(TRUSTED_UNTIL_KEY)) return "trusted";
  return null;
}

export function isTrustedSessionExpired(): boolean {
  if (typeof window === "undefined") return false;
  if (getSessionMode() !== "trusted") return false;
  const raw = window.localStorage.getItem(TRUSTED_UNTIL_KEY);
  if (!raw) return true;
  const until = Number(raw);
  if (!Number.isFinite(until)) return true;
  return Date.now() > until;
}

export function clearSessionMarkers() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TRUSTED_UNTIL_KEY);
  window.localStorage.removeItem(SESSION_MODE_KEY);
  window.sessionStorage.removeItem(SESSION_MODE_KEY);
}

export function setLogoutReason(reason: LogoutReason) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(LOGOUT_REASON_KEY, reason);
}

export function consumeLogoutReason(): LogoutReason | null {
  if (typeof window === "undefined") return null;
  const reason = window.sessionStorage.getItem(LOGOUT_REASON_KEY);
  window.sessionStorage.removeItem(LOGOUT_REASON_KEY);
  if (
    reason === "inactive" ||
    reason === "expired" ||
    reason === "manual" ||
    reason === "revoked"
  ) {
    return reason;
  }
  return null;
}

export function broadcastAuthEvent(type: "logout" | "login") {
  if (typeof window === "undefined") return;
  try {
    const channel = new BroadcastChannel(AUTH_BROADCAST);
    channel.postMessage({ type, at: Date.now() });
    channel.close();
  } catch {
    window.localStorage.setItem(
      `${AUTH_BROADCAST}:ping`,
      JSON.stringify({ type, at: Date.now() }),
    );
  }
}

export function generateTemporaryPassword(length = 12) {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}
