"use client"

import { usePathname } from "next/navigation"
import { BottomNav } from "@/components/bottom-nav"

export function AppShellWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()

    const isMarketingPage = pathname?.startsWith("/landing") || 
                            pathname?.startsWith("/pricing") || 
                            pathname?.startsWith("/privacy") || 
                            pathname?.startsWith("/terms")
    const isAuthPage = pathname?.startsWith("/login") ||
                       pathname?.startsWith("/auth/callback")

    if (isMarketingPage || isAuthPage) {
        return (
            <div className="w-full min-h-screen bg-[#050505] sm:bg-[#0a0a0a]">
                <main className="w-full min-h-screen relative">
                  {children}
                </main>
            </div>
        )
    }

    return (
        <div className="w-full max-w-md md:max-w-2xl lg:max-w-5xl mx-auto min-h-screen relative bg-background sm:border-x sm:border-white/10 sm:shadow-2xl overflow-x-hidden pb-24 pt-[env(safe-area-inset-top)]">
            <main className="w-full min-h-screen relative">
              {children}
            </main>
            <BottomNav />
        </div>
    )
}
