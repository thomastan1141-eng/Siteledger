"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import {
  SiteButton,
  SiteField,
  SiteInput,
} from "@/components/progress/primitives";
import { useAuth } from "@/lib/auth-context";

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await resetPassword(email.trim());
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We could not send a reset link. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Forgot password"
      description="Enter your email and we’ll send a reset link if an account exists."
    >
      {done ? (
        <div style={{ display: "grid", gap: 14 }}>
          <p style={{ fontSize: 14, color: "var(--site-text-secondary)" }}>
            If an account exists for this email, a password reset link has been
            sent.
          </p>
          <Link href="/login">
            <SiteButton variant="accent">Back to sign in</SiteButton>
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
          <SiteField label="Email address">
            <SiteInput
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </SiteField>
          {error ? (
            <p style={{ color: "var(--site-danger)", fontSize: 14 }}>{error}</p>
          ) : null}
          <SiteButton type="submit" variant="accent" disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </SiteButton>
          <Link
            href="/login"
            style={{ fontSize: 13, color: "var(--site-text-secondary)" }}
          >
            Back to sign in
          </Link>
        </form>
      )}
    </AuthShell>
  );
}
