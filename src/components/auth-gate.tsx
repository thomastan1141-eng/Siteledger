"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AUTH_BYPASS } from "@/lib/demo";
import type { UserRole } from "@/lib/types";
import { SiteSpinner } from "./progress/primitives";

export function AuthGate({
  children,
  roles,
}: {
  children: React.ReactNode;
  roles: UserRole[];
}) {
  const { loading, profile, user, previewAs } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (AUTH_BYPASS) {
      // Auto-switch demo role so staff/client routes both work.
      if (roles.includes("client") && profile?.role !== "client") {
        previewAs("client");
      } else if (
        (roles.includes("admin") || roles.includes("staff")) &&
        profile?.role === "client"
      ) {
        previewAs("admin");
      }
      return;
    }
    if (loading) return;
    if (!user || !profile) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!roles.includes(profile.role)) {
      router.replace(profile.role === "client" ? "/client" : "/dashboard");
    }
  }, [loading, user, profile, roles, router, pathname, previewAs]);

  if (AUTH_BYPASS) {
    return <>{children}</>;
  }

  if (loading || !user || !profile || !roles.includes(profile.role)) {
    return <SiteSpinner />;
  }

  return <>{children}</>;
}
