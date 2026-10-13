"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Loader2, TrendingUp } from "lucide-react"

interface FunnelMetrics {
    draft_saved: number
    quote_sent: number
    customer_portal_link_created: number
    quote_viewed: number
    quote_approved: number
    quote_change_requested: number
    payment_link_created: number
    payment_completed: number
    send_rate: number
    approval_link_rate: number
    view_rate: number
    approval_rate: number
    change_request_rate: number
    payment_rate: number
    payment_after_approval_rate: number
}

export function FunnelMetricsCard() {
    const [loading, setLoading] = useState(true)
    const [metrics, setMetrics] = useState<FunnelMetrics | null>(null)

    useEffect(() => {
        const load = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession()
                const accessToken = session?.access_token

                if (!accessToken) {
                    setLoading(false)
                    return
                }

                const response = await fetch("/api/analytics/funnel", {
                    headers: {
                        authorization: `Bearer ${accessToken}`,
                    },
                })

                if (!response.ok) {
                    setLoading(false)
                    return
                }

                const data = await response.json()
                const quoteSent = Number(data.quote_sent || 0)
                const customerPortalLinkCreated = Number(data.customer_portal_link_created || 0)
                const quoteViewed = Number(data.quote_viewed || 0)
                const quoteApproved = Number(data.quote_approved || 0)
                const quoteChangeRequested = Number(data.quote_change_requested || 0)
                setMetrics({
                    draft_saved: data.draft_saved || 0,
                    quote_sent: quoteSent,
                    customer_portal_link_created: customerPortalLinkCreated,
                    quote_viewed: quoteViewed,
                    quote_approved: quoteApproved,
                    quote_change_requested: quoteChangeRequested,
                    payment_link_created: data.payment_link_created || 0,
                    payment_completed: data.payment_completed || 0,
                    send_rate: data.send_rate || 0,
                    approval_link_rate:
                        data.approval_link_rate ??
                        (quoteSent > 0
                            ? Number(((customerPortalLinkCreated / quoteSent) * 100).toFixed(1))
                            : 0),
                    view_rate:
                        data.view_rate ??
                        (customerPortalLinkCreated > 0
                            ? Number(((quoteViewed / customerPortalLinkCreated) * 100).toFixed(1))
                            : 0),
                    approval_rate:
                        data.approval_rate ??
                        (customerPortalLinkCreated > 0
                            ? Number(((quoteApproved / customerPortalLinkCreated) * 100).toFixed(1))
                            : 0),
                    change_request_rate:
                        data.change_request_rate ??
                        (customerPortalLinkCreated > 0
                            ? Number(((quoteChangeRequested / customerPortalLinkCreated) * 100).toFixed(1))
                            : 0),
                    payment_rate: data.payment_rate || 0,
                    payment_after_approval_rate:
                        data.payment_after_approval_rate ??
                        (quoteApproved > 0
                            ? Number(((Number(data.payment_completed || 0) / quoteApproved) * 100).toFixed(1))
                            : 0),
                })
            } catch (error) {
                console.error("Failed to load funnel metrics:", error)
            } finally {
                setLoading(false)
            }
        }

        void load()
    }, [])

    if (loading) {
        return (
            <div className="field-card flex items-center justify-center p-6 text-sm text-slate-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-blue-300" />
                Loading conversion metrics...
            </div>
        )
    }

    if (!metrics) {
        return (
            <div className="field-card p-6 text-sm text-slate-400">
                Sign in to view conversion funnel metrics.
            </div>
        )
    }

    return (
        <div className="field-card">
            <div className="border-b border-white/10 p-4 pb-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                    <TrendingUp className="h-4 w-4 text-blue-200" />
                    Conversion Funnel (30d)
                </h2>
            </div>
            <div className="space-y-3 p-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                    <div className="field-mini p-3">
                        <p className="text-xs text-slate-400">Send Rate</p>
                        <p className="text-xl font-bold text-white">{metrics.send_rate}%</p>
                        <p className="text-xs text-slate-400">{metrics.quote_sent}/{metrics.draft_saved}</p>
                    </div>
                    <div className="field-mini p-3">
                        <p className="text-xs text-slate-400">Approval Link Rate</p>
                        <p className="text-xl font-bold text-white">{metrics.approval_link_rate}%</p>
                        <p className="text-xs text-slate-400">
                            {metrics.customer_portal_link_created}/{metrics.quote_sent}
                        </p>
                    </div>
                    <div className="field-mini p-3">
                        <p className="text-xs text-slate-400">View Rate</p>
                        <p className="text-xl font-bold text-white">{metrics.view_rate}%</p>
                        <p className="text-xs text-slate-400">
                            {metrics.quote_viewed}/{metrics.customer_portal_link_created}
                        </p>
                    </div>
                    <div className="field-mini p-3">
                        <p className="text-xs text-slate-400">Approval Rate</p>
                        <p className="text-xl font-bold text-white">{metrics.approval_rate}%</p>
                        <p className="text-xs text-slate-400">
                            {metrics.quote_approved}/{metrics.customer_portal_link_created}
                        </p>
                    </div>
                    <div className="field-mini p-3">
                        <p className="text-xs text-slate-400">Payment Rate</p>
                        <p className="text-xl font-bold text-white">{metrics.payment_rate}%</p>
                        <p className="text-xs text-slate-400">{metrics.payment_completed}/{metrics.quote_sent}</p>
                    </div>
                </div>
                <div className="grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
                    <p>Approval links created: {metrics.customer_portal_link_created}</p>
                    <p>Customer views: {metrics.quote_viewed}</p>
                    <p>Customer approvals: {metrics.quote_approved}</p>
                    <p>Change requests: {metrics.quote_change_requested}</p>
                    <p>Payment links created: {metrics.payment_link_created}</p>
                </div>
            </div>
        </div>
    )
}
