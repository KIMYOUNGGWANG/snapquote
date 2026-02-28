"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import {
    buildLoginErrorRedirectPath,
    buildPostAuthRedirectPath,
    normalizeIntent,
    normalizeNextPath,
    normalizeOAuthError,
} from "@/lib/auth/oauth-callback"

function redirectToLoginWithError(router: ReturnType<typeof useRouter>, nextPath: string, intent: string, message: string) {
    const loginPath = buildLoginErrorRedirectPath(nextPath, intent, normalizeOAuthError(message))
    window.location.href = loginPath
}

export default function AuthCallbackPage() {
    const router = useRouter()
    const [showManualButton, setShowManualButton] = useState(false)
    const [redirectTarget, setRedirectTarget] = useState("/")

    useEffect(() => {
        let active = true

        const run = async () => {
            if (typeof window === "undefined") return

            const params = new URLSearchParams(window.location.search)
            const nextPath = normalizeNextPath(params.get("next"))
            const intent = normalizeIntent(params.get("intent"))
            const providerError = params.get("error_description") || params.get("error")

            const target = buildPostAuthRedirectPath(nextPath, intent)
            setRedirectTarget(target)

            if (providerError) {
                if (!active) return
                redirectToLoginWithError(router, nextPath, intent, providerError)
                return
            }

            const code = params.get("code")?.trim()

            // Handle PKCE Flow (code in query params)
            if (code) {
                const { error } = await supabase.auth.exchangeCodeForSession(code)
                if (!active) return
                if (error) {
                    redirectToLoginWithError(router, nextPath, intent, error.message)
                    return
                }
            }
            // Handle Implicit Flow (tokens in URL hash)
            else if (window.location.hash.includes("access_token") || window.location.hash.includes("error_description")) {
                const hashParams = new URLSearchParams(window.location.hash.replace("#", "?"))
                const hashError = hashParams.get("error_description") || hashParams.get("error")
                if (hashError) {
                    if (!active) return
                    redirectToLoginWithError(router, nextPath, intent, hashError)
                    return
                }

                // Supabase JS client automatically parses the hash and sets the session.
                const { data, error } = await supabase.auth.getSession()
                if (!active) return
                if (error || !data.session) {
                    // Try waiting briefly in case parsing is delayed
                    await new Promise(resolve => setTimeout(resolve, 500))
                    const retry = await supabase.auth.getSession()
                    if (retry.error || !retry.data.session) {
                        redirectToLoginWithError(router, nextPath, intent, "Failed to establish session from implicit flow")
                        return
                    }
                }
            } else {
                if (!active) return
                redirectToLoginWithError(router, nextPath, intent, "Missing OAuth authorization code or token")
                return
            }

            // A tiny delay to ensure storage flushes before refresh
            await new Promise(resolve => setTimeout(resolve, 500))
            window.location.href = target
        }

        // Show manual button after 3 seconds if not redirected
        const buttonTimer = setTimeout(() => {
            if (active) setShowManualButton(true)
        }, 3000)

        // Safety timeout: if redirect doesn't happen in 8 seconds, go to login with error
        const timeout = setTimeout(() => {
            if (active) {
                active = false
                window.location.href = "/login?oauth_error=Sign+in+timed+out.+Please+try+again."
            }
        }, 8000)

        void run()

        return () => {
            active = false
            clearTimeout(buttonTimer)
            clearTimeout(timeout)
        }
    }, [router])

    return (
        <div className="flex items-center justify-center min-h-[80vh] px-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Completing Sign In</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Verifying your account and redirecting...
                    </p>
                    {showManualButton && (
                        <div className="pt-4 border-t">
                            <Button
                                className="w-full"
                                onClick={() => {
                                    window.location.href = redirectTarget
                                }}
                            >
                                Tap here if not redirected
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
