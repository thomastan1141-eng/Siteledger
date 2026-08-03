"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AUTH_BYPASS } from "@/lib/demo";
import { SiteSpinner } from "@/components/progress/primitives";

export default function HomePage() {
  const { loading, profile } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (AUTH_BYPASS) {
      router.replace("/dashboard");
      return;
    }
    if (loading) return;
    if (!profile) {
      router.replace("/login");
      return;
    }
    router.replace(profile.role === "client" ? "/client" : "/dashboard");
  }, [loading, profile, router]);

  return <SiteSpinner label="Opening site progress…" />;
}
