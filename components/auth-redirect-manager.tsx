"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase"

/**
 * AuthRedirectManager
 * 
 * A global, headless component that ensures 100% reliable redirects
 * triggered by authentication state changes. By using window.location.href,
 * it bypasses potential client-side routing lags or "hanging" listeners.
 */
export function AuthRedirectManager() {
    const pathname = usePathname()
    const lastEventRef = useRef<string | null>(null)

    useEffect(() => {
        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            // Prevent redundant redirect cycles for the same event
            if (lastEventRef.current === event) return

            const isUnauthenticatedPath = pathname === "/landing" || pathname === "/login" || pathname === "/auth/callback"
            const hasUser = Boolean(session?.user)

            // 1. Force Landing on Logout
            if (event === "SIGNED_OUT") {
                lastEventRef.current = event
                window.location.href = "/landing"
                return
            }

            // 2. Force Dashboard on Login (if currently on a landing/login page)
            if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && hasUser && isUnauthenticatedPath) {
                lastEventRef.current = event
                // Only redirect if actually signed in and on restricted page
                window.location.href = "/"
                return
            }
        })

        return () => {
            authListener.subscription.unsubscribe()
        }
    }, [pathname])

    return null // Headless
}
