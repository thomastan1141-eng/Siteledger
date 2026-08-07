"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AUTH_BYPASS } from "@/lib/demo";
import { consumeLogoutReason } from "@/lib/session";
import { AuthShell } from "@/components/auth-shell";
import {
  SiteButton,
  SiteField,
  SiteInput,
  SiteSpinner,
} from "@/components/progress/primitives";

function postLoginPath(next: string | null, mustChangePassword?: boolean) {
  if (mustChangePassword) return "/set-password";
  if (next) return next;
  return "/dashboard";
}

function LoginForm() {
  const {
    login,
    profile,
    loading,
    user,
    needsEmailVerification,
    needsOnboarding,
    needsPasswordChange,
  } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const reason = consumeLogoutReason();
    const banner =
      reason === "inactive"
        ? "You were signed out because your session was inactive."
        : reason === "expired"
          ? "Your trusted session expired. Please sign in again."
          : "";
    if (!banner) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot logout banner
    setInfo(banner);
  }, []);

  useEffect(() => {
    if (AUTH_BYPASS) {
      router.replace("/dashboard");
      return;
    }
    if (loading) return;
    if (!user) return;
    if (needsPasswordChange) {
      router.replace("/set-password");
      return;
    }
    if (needsEmailVerification || needsOnboarding) {
      router.replace("/verify-email");
      return;
    }
    if (profile) {
      router.replace(postLoginPath(params.get("next")));
    }
  }, [
    loading,
    user,
    profile,
    needsEmailVerification,
    needsOnboarding,
    needsPasswordChange,
    router,
    params,
  ]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const p = await login(email.trim(), password, { trustDevice });
      const { getFirebaseAuth } = await import("@/lib/firebase");
      const current = getFirebaseAuth().currentUser;
      if (p?.mustChangePassword) {
        router.replace("/set-password");
        return;
      }
      if (!current?.emailVerified) {
        router.replace("/verify-email");
        return;
      }
      if (!p || !p.onboardingComplete) {
        router.replace("/verify-email");
        return;
      }
      router.replace(postLoginPath(params.get("next"), p.mustChangePassword));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  if (
    AUTH_BYPASS ||
    (!loading &&
      user &&
      profile &&
      !needsEmailVerification &&
      !needsOnboarding &&
      !needsPasswordChange)
  ) {
    return <SiteSpinner label="Opening workspace…" />;
  }

  return (
    <AuthShell description="Sign in to manage your projects, site updates, media and purchases.">
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
        <SiteField label="Email">
          <SiteInput
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </SiteField>
        <SiteField label="Password">
          <SiteInput
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </SiteField>
        <label
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={trustDevice}
            onChange={(e) => setTrustDevice(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            <strong style={{ fontWeight: 650 }}>Trust this device</strong>
            <br />
            <span style={{ color: "var(--site-text-secondary)", fontSize: 13 }}>
              Stay signed in on this browser.
            </span>
          </span>
        </label>
        {error ? (
          <p style={{ color: "var(--site-danger)", fontSize: 14 }}>{error}</p>
        ) : null}
        {info ? (
          <p style={{ color: "var(--site-text-secondary)", fontSize: 14 }}>
            {info}
          </p>
        ) : null}
        <SiteButton type="submit" variant="accent" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </SiteButton>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            fontSize: 13,
          }}
        >
          <Link
            href="/forgot-password"
            style={{ color: "var(--site-text-secondary)" }}
          >
            Forgot password?
          </Link>
          <span style={{ color: "var(--site-text-secondary)" }}>
            New to SiteLedger?{" "}
            <Link
              href="/signup"
              style={{
                color: "var(--site-text)",
                fontWeight: 650,
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              Create an account
            </Link>
          </span>
        </div>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<SiteSpinner label="Loading…" />}>
      <LoginForm />
    </Suspense>
  );
}
