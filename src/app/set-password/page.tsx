"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import {
  SiteButton,
  SiteField,
  SiteInput,
  SiteSpinner,
} from "@/components/progress/primitives";
import { useAuth } from "@/lib/auth-context";
import { getFirebaseAuth } from "@/lib/firebase";
import { clearMustChangePasswordFlag } from "@/lib/services/invites";
import {
  changePasswordWithReauth,
  friendlyPasswordChangeError,
  PASSWORD_REQUIREMENTS,
  validatePasswordChange,
} from "@/lib/password";

export default function SetPasswordPage() {
  const {
    user,
    profile,
    loading,
    needsPasswordChange,
    refreshProfile,
    logout,
  } = useAuth();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!needsPasswordChange) {
      router.replace(profile?.role === "client" ? "/client" : "/dashboard");
    }
  }, [loading, user, needsPasswordChange, profile, router]);

  if (loading || !user) {
    return <SiteSpinner label="Loading…" />;
  }

  if (!needsPasswordChange) {
    return <SiteSpinner label="Opening…" />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    const validationError = validatePasswordChange({
      currentPassword,
      newPassword: password,
      confirmPassword: confirm,
    });
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    try {
      const current = getFirebaseAuth().currentUser;
      if (!current) throw new Error("Please sign in again.");
      await changePasswordWithReauth({
        user: current,
        currentPassword,
        newPassword: password,
      });
      await clearMustChangePasswordFlag(
        profile?.companyId || profile?.defaultWorkspaceId,
      );
      await refreshProfile();
      router.replace(profile?.role === "client" ? "/client" : "/dashboard");
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("[setPassword]", err);
      }
      setError(friendlyPasswordChangeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Set a new password"
      description="For security, change the temporary password before continuing."
    >
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
        <SiteField label="Current temporary password">
          <div style={{ display: "flex", gap: 8 }}>
            <SiteInput
              type={showCurrent ? "text" : "password"}
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              style={{ flex: 1 }}
              disabled={busy}
            />
            <SiteButton
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setShowCurrent((v) => !v)}
            >
              {showCurrent ? "Hide" : "Show"}
            </SiteButton>
          </div>
        </SiteField>
        <SiteField label="New password">
          <div style={{ display: "flex", gap: 8 }}>
            <SiteInput
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              style={{ flex: 1 }}
              disabled={busy}
            />
            <SiteButton
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setShow((v) => !v)}
            >
              {show ? "Hide" : "Show"}
            </SiteButton>
          </div>
          <ul
            style={{
              margin: "8px 0 0",
              paddingLeft: 18,
              fontSize: 12,
              color: "var(--site-text-secondary)",
            }}
          >
            {PASSWORD_REQUIREMENTS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </SiteField>
        <SiteField label="Confirm new password">
          <SiteInput
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
            disabled={busy}
          />
        </SiteField>
        {error ? (
          <p style={{ color: "var(--site-danger)", fontSize: 14 }}>{error}</p>
        ) : null}
        <SiteButton type="submit" variant="accent" disabled={busy}>
          {busy ? "Saving…" : "Save password"}
        </SiteButton>
        <SiteButton
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => void logout().then(() => router.replace("/login"))}
        >
          Sign out
        </SiteButton>
      </form>
    </AuthShell>
  );
}
