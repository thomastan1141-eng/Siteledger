"use client";

import { useRouter } from "next/navigation";
import {
  SiteButton,
  SitePageHeader,
  SiteSection,
  SiteSpinner,
} from "@/components/progress/primitives";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";

export default function AccountPage() {
  const { profile, user, logout, emailVerified, loading } = useAuth();
  const { workspace, loading: wsLoading } = useWorkspace();
  const router = useRouter();

  if (loading || wsLoading) return <SiteSpinner />;

  return (
    <div>
      <SitePageHeader
        kicker="Account"
        title="Your account"
        description="Studio profile and plan details."
      />

      <SiteSection title="Profile">
        <dl
          style={{
            display: "grid",
            gap: 12,
            margin: 0,
            fontSize: 14,
          }}
        >
          <div>
            <dt style={{ color: "var(--site-text-secondary)" }}>Name</dt>
            <dd style={{ margin: "4px 0 0" }}>
              {profile?.displayName || "—"}
            </dd>
          </div>
          <div>
            <dt style={{ color: "var(--site-text-secondary)" }}>Email</dt>
            <dd style={{ margin: "4px 0 0" }}>{user?.email || profile?.email}</dd>
          </div>
          <div>
            <dt style={{ color: "var(--site-text-secondary)" }}>
              Email verification
            </dt>
            <dd style={{ margin: "4px 0 0" }}>
              {emailVerified ? "Verified" : "Not verified"}
            </dd>
          </div>
          <div>
            <dt style={{ color: "var(--site-text-secondary)" }}>
              Studio / company
            </dt>
            <dd style={{ margin: "4px 0 0" }}>
              {profile?.studioName || workspace?.name || "—"}
            </dd>
          </div>
        </dl>
      </SiteSection>

      <SiteSection title="Plan">
        <p style={{ margin: 0, fontSize: 14 }}>
          Current plan: <strong>{workspace?.plan || "FREE"}</strong>
        </p>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 13,
            color: "var(--site-text-secondary)",
          }}
        >
          Paid plans and upgrades are coming later. Billing is not enabled yet.
        </p>
      </SiteSection>

      <div style={{ marginTop: 20 }}>
        <SiteButton
          type="button"
          variant="ghost"
          onClick={async () => {
            await logout();
            router.replace("/login");
          }}
        >
          Sign out
        </SiteButton>
      </div>
    </div>
  );
}
