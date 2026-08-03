"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PLATFORM_KICKER, PLATFORM_NAME } from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";
import { AUTH_BYPASS } from "@/lib/demo";
import {
  SiteButton,
  SiteField,
  SiteInput,
  SiteSpinner,
} from "@/components/progress/primitives";

function LoginForm() {
  const { login, resetPassword, profile, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (AUTH_BYPASS) router.replace("/dashboard");
  }, [router]);

  if (!loading && profile && !AUTH_BYPASS) {
    router.replace(
      params.get("next") ||
        (profile.role === "client" ? "/client" : "/dashboard"),
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const p = await login(email.trim(), password);
      router.replace(
        params.get("next") ||
          (p.role === "client" ? "/client" : "/dashboard"),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  if (AUTH_BYPASS) return <SiteSpinner label="Opening workspace…" />;

  return (
    <div
      className="site-app"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ marginBottom: 28 }}>
          <div className="site-brand-kicker">{PLATFORM_KICKER}</div>
          <h1
            className="site-page-title"
            style={{ fontSize: 36, marginTop: 8 }}
          >
            {PLATFORM_NAME}
          </h1>
          <p className="site-page-desc">
            Sign in to the renovation progress workspace.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          style={{ display: "grid", gap: 14 }}
        >
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
          {info ? (
            <p style={{ color: "var(--site-success)", fontSize: 14 }}>{info}</p>
          ) : null}
          <SiteButton type="submit" variant="accent" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </SiteButton>
          <button
            type="button"
            onClick={async () => {
              if (!email.trim()) {
                setError("Enter your email first.");
                return;
              }
              setBusy(true);
              try {
                await resetPassword(email.trim());
                setInfo("Password reset email sent.");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Reset failed");
              } finally {
                setBusy(false);
              }
            }}
            style={{
              background: "none",
              border: 0,
              color: "var(--site-text-secondary)",
              fontSize: 13,
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
          >
            Forgot password?
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<SiteSpinner label="Loading…" />}>
      <LoginForm />
    </Suspense>
  );
}
