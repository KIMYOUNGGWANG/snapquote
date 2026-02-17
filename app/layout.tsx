import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BottomNav } from "@/components/bottom-nav";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/toast";
import { SyncManager } from "@/components/sync-manager";
import { OfflineBanner } from "@/components/offline-banner";
import { InstallPrompt } from "@/components/install-prompt";
import { FeedbackModal } from "@/components/feedback-modal";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "SnapQuote",
  description: "Trade-Focused AI Estimator",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192x192.png",
    shortcut: "/favicon.ico",
    apple: "/icon-512x512.png",
  },
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
      <body className={cn("min-h-screen bg-background antialiased pb-24 selection:bg-primary/20 selection:text-primary")}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <InstallPrompt />
          <OfflineBanner />
          <main className="w-full min-h-screen relative">
            {children}
          </main>
          <BottomNav />
          <SyncManager />
          <FeedbackModal />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
