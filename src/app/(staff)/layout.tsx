"use client";

import { AuthGate } from "@/components/auth-gate";
import { ProgressStaffShell } from "@/components/progress/staff-shell";

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate roles={["admin", "staff"]}>
      <ProgressStaffShell>{children}</ProgressStaffShell>
    </AuthGate>
  );
}
