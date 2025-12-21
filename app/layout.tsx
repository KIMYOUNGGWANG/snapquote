import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/bottom-nav";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/toast";
import { SyncManager } from "@/components/sync-manager";
import { LegalModal } from "@/components/legal-modal";
import { OfflineBanner } from "@/components/offline-banner";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SnapQuote",
  description: "Trade-Focused AI Estimator",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#2563EB",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn(inter.className, "min-h-screen bg-background antialiased pb-20")}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <OfflineBanner />
          <main className="container mx-auto px-4 py-4">
            {children}
          </main>
          <BottomNav />
          <SyncManager />
          <LegalModal />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
