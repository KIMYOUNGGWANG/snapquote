"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { withAuthHeaders } from "@/lib/auth-headers"

function decodeReturnPath(stateValue: string | null): string {
    if (!stateValue || typeof window === "undefined") return "/history"

    try {
        const padded = stateValue.replace(/-/g, "+").replace(/_/g, "/")
        const normalized = padded + "=".repeat((4 - (padded.length % 4 || 4)) % 4)
        const parsed = JSON.parse(window.atob(normalized))
        const returnPath = typeof parsed?.returnPath === "string" ? parsed.returnPath.trim() : ""
        if (returnPath.startsWith("/") && !returnPath.startsWith("//")) {
            return returnPath
        }
    } catch {
        return "/history"
    }

    return "/history"
}

export default function QuickBooksCallbackPage() {
    const [message, setMessage] = useState("Finishing QuickBooks connection...")
    const [showManualButton, setShowManualButton] = useState(false)
    const [redirectTarget, setRedirectTarget] = useState("/history")

    useEffect(() => {
        let active = true
        const params = new URLSearchParams(window.location.search)
        const returnPath = decodeReturnPath(params.get("state"))

        setRedirectTarget(returnPath)

        const run = async () => {
            const providerError = params.get("error") || params.get("error_description")
            if (providerError) {
                if (!active) return
                setMessage(providerError)
                return
            }

            const code = params.get("code")?.trim()
            const realmId = params.get("realmId")?.trim()
            if (!code || !realmId) {
                if (!active) return
                setMessage("QuickBooks callback is missing the authorization code.")
                return
            }

            try {
                const headers = await withAuthHeaders({ "content-type": "application/json" })
                if (!headers.authorization) {
                    if (!active) return
                    setMessage("Please log in again before completing QuickBooks connection.")
                    return
                }

                const response = await fetch("/api/quickbooks/connect/token", {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ code, realmId }),
                })

                if (!response.ok) {
                    const payload = await response.json().catch(() => null)
                    if (!active) return
                    setMessage(
                        payload?.error?.message ||
                            payload?.error ||
                            "Failed to finish QuickBooks connection."
                    )
                    return
                }

                window.location.href = returnPath
            } catch (error) {
                console.error("QuickBooks callback failed:", error)
                if (!active) return
                setMessage("Failed to finish QuickBooks connection.")
            }
        }

        const timer = window.setTimeout(() => {
            if (active) setShowManualButton(true)
        }, 3000)

        void run()

        return () => {
            active = false
            window.clearTimeout(timer)
        }
    }, [])

    return (
        <div className="flex items-center justify-center min-h-[80vh] px-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>QuickBooks Connection</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {message}
                    </div>
                    {showManualButton && (
                        <Button
                            className="w-full"
                            onClick={() => {
                                window.location.href = redirectTarget
                            }}
                        >
                            Return to estimates
                        </Button>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
