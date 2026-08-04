"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SiteButton,
  SiteField,
  SiteInput,
  SitePageHeader,
  SiteSection,
  SiteSpinner,
} from "@/components/progress/primitives";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import {
  organizationDisplayName,
  resolveAccountTypeLabel,
  resolveOrganizationType,
} from "@/lib/organization";
import {
  changePasswordWithReauth,
  friendlyPasswordChangeError,
  hasPasswordProvider,
  PASSWORD_REQUIREMENTS,
  primaryProviderLabel,
  validatePasswordChange,
} from "@/lib/password";
import { getSessionMode } from "@/lib/session";

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  show,
  onToggleShow,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  show: boolean;
  onToggleShow: () => void;
  disabled?: boolean;
}) {
  return (
    <SiteField label={label}>
      <div style={{ display: "flex", gap: 8 }}>
        <SiteInput
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required
          style={{ flex: 1 }}
        />
        <SiteButton
          type="button"
          variant="ghost"
          disabled={disabled}
          onClick={onToggleShow}
        >
          {show ? "Hide" : "Show"}
        </SiteButton>
      </div>
    </SiteField>
  );
}

export function AccountSettings() {
  const { profile, user, logout, emailVerified, loading } = useAuth();
  const { workspace, membership, loading: wsLoading } = useWorkspace();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionMode] = useState<"trusted" | "session" | null>(() =>
    typeof window === "undefined" ? null : getSessionMode(),
  );

  const canUsePasswordForm = hasPasswordProvider(user);
  const isClient = profile?.role === "client";
  const isStaff = profile?.role === "staff";
  const showPlan = !isClient && !isStaff;
  const accountType = resolveAccountTypeLabel(profile, workspace, membership);
  const orgName = organizationDisplayName(profile, workspace);
  const orgType = resolveOrganizationType(workspace);

  if (loading || (wsLoading && !isClient)) return <SiteSpinner />;

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setPasswordError("");
    setPasswordSuccess("");

    const validationError = validatePasswordChange({
      currentPassword,
      newPassword,
      confirmPassword,
    });
    if (validationError) {
      setPasswordError(validationError);
      return;
    }
    if (!user) {
      setPasswordError("Please sign in again before changing your password.");
      return;
    }

    setBusy(true);
    try {
      await changePasswordWithReauth({
        user,
        currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess("Your password has been changed.");
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("[changePassword]", err);
      }
      setPasswordError(friendlyPasswordChangeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <SitePageHeader
        kicker="Account"
        title="Account"
        description="Manage your personal and organization details."
      />

      <SiteSection
        title="Profile"
        description="Your identity on SiteLedger project records."
      >
        <dl
          style={{
            display: "grid",
            gap: 12,
            margin: 0,
            fontSize: 14,
          }}
        >
          <div>
            <dt style={{ color: "var(--site-text-secondary)" }}>
              Display name
            </dt>
            <dd style={{ margin: "4px 0 0" }}>
              {profile?.displayName || "—"}
            </dd>
          </div>
          <div>
            <dt style={{ color: "var(--site-text-secondary)" }}>Email</dt>
            <dd style={{ margin: "4px 0 0" }}>
              {user?.email || profile?.email || "—"}
            </dd>
          </div>
          <div>
            <dt style={{ color: "var(--site-text-secondary)" }}>
              Account type
            </dt>
            <dd style={{ margin: "4px 0 0" }}>{accountType}</dd>
          </div>
          {!isClient ? (
            <div>
              <dt style={{ color: "var(--site-text-secondary)" }}>
                Organization / Company name
              </dt>
              <dd style={{ margin: "4px 0 0" }}>
                {orgName}
                {accountType !== "Client" ? (
                  <span
                    style={{
                      marginLeft: 8,
                      color: "var(--site-text-secondary)",
                      fontSize: 13,
                    }}
                  >
                    ({orgType === "COMPANY" ? "Company" : "Personal"}{" "}
                    organization)
                  </span>
                ) : null}
              </dd>
            </div>
          ) : null}
          <div>
            <dt style={{ color: "var(--site-text-secondary)" }}>
              Email verification
            </dt>
            <dd style={{ margin: "4px 0 0" }}>
              {emailVerified ? "Verified" : "Not verified"}
            </dd>
          </div>
        </dl>
      </SiteSection>

      <SiteSection title="Security" description="Change password">
        {canUsePasswordForm ? (
          <form
            onSubmit={(e) => void onChangePassword(e)}
            style={{ display: "grid", gap: 14, maxWidth: 420 }}
          >
            <PasswordField
              label="Current password"
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="current-password"
              show={showCurrent}
              onToggleShow={() => setShowCurrent((v) => !v)}
              disabled={busy}
            />
            <div>
              <PasswordField
                label="New password"
                value={newPassword}
                onChange={setNewPassword}
                autoComplete="new-password"
                show={showNew}
                onToggleShow={() => setShowNew((v) => !v)}
                disabled={busy}
              />
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
            </div>
            <PasswordField
              label="Confirm new password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
              show={showConfirm}
              onToggleShow={() => setShowConfirm((v) => !v)}
              disabled={busy}
            />
            {passwordError ? (
              <p style={{ color: "var(--site-danger)", fontSize: 14, margin: 0 }}>
                {passwordError}
              </p>
            ) : null}
            {passwordSuccess ? (
              <p
                style={{ color: "var(--site-success)", fontSize: 14, margin: 0 }}
              >
                {passwordSuccess}
              </p>
            ) : null}
            <SiteButton type="submit" variant="accent" disabled={busy}>
              {busy ? "Changing…" : "Change password"}
            </SiteButton>
          </form>
        ) : (
          <p style={{ margin: 0, fontSize: 14, color: "var(--site-text-secondary)" }}>
            Your password is managed by your sign-in provider
            {user ? ` (${primaryProviderLabel(user)})` : ""}.
          </p>
        )}
      </SiteSection>

      {showPlan ? (
        <SiteSection title="Account plan">
          <p style={{ margin: 0, fontSize: 14 }}>
            Current plan: <strong>Free</strong>
          </p>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 13,
              color: "var(--site-text-secondary)",
            }}
          >
            Subscription status:{" "}
            {workspace?.subscriptionStatus === "ACTIVE"
              ? "Active"
              : workspace?.subscriptionStatus === "TRIALING"
                ? "Trial"
                : "None"}
            . Paid plans are not enabled yet.
          </p>
        </SiteSection>
      ) : null}

      <SiteSection title="Session">
        <dl style={{ display: "grid", gap: 12, margin: 0, fontSize: 14 }}>
          <div>
            <dt style={{ color: "var(--site-text-secondary)" }}>
              Trusted device
            </dt>
            <dd style={{ margin: "4px 0 0" }}>
              {sessionMode === "trusted"
                ? "This browser is marked as a trusted device"
                : "This browser is a session-only sign-in"}
            </dd>
          </div>
        </dl>
        <div style={{ marginTop: 16 }}>
          <SiteButton
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              await logout();
              router.replace("/login");
            }}
          >
            Sign out
          </SiteButton>
        </div>
      </SiteSection>
    </div>
  );
}
