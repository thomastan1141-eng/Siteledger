"use client";

import { useEffect, useRef, useState } from "react";
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
  const [resendCooldown, setResendCooldown] = useState(0);
  const finishingRef = useRef(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = window.setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [resendCooldown]);

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

  useEffect(() => {
    if (AUTH_BYPASS || loading || !user) return;

    let cancelled = false;
    let timeoutId: number | undefined;
    // Backs off on every failed check (e.g. transient network hiccups or a
    // Firebase abuse-rate-limit) instead of hammering the Identity Toolkit
    // API every few seconds forever. Hammering reload()/getIdToken() on a
    // fixed short interval — including on every tab focus — is what
    // previously tripped auth/too-many-requests and then never recovered,
    // because the loop kept retrying immediately and re-extending the block.
    const MIN_DELAY_MS = 4000;
    const MAX_DELAY_MS = 60000;
    let delay = MIN_DELAY_MS;
    let lastAttemptAt = 0;
    const MIN_GAP_BETWEEN_ATTEMPTS_MS = 3000;

    async function finishIfVerified(showErrors: boolean) {
      if (cancelled || finishingRef.current) return;
      const now = Date.now();
      if (now - lastAttemptAt < MIN_GAP_BETWEEN_ATTEMPTS_MS) return;
      lastAttemptAt = now;
      try {
        const verified = await reloadVerified();
        delay = MIN_DELAY_MS;
        if (!verified || cancelled) return;

        finishingRef.current = true;
        setBusy(true);
        setError("");
        setMessage("Email verified. Setting up your workspace…");
        await completeOnboarding();
        if (!cancelled) router.replace("/dashboard");
      } catch (err) {
        finishingRef.current = false;
        if (cancelled) return;
        // Silent background polls back off quietly; only surface an error
        // for an explicit user action (the button click / manual retry).
        delay = Math.min(delay * 2, MAX_DELAY_MS);
        if (showErrors) {
          setError(
            err instanceof Error
              ? err.message
              : "We could not finish setup. Please try again.",
          );
          setBusy(false);
        }
      }
    }

    function scheduleNext() {
      if (cancelled) return;
      timeoutId = window.setTimeout(() => {
        void finishIfVerified(false).finally(scheduleNext);
      }, delay);
    }

    void finishIfVerified(false);
    scheduleNext();

    function onFocus() {
      void finishIfVerified(false);
    }
    function onVisibility() {
      if (document.visibilityState === "visible") {
        void finishIfVerified(false);
      }
    }

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // Intentionally keyed to uid so polling is not reset on every auth refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable wait loop
  }, [loading, user?.uid]);

  if (loading || !user) return <SiteSpinner label="Loading…" />;

  async function onVerified() {
    if (finishingRef.current) return;
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
      finishingRef.current = true;
      setMessage("Email verified. Setting up your workspace…");
      await completeOnboarding();
      router.replace("/dashboard");
    } catch (err) {
      finishingRef.current = false;
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
      description="We sent a verification link to your email address. After you verify, this page will continue automatically."
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
          disabled={busy || resendCooldown > 0}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await resendVerification();
              setMessage("Verification email resent. Check your inbox (and spam folder).");
              setResendCooldown(60);
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
          {resendCooldown > 0
            ? `Resend verification email (${resendCooldown}s)`
            : "Resend verification email"}
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
