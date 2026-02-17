"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { trackReferralEvent } from "@/lib/referrals"

const REFERRAL_TOKEN_PATTERN = /^[a-z0-9]{8,32}$/

export default function LoginPage() {
    const [email, setEmail] = useState("")
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState("")

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

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        const { error } = await supabase.auth.signInWithOtp({ email })
        if (error) {
            setMessage(error.message)
        } else {
            setMessage("Check your email for the login link!")
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
                        {message && <p className="text-sm text-center text-muted-foreground">{message}</p>}
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
