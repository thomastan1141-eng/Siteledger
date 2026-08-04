import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { WorkspaceProvider } from "@/lib/workspace-context";
import { SessionGuard } from "@/components/session-guard";
import "./globals.css";

const siteSans = Outfit({
  variable: "--font-site-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "SiteLedger · Project Operations",
  description:
    "Site progress, journals, media and purchase tracking for renovation projects.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${siteSans.variable} h-full`}>
      <body className="site-app min-h-full antialiased">
        <AuthProvider>
          <WorkspaceProvider>
            <SessionGuard>{children}</SessionGuard>
          </WorkspaceProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
