"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AUTH_BYPASS } from "@/lib/demo";
import { SiteSpinner } from "./progress/primitives";

/**
 * Gate for the unified application. Every verified, onboarded USER gets the
 * same experience — this checks authentication, email verification and
 * onboarding only. It never branches on users/{uid}.role.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const {
    loading,
    profile,
    user,
    needsEmailVerification,
    needsOnboarding,
    needsPasswordChange,
  } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (AUTH_BYPASS) return;
    if (loading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (needsPasswordChange && pathname !== "/set-password") {
      router.replace("/set-password");
      return;
    }
    if (needsEmailVerification || needsOnboarding) {
      router.replace("/verify-email");
      return;
    }
    if (!profile) {
      router.replace("/verify-email");
    }
  }, [
    loading,
    user,
    profile,
    router,
    pathname,
    needsEmailVerification,
    needsOnboarding,
    needsPasswordChange,
  ]);

  if (AUTH_BYPASS) {
    return <>{children}</>;
  }

  if (
    loading ||
    !user ||
    needsPasswordChange ||
    needsEmailVerification ||
    needsOnboarding ||
    !profile
  ) {
    return <SiteSpinner />;
  }

  return <>{children}</>;
}
