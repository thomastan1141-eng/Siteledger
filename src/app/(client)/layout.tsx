"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/auth-gate";
import { SiteSpinner } from "@/components/progress/primitives";

/**
 * Legacy /client routes. Every USER now shares one unified application —
 * this redirects into it without checking users/{uid}.role.
 */
export default function ClientLayout() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <AuthGate>
      <SiteSpinner label="Opening your workspace…" />
    </AuthGate>
  );
}
