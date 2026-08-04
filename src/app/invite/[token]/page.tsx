"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { SiteButton, SiteSpinner } from "@/components/progress/primitives";
import { useAuth } from "@/lib/auth-context";
import { getFirebaseAuth } from "@/lib/firebase";

type AcceptState = "idle" | "accepting" | "accepted" | "error";

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const { user, loading, logout, refreshProfile } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<AcceptState>("idle");
  const [error, setError] = useState("");
  const [role, setRole] = useState<string>("staff");

  async function accept() {
    if (!token) return;
    setState("accepting");
    setError("");
    try {
      const current = getFirebaseAuth().currentUser;
      if (!current) throw new Error("Please sign in again.");
      const idToken = await current.getIdToken(true);
      const res = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        role?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "We could not accept this invitation.");
      }
      setRole(data.role || "staff");
      await refreshProfile();
      setState("accepted");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We could not accept this invitation.",
      );
      setState("error");
    }
  }

  useEffect(() => {
    if (loading || !user || !token) return;
    if (state !== "idle") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async invite accept
    void accept();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, token]);

  if (loading) return <SiteSpinner label="Loading…" />;

  if (!user) {
    return (
      <AuthShell
        title="You have been invited to SiteLedger"
        description="Sign in or create an account with the invited email address to accept this invitation."
      >
        <div style={{ display: "grid", gap: 12 }}>
          <SiteButton href={`/login?next=/invite/${token}`} variant="accent">
            Sign in to accept
          </SiteButton>
          <SiteButton href={`/signup?next=/invite/${token}`} variant="ghost">
            Create an account
          </SiteButton>
        </div>
      </AuthShell>
    );
  }

  if (state === "idle" || state === "accepting") {
    return (
      <AuthShell
        title="Accepting invitation…"
        description={`Signed in as ${user.email}`}
      >
        <SiteSpinner label="Accepting invitation…" />
      </AuthShell>
    );
  }

  if (state === "accepted") {
    return (
      <AuthShell
        title="Invitation accepted"
        description="You now have access to the project."
      >
        <SiteButton
          type="button"
          variant="accent"
          onClick={() => router.replace(role === "client" ? "/client" : "/dashboard")}
        >
          Continue
        </SiteButton>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="We could not accept this invitation" description={error}>
      <div style={{ display: "grid", gap: 12 }}>
        <SiteButton type="button" variant="accent" onClick={() => void accept()}>
          Try again
        </SiteButton>
        <SiteButton
          type="button"
          variant="ghost"
          onClick={() => void logout().then(() => router.replace("/login"))}
        >
          Sign out and use a different account
        </SiteButton>
      </div>
    </AuthShell>
  );
}
