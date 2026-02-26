"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { trackReferralEvent } from "@/lib/referrals"

const REFERRAL_TOKEN_PATTERN = /^[a-z0-9]{8,32}$/

function normalizeNextPath(raw: string | null): string {
    if (!raw) return "/"
    const trimmed = raw.trim()
    if (!trimmed.startsWith("/")) return "/"
    if (trimmed.startsWith("//")) return "/"
    return trimmed
}

export default function LoginPage() {
    const [email, setEmail] = useState("")
    const [loading, setLoading] = useState(false)
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
        setIntent(params.get("intent")?.trim() || "")
    }, [])

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
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
                    <form onSubmit={handleLogin} className="space-y-4">
                        <Input
                            type="email"
                            placeholder="Email address"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                        <Button type="submit" className="w-full" disabled={loading}>
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
