"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Copy, Gift, Loader2, RefreshCw, Users } from "lucide-react"
import { copyReferralShareUrl, getReferralStatus, type ReferralStatusResponse } from "@/lib/referrals"
import { toast } from "@/components/toast"

export function ReferralStatusCard() {
    const [loading, setLoading] = useState(true)
    const [copying, setCopying] = useState(false)
    const [status, setStatus] = useState<ReferralStatusResponse | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const next = await getReferralStatus()
            setStatus(next)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void load()
    }, [load])

    const handleCopy = async () => {
        setCopying(true)
        try {
            const shareUrl = await copyReferralShareUrl({ source: "profile_referral" })
            if (!shareUrl) {
                toast("🔐 Log in first to generate your referral link.", "info")
                return
            }

            toast("🔗 Referral link copied.", "success")
        } catch (error) {
            console.error("Failed to copy referral link:", error)
            toast("❌ Failed to copy referral link.", "error")
        } finally {
            setCopying(false)
        }
    }

    return (
        <Card className="border-primary/20">
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Gift className="h-5 w-5" />
                            Referral Rewards
                        </CardTitle>
                        <CardDescription>
                            Invite another contractor. They get 14 days of Pro, and you earn one free month.
                        </CardDescription>
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => void load()}
                        disabled={loading}
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {loading ? (
                    <div className="rounded-lg border p-4 text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading referral status...
                    </div>
                ) : !status ? (
                    <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                        Referral status is unavailable right now.
                    </div>
                ) : (
                    <>
                        <div className="rounded-lg border p-3 bg-muted/40 space-y-2">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider">Share link</p>
                            <p className="text-sm font-mono break-all">{status.shareUrl}</p>
                            <div className="flex flex-wrap gap-2">
                                <Button type="button" onClick={handleCopy} disabled={copying}>
                                    {copying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Copy className="h-4 w-4 mr-2" />}
                                    Copy referral link
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Spanish share copy preview: {status.shareMessages.es}
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg border p-3">
                                <p className="text-xs text-muted-foreground">Visits</p>
                                <p className="text-2xl font-semibold">{status.metrics.visits}</p>
                            </div>
                            <div className="rounded-lg border p-3">
                                <p className="text-xs text-muted-foreground">Successful claims</p>
                                <p className="text-2xl font-semibold">{status.metrics.successfulClaims}</p>
                            </div>
                            <div className="rounded-lg border p-3">
                                <p className="text-xs text-muted-foreground">Share clicks</p>
                                <p className="text-2xl font-semibold">{status.metrics.shareClicks}</p>
                            </div>
                            <div className="rounded-lg border p-3">
                                <p className="text-xs text-muted-foreground">Signup starts</p>
                                <p className="text-2xl font-semibold">{status.metrics.signupStarts}</p>
                            </div>
                        </div>

                        <div className="rounded-lg border p-3 space-y-2">
                            <div className="flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                <p className="text-sm font-medium">Reward state</p>
                            </div>
                            {status.rewards.activeReward ? (
                                <p className="text-sm text-emerald-700">
                                    Active {status.rewards.activeReward.kind === "referred_trial" ? "referred trial" : "referrer bonus"} until{" "}
                                    {new Date(status.rewards.activeReward.endsAt).toLocaleDateString()}.
                                </p>
                            ) : (
                                <p className="text-sm text-muted-foreground">No active referral reward window right now.</p>
                            )}
                            <p className="text-sm text-muted-foreground">
                                Pending credit months: <span className="font-medium text-foreground">{status.rewards.pendingCreditMonths}</span>
                            </p>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    )
}
