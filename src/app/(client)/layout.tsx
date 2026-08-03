"use client";

import { AuthGate } from "@/components/auth-gate";
import { ProgressClientShell } from "@/components/progress/client-shell";
import { ClientProjectProvider } from "@/lib/client-project";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate roles={["client"]}>
      <ProgressClientShell>
        <ClientProjectProvider>{children}</ClientProjectProvider>
      </ProgressClientShell>
    </AuthGate>
  );
}
