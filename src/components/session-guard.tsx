"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AUTH_BYPASS } from "@/lib/demo";
import {
  AUTH_BROADCAST,
  INACTIVITY_MS,
  INACTIVITY_WARN_MS,
  getSessionMode,
  isTrustedSessionExpired,
  setLogoutReason,
} from "@/lib/session";
import { SiteButton } from "@/components/progress/primitives";

const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/verify-email",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function SessionGuard({ children }: { children: React.ReactNode }) {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [warnOpen, setWarnOpen] = useState(false);
  const lastActivity = useRef(0);
  const warnShown = useRef(false);

  useEffect(() => {
    if (AUTH_BYPASS || loading) return;
    if (!user) return;
    if (getSessionMode() === "trusted" && isTrustedSessionExpired()) {
      setLogoutReason("expired");
      void logout().then(() => router.replace("/login"));
    }
  }, [user, loading, logout, router]);

  useEffect(() => {
    if (AUTH_BYPASS) return;
    let channel: BroadcastChannel | null = null;
    const onMessage = (data: { type?: string }) => {
      if (data?.type === "logout") {
        setLogoutReason("manual");
        void logout().then(() => {
          if (!isPublicPath(pathname)) router.replace("/login");
        });
      }
    };
    try {
      channel = new BroadcastChannel(AUTH_BROADCAST);
      channel.onmessage = (ev) => onMessage(ev.data || {});
    } catch {
      /* ignore */
    }
    const onStorage = (ev: StorageEvent) => {
      if (ev.key !== `${AUTH_BROADCAST}:ping` || !ev.newValue) return;
      try {
        onMessage(JSON.parse(ev.newValue) as { type?: string });
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      channel?.close();
      window.removeEventListener("storage", onStorage);
    };
  }, [logout, pathname, router]);

  useEffect(() => {
    if (AUTH_BYPASS || loading || !user) return;
    if (getSessionMode() !== "session") return;
    if (isPublicPath(pathname)) return;

    lastActivity.current = Date.now();
    warnShown.current = false;
    // Reset warning UI when session-mode monitoring starts.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- session monitor reset
    setWarnOpen(false);

    let throttleAt = 0;
    const bump = () => {
      const now = Date.now();
      if (now - throttleAt < 1000) return;
      throttleAt = now;
      lastActivity.current = now;
      if (warnShown.current) {
        warnShown.current = false;
        setWarnOpen(false);
      }
    };

    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "touchstart",
      "scroll",
      "focus",
    ];
    events.forEach((name) =>
      window.addEventListener(name, bump, { passive: true }),
    );

    const timer = window.setInterval(() => {
      if (getSessionMode() !== "session") return;
      const idle = Date.now() - lastActivity.current;
      if (idle >= INACTIVITY_MS) {
        setLogoutReason("inactive");
        void logout().then(() => router.replace("/login"));
        return;
      }
      if (idle >= INACTIVITY_WARN_MS && !warnShown.current) {
        warnShown.current = true;
        setWarnOpen(true);
      }
    }, 15_000);

    return () => {
      events.forEach((name) => window.removeEventListener(name, bump));
      window.clearInterval(timer);
    };
  }, [user, loading, pathname, logout, router]);

  return (
    <>
      {children}
      {warnOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="session-expiring-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(20, 22, 20, 0.45)",
            display: "grid",
            placeItems: "center",
            zIndex: 80,
            padding: 20,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 420,
              background: "var(--site-surface, #fff)",
              border: "1px solid var(--site-border)",
              borderRadius: 12,
              padding: 22,
            }}
          >
            <h2
              id="session-expiring-title"
              style={{ margin: 0, fontSize: 20, fontWeight: 650 }}
            >
              Session expiring
            </h2>
            <p
              style={{
                margin: "10px 0 18px",
                color: "var(--site-text-secondary)",
                fontSize: 14,
              }}
            >
              You will be signed out in 2 minutes due to inactivity.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <SiteButton
                type="button"
                variant="accent"
                onClick={() => {
                  lastActivity.current = Date.now();
                  warnShown.current = false;
                  setWarnOpen(false);
                }}
              >
                Stay signed in
              </SiteButton>
              <SiteButton
                type="button"
                variant="ghost"
                onClick={() => {
                  setLogoutReason("manual");
                  void logout().then(() => router.replace("/login"));
                }}
              >
                Sign out now
              </SiteButton>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
