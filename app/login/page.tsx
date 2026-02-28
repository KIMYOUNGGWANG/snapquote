"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { trackReferralEvent } from "@/lib/referrals"
import { buildPostAuthRedirectPath, normalizeIntent, normalizeNextPath } from "@/lib/auth/oauth-callback"

const REFERRAL_TOKEN_PATTERN = /^[a-z0-9]{8,32}$/

export default function LoginPage() {
    const [email, setEmail] = useState("")
    const [loading, setLoading] = useState(false)
    const [oauthLoading, setOauthLoading] = useState(false)
    const [message, setMessage] = useState("")
    const [nextPath, setNextPath] = useState("/")
    const [intent, setIntent] = useState("")

    useEffect(() => {
        const referralToken = localStorage.getItem("snapquote_ref_token")?.trim().toLowerCase() || ""
        if (!REFERRAL_TOKEN_PATTERN.test(referralToken)) return

        const eventKey = `snapquote_ref_signup:${referralToken}`
        if (sessionStorage.getItem(eventKey)) return
        sessionStorage.setItem(eventKey, "1")

        void trackReferralEvent({
            token: referralToken,
            event: "signup_start",
            source: "login_page",
        })
    }, [])

    useEffect(() => {
        if (typeof window === "undefined") return
        const params = new URLSearchParams(window.location.search)
        setNextPath(normalizeNextPath(params.get("next")))
        setIntent(normalizeIntent(params.get("intent")))
        const oauthError = params.get("oauth_error")?.trim()
        if (oauthError) {
            setMessage(oauthError)
        }

        // Check if user is already signed in
        void supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                const target = buildPostAuthRedirectPath(normalizeNextPath(params.get("next")), normalizeIntent(params.get("intent")))
                window.location.href = target
            }
        })
    }, [])

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setMessage("")
        const redirectUrl = new URL(nextPath, window.location.origin)
        if (intent) {
            redirectUrl.searchParams.set("intent", intent)
        }

        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                shouldCreateUser: true,
                emailRedirectTo: redirectUrl.toString(),
            },
        })
        if (error) {
            setMessage(error.message)
        } else {
            setMessage(
                intent === "payment-link"
                    ? "Check your email. After login, you'll return to payment link setup."
                    : "Check your email for the login link!"
            )
        }
        setLoading(false)
    }

    const handleGoogleLogin = async () => {
        setMessage("")
        setOauthLoading(true)

        const callbackPath = buildPostAuthRedirectPath("/auth/callback", intent)
        const callbackUrl = new URL(callbackPath, window.location.origin)
        callbackUrl.searchParams.set("next", nextPath)

        const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: callbackUrl.toString(),
                queryParams: { prompt: "select_account" },
            },
        })

        if (error) {
            setMessage(error.message)
            setOauthLoading(false)
        }
    }

    const oauthBusy = oauthLoading

    return (
        <div className="flex items-center justify-center min-h-[80vh]">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Sign In</CardTitle>
                </CardHeader>
                <CardContent>
                    {intent === "payment-link" && (
                        <p className="text-sm text-muted-foreground mb-3">
                            Sign in to generate Stripe payment links for your estimate.
                        </p>
                    )}
                    <div className="space-y-3 mb-6">
                        <Button
                            type="button"
                            variant="default"
                            className="w-full"
                            onClick={() => void handleGoogleLogin()}
                            disabled={loading || oauthBusy}
                        >
                            {oauthLoading ? "Redirecting..." : "Continue with Google"}
                        </Button>
                        <div className="relative py-2">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-card px-2 text-muted-foreground">Or continue with magic link</span>
                            </div>
                        </div>
                    </div>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <Input
                            type="email"
                            placeholder="Email address"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                        <Button type="submit" variant="outline" className="w-full" disabled={loading || oauthBusy}>
                            {loading ? "Sending link..." : "Send Magic Link"}
                        </Button>
                        <p className="text-xs text-center text-muted-foreground">
                            No password. First-time email login creates your account automatically.
                        </p>
                        {message && <p className="text-sm text-center text-muted-foreground">{message}</p>}
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
