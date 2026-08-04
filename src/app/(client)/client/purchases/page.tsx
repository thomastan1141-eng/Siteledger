"use client";

import { SitePageHeader } from "@/components/progress/primitives";
import { PurchasesPanel } from "@/components/progress/purchases-panel";
import { useClientProject } from "@/lib/client-project";
import { getProjectDisplayName } from "@/lib/utils";

export default function ClientPurchasesPage() {
  const { project } = useClientProject();

  return (
    <div>
      <SitePageHeader
        kicker="Purchases"
        title={getProjectDisplayName(project)}
        description={project.clientName || undefined}
      />
      <PurchasesPanel project={project} clientMode />
    </div>
  );
}
