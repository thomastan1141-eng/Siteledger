"use client";

import { useParams } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { SiteButton } from "@/components/progress/primitives";

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();

  return (
    <AuthShell
      title="Invitation links are no longer used"
      description="Project access is now shared directly by the owner with an existing, email-verified SiteLedger account. Ask them to open Project Access and click Share."
    >
      <div style={{ display: "grid", gap: 12 }}>
        <SiteButton href="/login" variant="accent">
          Sign in
        </SiteButton>
        <SiteButton href="/signup" variant="ghost">
          Create an account
        </SiteButton>
        {token ? (
          <p style={{ fontSize: 12, color: "var(--site-text-light)", margin: 0 }}>
            This old link cannot grant access.
          </p>
        ) : null}
      </div>
    </AuthShell>
  );
}
