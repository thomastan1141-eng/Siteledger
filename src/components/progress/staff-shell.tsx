"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Camera,
  FolderKanban,
  HardDrive,
  LayoutGrid,
  LogOut,
  UserRound,
  Users,
} from "lucide-react";
import { PLATFORM_KICKER, PLATFORM_NAME } from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";
import { AUTH_BYPASS } from "@/lib/demo";
import { SiteButton } from "./primitives";

const NAV = [
  { href: "/dashboard", label: "Today", icon: LayoutGrid },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/media", label: "Media", icon: Camera },
  { href: "/access", label: "Access", icon: Users },
  { href: "/storage", label: "Storage", icon: HardDrive },
  { href: "/account", label: "Account", icon: UserRound },
];

const DOCK = NAV.slice(0, 4);

export function ProgressStaffShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profile, logout } = useAuth();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="site-app site-shell">
      {AUTH_BYPASS ? (
        <div className="site-demo-banner">
          Preview mode · login off ·{" "}
          <Link href="/client">Open client portal</Link>
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
              <span
                style={{
                  fontSize: 12,
                  color: "var(--site-text-secondary)",
                }}
              >
                {profile?.displayName}
              </span>
              <SiteButton variant="ghost" onClick={() => logout()}>
                <LogOut size={15} />
                Out
              </SiteButton>
            </div>
          </div>
          <nav className="site-nav" aria-label="Staff navigation">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="site-nav-link"
                data-active={isActive(item.href)}
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

      <nav className="site-mobile-dock" aria-label="Mobile navigation">
        {DOCK.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="site-dock-link"
              data-active={isActive(item.href)}
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
