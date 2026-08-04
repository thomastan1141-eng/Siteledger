"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AUTH_BYPASS } from "@/lib/demo";
import { AuthShell } from "@/components/auth-shell";
import {
  SiteButton,
  SiteField,
  SiteInput,
  SiteSpinner,
} from "@/components/progress/primitives";

function postLoginPath(
  profileRole: string | undefined,
  next: string | null,
) {
  if (next) return next;
  return profileRole === "client" ? "/client" : "/dashboard";
}

function LoginForm() {
  const {
    login,
    profile,
    loading,
    user,
    needsEmailVerification,
    needsOnboarding,
  } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (AUTH_BYPASS) {
      router.replace("/dashboard");
      return;
    }
    if (loading) return;
    if (!user) return;
    if (needsEmailVerification || needsOnboarding) {
      router.replace("/verify-email");
      return;
    }
    if (profile) {
      router.replace(postLoginPath(profile.role, params.get("next")));
    }
  }, [
    loading,
    user,
    profile,
    needsEmailVerification,
    needsOnboarding,
    router,
    params,
  ]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const p = await login(email.trim(), password);
      // Auth state effect will route; keep a direct path for UX.
      const { getFirebaseAuth } = await import("@/lib/firebase");
      const current = getFirebaseAuth().currentUser;
      if (!current?.emailVerified && (!p || p.role !== "client")) {
        router.replace("/verify-email");
        return;
      }
      if (p && p.role !== "client" && !p.onboardingComplete) {
        router.replace("/verify-email");
        return;
      }
      if (!p) {
        router.replace("/verify-email");
        return;
      }
      router.replace(postLoginPath(p.role, params.get("next")));
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
      !needsOnboarding)
  ) {
    return <SiteSpinner label="Opening workspace…" />;
  }

  return (
    <AuthShell
      title="Sign in"
      description="Access your studio workspace and project journals."
    >
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
        {error ? (
          <p style={{ color: "var(--site-danger)", fontSize: 14 }}>{error}</p>
        ) : null}
        <SiteButton type="submit" variant="accent" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </SiteButton>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
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
            <Link href="/signup" style={{ color: "inherit", fontWeight: 600 }}>
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
