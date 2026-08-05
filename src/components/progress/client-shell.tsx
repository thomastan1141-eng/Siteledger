"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Film, Images, LogOut, UserRound } from "lucide-react";
import { PLATFORM_KICKER, PLATFORM_NAME } from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";
import { AUTH_BYPASS } from "@/lib/demo";
import { PageWidthProvider, usePageWidthMode } from "@/lib/page-width";
import { SiteButton } from "./primitives";

/** Client portal: media + account only. No Schedule/Journal/Purchases/Access. */
const NAV = [
  { href: "/client/gallery", label: "Project Media", icon: Images },
  { href: "/client/videos", label: "Videos", icon: Film },
  { href: "/client/account", label: "Account", icon: UserRound },
];

export function ProgressClientShell({ children }: { children: React.ReactNode }) {
  return (
    <PageWidthProvider>
      <ClientShellChrome>{children}</ClientShellChrome>
    </PageWidthProvider>
  );
}

function ClientShellChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profile, logout } = useAuth();
  const widthMode = usePageWidthMode();

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

      <main className="site-main" data-width={widthMode}>
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
