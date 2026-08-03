"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CheckCircle2,
  Film,
  Images,
  LayoutGrid,
  LogOut,
  Route,
  ShoppingBag,
} from "lucide-react";
import { PLATFORM_KICKER, PLATFORM_NAME } from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";
import { AUTH_BYPASS } from "@/lib/demo";
import { SiteButton } from "./primitives";

const NAV = [
  { href: "/client", label: "Overview", icon: LayoutGrid },
  { href: "/client/timeline", label: "Journal", icon: Route },
  { href: "/client/gallery", label: "Photos", icon: Images },
  { href: "/client/videos", label: "Videos", icon: Film },
  { href: "/client/completed", label: "Stages", icon: CheckCircle2 },
  { href: "/client/purchases", label: "Purchases", icon: ShoppingBag },
];

export function ProgressClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profile, logout } = useAuth();

  return (
    <div className="site-app site-shell">
      {AUTH_BYPASS ? (
        <div className="site-demo-banner">
          Client preview · <Link href="/dashboard">Back to workspace</Link>
        </div>
      ) : null}

      <header className="site-topbar">
        <div className="site-topbar-inner">
          <div className="site-brand-row">
            <div className="site-brand">
              <span className="site-brand-kicker">{PLATFORM_KICKER}</span>
              <span className="site-brand-name">{PLATFORM_NAME}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: "var(--site-text-secondary)" }}>
                {profile?.displayName}
              </span>
              <SiteButton variant="ghost" onClick={() => logout()}>
                <LogOut size={15} />
                Out
              </SiteButton>
            </div>
          </div>
          <nav className="site-nav" aria-label="Client navigation">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="site-nav-link"
                data-active={pathname === item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="site-main" data-width="content">
        {children}
      </main>

      <nav className="site-mobile-dock" aria-label="Client mobile navigation">
        {NAV.slice(0, 4).map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="site-dock-link"
              data-active={pathname === item.href}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
