"use client";

import { SitePageHeader } from "@/components/progress/primitives";
import { PurchasesPanel } from "@/components/progress/purchases-panel";
import { useClientProject } from "@/lib/client-project";

export default function ClientPurchasesPage() {
  const { project } = useClientProject();

  return (
    <div>
      <SitePageHeader
        kicker="Purchases"
        title={project.name}
        description={project.address}
      />
      <PurchasesPanel project={project} clientMode />
    </div>
  );
}
