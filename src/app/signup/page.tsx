"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import {
  SiteButton,
  SiteField,
  SiteInput,
  SiteSpinner,
} from "@/components/progress/primitives";
import { useAuth } from "@/lib/auth-context";
import { AUTH_BYPASS } from "@/lib/demo";

export default function SignupPage() {
  const { signup, user, profile, loading, needsEmailVerification } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    displayName: "",
    studioName: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (AUTH_BYPASS) {
      router.replace("/dashboard");
      return;
    }
    if (loading) return;
    if (user && needsEmailVerification) {
      router.replace("/verify-email");
      return;
    }
    if (user && profile?.onboardingComplete) {
      router.replace(profile.role === "client" ? "/client" : "/dashboard");
    }
  }, [loading, user, profile, needsEmailVerification, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    try {
      await signup({
        email: form.email.trim(),
        password: form.password,
        displayName: form.displayName.trim() || undefined,
        studioName: form.studioName.trim() || undefined,
      });
      router.replace("/verify-email");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We could not create your account. Please check the information and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (AUTH_BYPASS || (!loading && user && profile?.onboardingComplete)) {
    return <SiteSpinner label="Opening workspace…" />;
  }

  return (
    <AuthShell
      title="Create an account"
      description="Start your own SiteLedger workspace for your studio."
    >
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
        <SiteField label="Full name">
          <SiteInput
            value={form.displayName}
            onChange={(e) =>
              setForm((s) => ({ ...s, displayName: e.target.value }))
            }
            autoComplete="name"
            placeholder="Optional"
          />
        </SiteField>
        <SiteField label="Studio / company name">
          <SiteInput
            value={form.studioName}
            onChange={(e) =>
              setForm((s) => ({ ...s, studioName: e.target.value }))
            }
            placeholder="Optional — recommended"
          />
        </SiteField>
        <SiteField label="Email">
          <SiteInput
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
            required
          />
        </SiteField>
        <SiteField label="Password">
          <SiteInput
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) =>
              setForm((s) => ({ ...s, password: e.target.value }))
            }
            required
            minLength={6}
          />
        </SiteField>
        <SiteField label="Confirm password">
          <SiteInput
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={(e) =>
              setForm((s) => ({ ...s, confirm: e.target.value }))
            }
            required
            minLength={6}
          />
        </SiteField>
        {error ? (
          <p style={{ color: "var(--site-danger)", fontSize: 14 }}>{error}</p>
        ) : null}
        <SiteButton type="submit" variant="accent" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </SiteButton>
        <p style={{ fontSize: 13, color: "var(--site-text-secondary)" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "inherit", fontWeight: 600 }}>
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
