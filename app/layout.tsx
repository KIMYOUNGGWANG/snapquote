import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BottomNav } from "@/components/bottom-nav";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/toast";
import { SyncManager } from "@/components/sync-manager";
import { AuthRedirectManager } from "@/components/auth-redirect-manager";
import { OfflineBanner } from "@/components/offline-banner";
import { InstallPrompt } from "@/components/install-prompt";
import { FeedbackModal } from "@/components/feedback-modal";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { ReferralAttributionManager } from "@/components/referral-attribution-manager";
import { Analytics } from "@vercel/analytics/next";
import { cn } from "@/lib/utils";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://snapquote.ai"; // Fallback to production URL

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "SnapQuote - Trade-Focused AI Estimator",
    template: "%s | SnapQuote",
  },
  description: "Generate professional trade estimates in seconds with AI. Optimized for contractors and field service professionals.",
  keywords: ["AI Estimator", "Trade Quotes", "Contractor Tools", "Digital Invoicing", "Field Service AI", "SnapQuote"],
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192x192.png",
    shortcut: "/favicon.ico",
    apple: "/icon-512x512.png",
  },
  openGraph: {
    title: "SnapQuote - Trade-Focused AI Estimator",
    description: "Generate professional trade estimates in seconds with AI.",
    url: "./",
    siteName: "SnapQuote",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SnapQuote - AI Estimator for Trades",
    description: "The fastest way for contractors to generate and send estimates.",
  },
  alternates: {
    canonical: "./",
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
          <ServiceWorkerRegister />
          <InstallPrompt />
          <OfflineBanner />
          <main className="w-full min-h-screen relative">
            {children}
          </main>
          <BottomNav />
          <AuthRedirectManager />
          <ReferralAttributionManager />
          <SyncManager />
          <FeedbackModal />
          <Toaster />
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
