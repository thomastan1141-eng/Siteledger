"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { SiteButton, SiteSpinner } from "@/components/progress/primitives";
import { useAuth } from "@/lib/auth-context";
import { AUTH_BYPASS } from "@/lib/demo";

export default function VerifyEmailPage() {
  const {
    user,
    loading,
    logout,
    resendVerification,
    reloadVerified,
    completeOnboarding,
    needsEmailVerification,
    needsOnboarding,
    profile,
  } = useAuth();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (AUTH_BYPASS) {
      router.replace("/dashboard");
      return;
    }
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (
      !needsEmailVerification &&
      !needsOnboarding &&
      profile?.onboardingComplete
    ) {
      router.replace(profile.role === "client" ? "/client" : "/dashboard");
    }
  }, [
    loading,
    user,
    needsEmailVerification,
    needsOnboarding,
    profile,
    router,
  ]);

  if (loading || !user) return <SiteSpinner label="Loading…" />;

  async function onVerified() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const verified = await reloadVerified();
      if (!verified) {
        setError(
          "Your email is not verified yet. Open the link in your inbox, then try again.",
        );
        return;
      }
      setMessage("Email verified. Setting up your workspace…");
      await completeOnboarding();
      router.replace("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We could not finish setup. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Check your inbox"
      description="We sent a verification link to your email address."
    >
      <div style={{ display: "grid", gap: 12 }}>
        <p style={{ fontSize: 14, color: "var(--site-text-secondary)" }}>
          Signed in as <strong>{user.email}</strong>
        </p>
        {message ? (
          <p style={{ color: "var(--site-success)", fontSize: 14 }}>{message}</p>
        ) : null}
        {error ? (
          <p style={{ color: "var(--site-danger)", fontSize: 14 }}>{error}</p>
        ) : null}
        <SiteButton
          type="button"
          variant="accent"
          disabled={busy}
          onClick={() => void onVerified()}
        >
          {busy ? "Checking…" : "I have verified my email"}
        </SiteButton>
        <SiteButton
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await resendVerification();
              setMessage("Verification email resent.");
            } catch (err) {
              setError(
                err instanceof Error
                  ? err.message
                  : "Could not resend verification email.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Resend verification email
        </SiteButton>
        <SiteButton
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => void logout().then(() => router.replace("/login"))}
        >
          Sign out
        </SiteButton>
        <p style={{ fontSize: 13, color: "var(--site-text-secondary)" }}>
          Wrong email?{" "}
          <Link href="/signup" style={{ color: "inherit", fontWeight: 600 }}>
            Return to signup
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
