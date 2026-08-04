"use client";

import Link from "next/link";
import { PLATFORM_KICKER, PLATFORM_NAME } from "@/lib/constants";

export function AuthShell({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="site-app"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ marginBottom: 28 }}>
          <Link href="/login" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="site-brand-kicker">{PLATFORM_KICKER}</div>
            <h1
              className="site-page-title"
              style={{ fontSize: 36, marginTop: 8 }}
            >
              {PLATFORM_NAME}
            </h1>
          </Link>
          {title ? (
            <h2
              style={{
                margin: "18px 0 0",
                fontSize: 20,
                fontWeight: 650,
              }}
            >
              {title}
            </h2>
          ) : null}
          {description ? (
            <p
              className="site-page-desc"
              style={{ marginTop: title ? 8 : 14 }}
            >
              {description}
            </p>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}
