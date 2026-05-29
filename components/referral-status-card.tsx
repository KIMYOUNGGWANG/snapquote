"use client"

import { useCallback, useEffect, useState } from "react"
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
                toast("Log in first to generate your referral link.", "info")
                return
            }

            toast("Referral link copied.", "success")
        } catch (error) {
            console.error("Failed to copy referral link:", error)
            toast("Failed to copy referral link.", "error")
        } finally {
            setCopying(false)
        }
    }

    return (
        <div className="field-card">
            <div className="border-b border-white/10 p-4 pb-3">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                            <Gift className="h-5 w-5 text-blue-200" />
                            Referral Rewards
                        </h2>
                        <p className="mt-1 text-sm text-slate-400">
                            Invite another contractor. They get 14 days of Pro, and you earn one free month.
                        </p>
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => void load()}
                        disabled={loading}
                        aria-label="Refresh referral status"
                        className="rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </Button>
                </div>
            </div>
            <div className="space-y-4 p-4">
                {loading ? (
                    <div className="field-mini flex items-center gap-2 p-4 text-sm text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-300" />
                        Loading referral status...
                    </div>
                ) : !status ? (
                    <div className="field-mini p-4 text-sm text-slate-400">
                        Referral status is unavailable right now.
                    </div>
                ) : (
                    <>
                        <div className="field-mini space-y-2 p-3">
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Share link</p>
                            <p className="break-all font-mono text-sm text-slate-200">{status.shareUrl}</p>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    onClick={handleCopy}
                                    disabled={copying}
                                    className="rounded-lg bg-blue-600 text-white hover:bg-blue-500"
                                >
                                    {copying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}
                                    Copy referral link
                                </Button>
                            </div>
                            <p className="text-xs text-slate-400">
                                Spanish share copy preview: {status.shareMessages.es}
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="field-mini p-3">
                                <p className="text-xs text-slate-400">Visits</p>
                                <p className="text-2xl font-semibold text-white">{status.metrics.visits}</p>
                            </div>
                            <div className="field-mini p-3">
                                <p className="text-xs text-slate-400">Successful claims</p>
                                <p className="text-2xl font-semibold text-white">{status.metrics.successfulClaims}</p>
                            </div>
                            <div className="field-mini p-3">
                                <p className="text-xs text-slate-400">Share clicks</p>
                                <p className="text-2xl font-semibold text-white">{status.metrics.shareClicks}</p>
                            </div>
                            <div className="field-mini p-3">
                                <p className="text-xs text-slate-400">Signup starts</p>
                                <p className="text-2xl font-semibold text-white">{status.metrics.signupStarts}</p>
                            </div>
                        </div>

                        <div className="field-mini space-y-2 p-3">
                            <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-blue-200" />
                                <p className="text-sm font-medium text-white">Reward state</p>
                            </div>
                            {status.rewards.activeReward ? (
                                <p className="text-sm text-emerald-200">
                                    Active {status.rewards.activeReward.kind === "referred_trial" ? "referred trial" : "referrer bonus"} until{" "}
                                    {new Date(status.rewards.activeReward.endsAt).toLocaleDateString()}.
                                </p>
                            ) : (
                                <p className="text-sm text-slate-400">No active referral reward window right now.</p>
                            )}
                            <p className="text-sm text-slate-400">
                                Pending credit months: <span className="font-medium text-white">{status.rewards.pendingCreditMonths}</span>
                            </p>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
