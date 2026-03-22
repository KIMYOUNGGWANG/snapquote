"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Download, FileText, Copy, Trash2, Mail, AlertCircle, MessageSquare, RefreshCw, Link2, Clock3, CloudUpload, CircleDollarSign, Send } from "lucide-react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { getEstimates, deleteEstimate, getProfile, updateEstimateStatus, updateEstimate, type LocalEstimate, type EstimateItem, type BusinessInfo } from "@/lib/estimates-storage"
import { toast } from "@/components/toast"
import { generateQuickBooksCSV, downloadCSV } from "@/lib/export-service"
const ConfirmDialog = dynamic(() => import("@/components/confirm-dialog").then(mod => mod.ConfirmDialog), { ssr: false })
const PDFPreviewModal = dynamic(() => import("@/components/pdf-preview-modal").then(mod => mod.PDFPreviewModal), { ssr: false })
const FollowUpModal = dynamic(() => import("@/components/follow-up-modal").then(mod => mod.FollowUpModal), { ssr: false })
const SmsModal = dynamic(() => import("@/components/sms-modal").then(mod => mod.SmsModal), { ssr: false })
import { Badge } from "@/components/ui/badge"
import { trackAnalyticsEvent } from "@/lib/analytics"
import { withAuthHeaders } from "@/lib/auth-headers"
import { useAuthGuard } from "@/lib/use-auth-guard"
import { sendEstimateSms } from "@/lib/send-sms"
import { formatPendingSyncSummary, summarizePendingSync } from "@/lib/offline-sync"
import { getBillingSubscriptionStatus, type BillingSubscriptionStatusResponse } from "@/lib/pricing"
import {
    getQuickBooksStatus,
    startQuickBooksConnect,
    syncEstimateToQuickBooks,
    type QuickBooksStatusResponse,
} from "@/lib/quickbooks"
import { hasPdfBrandingAccess, hasPdfTemplateAccess } from "@/lib/pdf-branding"
import { cn } from "@/lib/utils"

type TabType = 'drafts' | 'sent' | 'paid'

type StripePaymentStatusResponse = {
    ok: boolean
    paid: boolean
    checkoutSessionId?: string
    paidAt?: string
}

function formatAmount(amount: number): string {
    return `$${amount.toFixed(2)}`
}

function getEstimateStatusTone(status: LocalEstimate["status"]) {
    if (status === "paid") {
        return "bg-emerald-100 text-emerald-800"
    }

    if (status === "sent") {
        return "bg-sky-100 text-sky-800"
    }

    return "bg-amber-100 text-amber-800"
}

export default function HistoryPage() {
    const router = useRouter()
    const { authResolved, isAuthenticated } = useAuthGuard("/history")
    const [estimates, setEstimates] = useState<LocalEstimate[]>([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<TabType>('drafts')
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [estimateToDelete, setEstimateToDelete] = useState<string | null>(null)
    const [previewEstimate, setPreviewEstimate] = useState<LocalEstimate | null>(null)
    const [followUpEstimate, setFollowUpEstimate] = useState<LocalEstimate | null>(null)
    const [smsEstimate, setSmsEstimate] = useState<LocalEstimate | null>(null)
    const [businessProfile, setBusinessProfile] = useState<BusinessInfo | undefined>(undefined)
    const [downloadingEstimateId, setDownloadingEstimateId] = useState<string | null>(null)
    const [subscription, setSubscription] = useState<BillingSubscriptionStatusResponse | null>(null)
    const [quickBooksStatus, setQuickBooksStatus] = useState<QuickBooksStatusResponse | null>(null)
    const [quickBooksLoading, setQuickBooksLoading] = useState(true)
    const [quickBooksConnecting, setQuickBooksConnecting] = useState(false)
    const [syncingQuickBooksEstimateId, setSyncingQuickBooksEstimateId] = useState<string | null>(null)
    const paymentStatusSyncInFlightRef = useRef(false)

    const loadQuickBooks = useCallback(async () => {
        setQuickBooksLoading(true)
        try {
            const status = await getQuickBooksStatus()
            setQuickBooksStatus(status)
        } finally {
            setQuickBooksLoading(false)
        }
    }, [])

    const syncSentEstimatePaymentStatuses = useCallback(async (sourceEstimates?: LocalEstimate[]) => {
        if (paymentStatusSyncInFlightRef.current) return

        const estimatesForSync = sourceEstimates ?? await getEstimates()
        const sentWithPaymentLinks = estimatesForSync.filter(
            (estimate) => estimate.status === "sent" && Boolean(estimate.paymentLinkId)
        )

        if (sentWithPaymentLinks.length === 0) return

        paymentStatusSyncInFlightRef.current = true

        try {
            let updatedCount = 0
            const headers = await withAuthHeaders()

            for (const estimate of sentWithPaymentLinks) {
                const paymentLinkId = estimate.paymentLinkId?.trim()
                if (!paymentLinkId) continue

                const params = new URLSearchParams({ paymentLinkId })
                if (estimate.id) params.set("estimateId", estimate.id)
                if (estimate.estimateNumber) params.set("estimateNumber", estimate.estimateNumber)

                const response = await fetch(`/api/payments/stripe/status?${params.toString()}`, {
                    method: "GET",
                    cache: "no-store",
                    headers,
                })

                if (!response.ok) continue

                const result = await response.json() as StripePaymentStatusResponse
                if (!result.ok || !result.paid) continue

                await updateEstimate(estimate.id, {
                    status: "paid",
                    paymentCompletedAt: result.paidAt || new Date().toISOString(),
                    lastPaymentSessionId: result.checkoutSessionId,
                    synced: false,
                })

                updatedCount += 1
                void trackAnalyticsEvent({
                    event: "payment_completed",
                    estimateId: estimate.id,
                    estimateNumber: estimate.estimateNumber,
                    channel: "stripe_status_poll",
                    metadata: {
                        checkoutSessionId: result.checkoutSessionId,
                    },
                })
            }

            if (updatedCount > 0) {
                const refreshed = await getEstimates()
                setEstimates(refreshed)
                toast(`💰 ${updatedCount} payment${updatedCount > 1 ? "s" : ""} synced.`, "success")
            }
        } catch (error) {
            console.error("Failed to sync sent estimate payment statuses:", error)
        } finally {
            paymentStatusSyncInFlightRef.current = false
        }
    }, [])

    const loadData = useCallback(async () => {
        const [localEstimates, status, subscriptionStatus] = await Promise.all([
            getEstimates(),
            getQuickBooksStatus(),
            getBillingSubscriptionStatus(),
        ])
        setEstimates(localEstimates)
        setQuickBooksStatus(status)
        setSubscription(subscriptionStatus)
        setQuickBooksLoading(false)
        const profile = getProfile()
        if (profile) setBusinessProfile(profile)
        setLoading(false)
        void syncSentEstimatePaymentStatuses(localEstimates)
    }, [syncSentEstimatePaymentStatuses])

    useEffect(() => {
        if (!authResolved || !isAuthenticated) return
        void loadData()
    }, [authResolved, isAuthenticated, loadData])

    useEffect(() => {
        if (!authResolved || !isAuthenticated) return

        const intervalId = window.setInterval(() => {
            void syncSentEstimatePaymentStatuses()
        }, 20_000)

        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                void syncSentEstimatePaymentStatuses()
            }
        }

        document.addEventListener("visibilitychange", handleVisibilityChange)
        return () => {
            window.clearInterval(intervalId)
            document.removeEventListener("visibilitychange", handleVisibilityChange)
        }
    }, [authResolved, isAuthenticated, syncSentEstimatePaymentStatuses])

    const filteredEstimates = useMemo(() => {
        return estimates.filter((estimate) => {
            if (activeTab === "drafts") {
                return estimate.status === "draft" || !estimate.status
            }

            if (activeTab === "sent") {
                return estimate.status === "sent"
            }

            return estimate.status === "paid"
        })
    }, [activeTab, estimates])

    const historyMetrics = useMemo(() => {
        const drafts = estimates.filter((estimate) => estimate.status === "draft" || !estimate.status)
        const sent = estimates.filter((estimate) => estimate.status === "sent")
        const paid = estimates.filter((estimate) => estimate.status === "paid")

        const draftValue = drafts.reduce((sum, estimate) => sum + estimate.totalAmount, 0)
        const sentValue = sent.reduce((sum, estimate) => sum + estimate.totalAmount, 0)
        const paidValue = paid.reduce((sum, estimate) => sum + estimate.totalAmount, 0)
        const latestUpdatedAt = estimates[0]?.updatedAt || estimates[0]?.createdAt || null

        return {
            draftsCount: drafts.length,
            sentCount: sent.length,
            paidCount: paid.length,
            draftValue,
            sentValue,
            paidValue,
            latestUpdatedAt,
        }
    }, [estimates])

    const draftsCount = historyMetrics.draftsCount
    const sentCount = historyMetrics.sentCount
    const paidCount = historyMetrics.paidCount
    const pendingSyncSummary = summarizePendingSync(estimates, 0)
    const activeTabLabel = activeTab === "drafts" ? "Draft queue" : activeTab === "sent" ? "Awaiting payment" : "Collected"
    const latestActivityLabel = historyMetrics.latestUpdatedAt
        ? new Date(historyMetrics.latestUpdatedAt).toLocaleString()
        : "No estimate activity yet"
    const quickBooksSummaryLabel = quickBooksStatus?.syncStats.latestSyncedAt
        ? `Last synced ${new Date(quickBooksStatus.syncStats.latestSyncedAt).toLocaleString()}`
        : quickBooksStatus?.connected
            ? "Connected, but no invoices synced yet"
            : "No QuickBooks connection yet"

    // Count items with price TBD
    const getPriceTBDCount = (estimate: LocalEstimate): number => {
        return estimate.items?.filter(item => item.unit_price === 0).length || 0
    }

    const toggleExpand = (estimateId: string) => {
        setExpandedId(expandedId === estimateId ? null : estimateId)
    }

    const handleDuplicate = (estimate: LocalEstimate) => {
        const duplicateData = {
            items: estimate.items,
            summary_note: estimate.summary_note,
            clientName: estimate.clientName,
            clientAddress: estimate.clientAddress,
            taxRate: estimate.taxRate
        }
        localStorage.setItem('duplicate_estimate', JSON.stringify(duplicateData))
        router.push('/new-estimate')
    }

    const handleMarkAsSent = async (estimateId: string) => {
        const targetEstimate = estimates.find(est => est.id === estimateId)
        await updateEstimateStatus(estimateId, 'sent')
        if (targetEstimate) {
            void trackAnalyticsEvent({
                event: "quote_sent",
                estimateId: targetEstimate.id,
                estimateNumber: targetEstimate.estimateNumber,
                channel: "manual_status",
            })
        }
        await loadData()
        toast("✅ Marked as sent!", "success")
    }

    const handleMarkAsPaid = async (estimateId: string) => {
        const targetEstimate = estimates.find(est => est.id === estimateId)
        await updateEstimateStatus(estimateId, 'paid')
        if (targetEstimate) {
            void trackAnalyticsEvent({
                event: "payment_completed",
                estimateId: targetEstimate.id,
                estimateNumber: targetEstimate.estimateNumber,
                channel: "manual_status",
            })
        }
        await loadData()
        toast("💰 Marked as paid!", "success")
    }

    const handleConvertToInvoice = async (estimate: LocalEstimate) => {
        // Optimistic update
        await updateEstimate(estimate.id, {
            type: 'invoice',
            status: 'sent' // Ensure it's marked as sent/final
        })
        await loadData()
        toast("💰 Converted to Invoice!", "success")
    }

    const handleDeleteClick = (e: React.MouseEvent, estimateId: string) => {
        e.stopPropagation()
        e.preventDefault()
        setEstimateToDelete(estimateId)
        setDeleteDialogOpen(true)
    }

    const handleExportCSV = () => {
        if (estimates.length === 0) {
            toast("⚠️ No estimates to export.", "error")
            return
        }
        const csv = generateQuickBooksCSV(estimates)
        downloadCSV(csv, `snapquote_export_${new Date().toISOString().split('T')[0]}.csv`)
        toast("📊 Exported to CSV!", "success")
    }

    const handleConnectQuickBooks = useCallback(async () => {
        if (quickBooksStatus && !quickBooksStatus.eligible) {
            toast("🔒 QuickBooks sync requires Pro or Team.", "info")
            return
        }

        setQuickBooksConnecting(true)
        try {
            const result = await startQuickBooksConnect("/history")
            if (!result?.url) {
                toast("❌ Failed to start QuickBooks connect.", "error")
                return
            }

            window.location.href = result.url
        } finally {
            setQuickBooksConnecting(false)
        }
    }, [quickBooksStatus])

    const handleSyncQuickBooks = useCallback(async (estimate: LocalEstimate) => {
        if (!quickBooksStatus?.connected) {
            toast("🔗 Connect QuickBooks first.", "info")
            return
        }

        if (!estimate.clientName?.trim() || !estimate.items?.length) {
            toast("⚠️ Add a client name and at least one line item first.", "error")
            return
        }

        setSyncingQuickBooksEstimateId(estimate.id)

        try {
            const response = await syncEstimateToQuickBooks({
                estimateId: estimate.id,
                estimateNumber: estimate.estimateNumber,
                clientName: estimate.clientName,
                clientAddress: estimate.clientAddress,
                summaryNote: estimate.summary_note,
                taxAmount: estimate.taxAmount,
                totalAmount: estimate.totalAmount,
                type: estimate.type === "invoice" ? "invoice" : "estimate",
                items: estimate.items.map((item) => ({
                    id: item.id,
                    description: item.description,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    total: item.total,
                    category: item.category,
                    unit: item.unit,
                })),
            })

            if (!response) {
                toast("❌ Failed to sync to QuickBooks.", "error")
                return
            }

            await updateEstimate(estimate.id, {
                quickbooksInvoiceId: response.invoiceId,
                quickbooksCustomerId: response.customerId,
                quickbooksDocNumber: response.docNumber,
                quickbooksInvoiceStatus: response.status,
                quickbooksSyncedAt: response.syncedAt,
            })

            const refreshed = await getEstimates()
            setEstimates(refreshed)
            await loadQuickBooks()

            toast(response.deduped ? "🔁 QuickBooks invoice already linked." : "✅ Synced to QuickBooks.", "success")
        } finally {
            setSyncingQuickBooksEstimateId(null)
        }
    }, [loadQuickBooks, quickBooksStatus])

    const handleConfirmDelete = async () => {
        if (estimateToDelete) {
            await deleteEstimate(estimateToDelete)
            await loadData()
            toast("✅ Estimate deleted", "success")
            setEstimateToDelete(null)
            setDeleteDialogOpen(false)
        }
    }

    const handleSendSms = useCallback(async (estimate: LocalEstimate, toPhoneNumber: string, message: string) => {
        const data = await sendEstimateSms({
            estimateId: estimate.id,
            toPhoneNumber,
            message,
        })

        if (estimate.status !== "sent" && estimate.status !== "paid") {
            await updateEstimateStatus(estimate.id, "sent")
        }

        void trackAnalyticsEvent({
            event: "quote_sent",
            estimateId: estimate.id,
            estimateNumber: estimate.estimateNumber,
            channel: "sms",
            metadata: {
                creditsRemaining: data.creditsRemaining,
                deduped: data.deduped ?? false,
                source: "history",
            },
        })

        await loadData()
        toast("✅ SMS sent!", "success")
    }, [loadData])

    const createEstimatePdfDocument = useCallback(async (estimate: LocalEstimate) => {
        const { EstimatePDF } = await import("@/components/estimate-pdf")
        const pdfBusinessProfile = businessProfile
            ? {
                ...businessProfile,
                logo_url: hasPdfBrandingAccess(subscription?.planTier) ? businessProfile.logo_url : "",
                estimate_template_url: hasPdfTemplateAccess(subscription?.planTier) ? businessProfile.estimate_template_url : "",
            }
            : undefined

        return (
            <EstimatePDF
                items={estimate.items || []}
                total={estimate.totalAmount}
                summary={estimate.summary_note}
                taxRate={estimate.taxRate || 0}
                client={{
                    name: estimate.clientName,
                    address: estimate.clientAddress
                }}
                business={pdfBusinessProfile}
                templateUrl={pdfBusinessProfile?.estimate_template_url}
                photos={estimate.attachments?.photos}
                type={estimate.type}
                paymentLink={estimate.paymentLink || businessProfile?.payment_link}
            />
        )
    }, [businessProfile, subscription?.planTier])

    const handleDownloadPdf = useCallback(async (estimate: LocalEstimate) => {
        setDownloadingEstimateId(estimate.id)
        try {
            const [{ pdf }, pdfDocument] = await Promise.all([
                import("@react-pdf/renderer"),
                createEstimatePdfDocument(estimate),
            ])
            const blob = await pdf(pdfDocument).toBlob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `${estimate.estimateNumber || "estimate"}.pdf`
            a.click()
            URL.revokeObjectURL(url)
        } catch (error) {
            console.error("History PDF download failed:", error)
            toast("❌ Failed to download PDF.", "error")
        } finally {
            setDownloadingEstimateId(null)
        }
    }, [createEstimatePdfDocument])

    if (!authResolved || !isAuthenticated || loading) {
        return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
    }

    return (
        <div className="mx-auto max-w-5xl space-y-6 px-4 pb-20 pt-6">
            <Card className="overflow-hidden border-primary/[0.15] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
                <CardContent className="space-y-6 p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-3">
                            <Badge className="w-fit bg-white/10 text-white hover:bg-white/10">
                                <FileText className="mr-1 h-3.5 w-3.5" />
                                Estimate History
                            </Badge>
                            <div className="space-y-2">
                                <h1 className="text-3xl font-semibold tracking-[-0.04em]">Quotes, payments, and follow-up state</h1>
                                <p className="max-w-2xl text-sm leading-6 text-slate-300">
                                    Review every local and synced estimate, track what still needs payment, and push finalized work into QuickBooks without losing offline context.
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="border-white/[0.15] bg-white/5 text-white hover:bg-white/10 hover:text-white"
                                onClick={() => router.push("/new-estimate")}
                            >
                                <FileText className="mr-2 h-4 w-4" />
                                New Estimate
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="border-white/[0.15] bg-white/5 text-white hover:bg-white/10 hover:text-white"
                                onClick={handleExportCSV}
                                title="Export for QuickBooks"
                            >
                                <Download className="mr-2 h-4 w-4" />
                                Export CSV
                            </Button>
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="flex items-center justify-between">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Draft pipeline</p>
                                <FileText className="h-4 w-4 text-slate-400" />
                            </div>
                            <p className="mt-3 text-3xl font-semibold">{draftsCount}</p>
                            <p className="mt-1 text-xs text-slate-400">{formatAmount(historyMetrics.draftValue)} in open draft value</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="flex items-center justify-between">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Awaiting payment</p>
                                <Send className="h-4 w-4 text-slate-400" />
                            </div>
                            <p className="mt-3 text-3xl font-semibold">{sentCount}</p>
                            <p className="mt-1 text-xs text-slate-400">{formatAmount(historyMetrics.sentValue)} currently out with customers</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="flex items-center justify-between">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Collected</p>
                                <CircleDollarSign className="h-4 w-4 text-slate-400" />
                            </div>
                            <p className="mt-3 text-3xl font-semibold">{paidCount}</p>
                            <p className="mt-1 text-xs text-slate-400">{formatAmount(historyMetrics.paidValue)} marked paid</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="flex items-center justify-between">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Latest activity</p>
                                <Clock3 className="h-4 w-4 text-slate-400" />
                            </div>
                            <p className="mt-3 text-sm font-semibold leading-6">{latestActivityLabel}</p>
                            <p className="mt-1 text-xs text-slate-400">{estimates.length} total estimate records on device</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
                <Card className={cn("border-border/70", pendingSyncSummary.unsyncedEstimateCount > 0 && "border-amber-300 bg-amber-50/50")}>
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <CloudUpload className="h-5 w-5" />
                            Offline Queue
                        </CardTitle>
                        <CardDescription>
                            Device-local edits stay safe here until cloud sync catches up.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Queued changes</p>
                                <p className="mt-2 text-3xl font-semibold">{pendingSyncSummary.unsyncedEstimateCount}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {pendingSyncSummary.unsyncedEstimateCount > 0 ? formatPendingSyncSummary(pendingSyncSummary) : "All local estimate changes are synced."}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Current focus</p>
                                <p className="mt-2 text-lg font-semibold">{activeTabLabel}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {filteredEstimates.length} estimate{filteredEstimates.length === 1 ? "" : "s"} visible in this lane
                                </p>
                            </div>
                        </div>

                        {pendingSyncSummary.unsyncedEstimateCount > 0 ? (
                            <div className="rounded-2xl border border-amber-300 bg-white/80 p-4 text-sm text-amber-900">
                                <p className="font-semibold">Local changes waiting to sync</p>
                                <p className="mt-1 text-amber-800">{formatPendingSyncSummary(pendingSyncSummary)}</p>
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-900">
                                All draft, sent, and paid updates in local storage are currently synced.
                            </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                            <Badge variant="outline" className="bg-background">
                                Plan {subscription?.planTier || "free"}
                            </Badge>
                            <Badge variant="outline" className="bg-background">
                                {pendingSyncSummary.draftCount} draft updates
                            </Badge>
                            <Badge variant="outline" className="bg-background">
                                {pendingSyncSummary.sentCount} sent updates
                            </Badge>
                            <Badge variant="outline" className="bg-background">
                                {pendingSyncSummary.paidCount} paid updates
                            </Badge>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-primary/20">
                    <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <Link2 className="h-5 w-5" />
                                    QuickBooks Sync
                                </CardTitle>
                                <CardDescription>
                                    Push won estimates into QuickBooks Online. CSV export stays available as a fallback.
                                </CardDescription>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => void loadQuickBooks()}
                                disabled={quickBooksLoading}
                            >
                                {quickBooksLoading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <RefreshCw className="h-4 w-4" />
                                )}
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {quickBooksLoading ? (
                            <div className="flex items-center gap-2 rounded-2xl border p-4 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading QuickBooks status...
                            </div>
                        ) : !quickBooksStatus ? (
                            <div className="rounded-2xl border p-4 text-sm text-muted-foreground">
                                QuickBooks status is unavailable right now.
                            </div>
                        ) : (
                            <>
                                <div className="grid gap-3 sm:grid-cols-3">
                                    <div className="rounded-2xl border p-4">
                                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Plan access</p>
                                        <p className="mt-2 text-2xl font-semibold capitalize">
                                            {quickBooksStatus.eligible ? quickBooksStatus.planTier : "Upgrade"}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border p-4">
                                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Synced invoices</p>
                                        <p className="mt-2 text-2xl font-semibold">{quickBooksStatus.syncStats.syncedInvoices}</p>
                                    </div>
                                    <div className="rounded-2xl border p-4">
                                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Connection</p>
                                        <p className="mt-2 text-2xl font-semibold">{quickBooksStatus.connected ? "Live" : "Offline"}</p>
                                    </div>
                                </div>

                                <div className="rounded-2xl border p-4">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                        <div>
                                            <p className="text-sm font-medium">
                                                {quickBooksStatus.connected ? "Connected to QuickBooks Online" : "Not connected"}
                                            </p>
                                            <p className="mt-1 text-sm text-muted-foreground">
                                                {quickBooksStatus.connected
                                                    ? `Company ID ${quickBooksStatus.realmId || "linked"}.`
                                                    : quickBooksStatus.eligible
                                                        ? "Connect your QuickBooks company to create invoices directly from SnapQuote."
                                                        : "Upgrade to Pro or Team to unlock direct QuickBooks invoice sync."}
                                            </p>
                                        </div>
                                        <Badge variant="outline" className="w-fit">
                                            {quickBooksSummaryLabel}
                                        </Badge>
                                    </div>
                                    {quickBooksStatus.reconnectRequired && (
                                        <p className="mt-3 text-xs text-amber-700">
                                            Your QuickBooks token needs a fresh reconnect.
                                        </p>
                                    )}
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        <Button
                                            type="button"
                                            onClick={() => void handleConnectQuickBooks()}
                                            disabled={quickBooksConnecting || !quickBooksStatus.eligible}
                                        >
                                            {quickBooksConnecting ? (
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : (
                                                <Link2 className="mr-2 h-4 w-4" />
                                            )}
                                            {quickBooksStatus.connected ? "Reconnect QuickBooks" : "Connect QuickBooks"}
                                        </Button>
                                        <Button variant="outline" type="button" onClick={handleExportCSV}>
                                            <Download className="mr-2 h-4 w-4" />
                                            Export CSV
                                        </Button>
                                    </div>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card className="border-border/70">
                <CardContent className="space-y-4 p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <p className="text-sm font-semibold">Estimate lanes</p>
                            <p className="text-sm text-muted-foreground">
                                Move from draft to sent to paid while keeping PDF, SMS, and QuickBooks actions close to the record.
                            </p>
                        </div>
                        <Badge variant="outline">{filteredEstimates.length} visible</Badge>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3">
                        <Button
                            variant={activeTab === "drafts" ? "default" : "ghost"}
                            className="h-auto justify-between rounded-xl px-4 py-3"
                            onClick={() => setActiveTab("drafts")}
                        >
                            <span className="flex items-center gap-2">
                                <FileText className="h-4 w-4" />
                                Drafts
                            </span>
                            <Badge variant="secondary">{draftsCount}</Badge>
                        </Button>
                        <Button
                            variant={activeTab === "sent" ? "default" : "ghost"}
                            className="h-auto justify-between rounded-xl px-4 py-3"
                            onClick={() => setActiveTab("sent")}
                        >
                            <span className="flex items-center gap-2">
                                <Send className="h-4 w-4" />
                                Sent
                            </span>
                            <Badge variant="secondary">{sentCount}</Badge>
                        </Button>
                        <Button
                            variant={activeTab === "paid" ? "default" : "ghost"}
                            className="h-auto justify-between rounded-xl px-4 py-3"
                            onClick={() => setActiveTab("paid")}
                        >
                            <span className="flex items-center gap-2">
                                <CircleDollarSign className="h-4 w-4" />
                                Paid
                            </span>
                            <Badge variant="secondary">{paidCount}</Badge>
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {filteredEstimates.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
                        <h3 className="mb-2 text-lg font-medium">
                            {activeTab === "drafts"
                                ? "No drafts yet"
                                : activeTab === "sent"
                                    ? "No sent estimates"
                                    : "No paid estimates"}
                        </h3>
                        <p className="mb-4 text-sm text-muted-foreground">
                            {activeTab === "drafts"
                                ? "Create a new estimate to get started."
                                : activeTab === "sent"
                                    ? "Drafts will appear here after you send them."
                                    : "Paid estimates will appear here after successful payment."}
                        </p>
                        {activeTab === "drafts" ? (
                            <Button onClick={() => router.push("/new-estimate")}>
                                Create New Estimate
                            </Button>
                        ) : null}
                    </CardContent>
                </Card>
            ) : (
                filteredEstimates.map((estimate) => {
                    const isExpanded = expandedId === estimate.id
                    const items = estimate.items || []
                    const priceTBDCount = getPriceTBDCount(estimate)

                    return (
                        <Card key={estimate.id} className="border-border/70">
                            <CardHeader className="pb-4">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="space-y-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <CardTitle className="text-xl">{estimate.clientName || "Client"}</CardTitle>
                                            {estimate.estimateNumber ? (
                                                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-mono">
                                                    {estimate.estimateNumber}
                                                </span>
                                            ) : null}
                                            <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium uppercase", getEstimateStatusTone(estimate.status))}>
                                                {estimate.type === "invoice"
                                                    ? "Invoice"
                                                    : estimate.status === "paid"
                                                        ? "Paid"
                                                        : estimate.status === "sent"
                                                            ? "Sent"
                                                            : "Draft"}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {priceTBDCount > 0 && activeTab === "drafts" ? (
                                                <Badge variant="outline" className="border-yellow-300 bg-yellow-50 text-yellow-700">
                                                    <AlertCircle className="mr-1 h-3 w-3" />
                                                    {priceTBDCount} TBD
                                                </Badge>
                                            ) : null}
                                            {estimate.synced === false ? (
                                                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                                                    Pending sync
                                                </Badge>
                                            ) : null}
                                            {estimate.quickbooksInvoiceId ? (
                                                <Badge variant="outline" className="border-sky-300 bg-sky-50 text-sky-800">
                                                    QB {estimate.quickbooksInvoiceStatus || "linked"}
                                                </Badge>
                                            ) : null}
                                        </div>
                                        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                                            {estimate.summary_note}
                                        </p>
                                    </div>

                                    <div className="w-full max-w-sm rounded-2xl border border-border/70 bg-muted/20 p-4 lg:w-auto">
                                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Estimate total</p>
                                        <p className="mt-2 text-3xl font-semibold">{formatAmount(estimate.totalAmount)}</p>
                                        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                                            <p>Created {new Date(estimate.createdAt).toLocaleDateString()}</p>
                                            <p>Updated {new Date(estimate.updatedAt || estimate.createdAt).toLocaleString()}</p>
                                            {estimate.sentAt ? <p>Sent {new Date(estimate.sentAt).toLocaleDateString()}</p> : null}
                                            {estimate.paymentCompletedAt ? <p>Paid {new Date(estimate.paymentCompletedAt).toLocaleString()}</p> : null}
                                        </div>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                    <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Client</p>
                                        <p className="mt-2 text-sm font-semibold">{estimate.clientName || "Missing client name"}</p>
                                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{estimate.clientAddress || "No client address saved"}</p>
                                    </div>
                                    <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Line items</p>
                                        <p className="mt-2 text-sm font-semibold">{items.length} item{items.length === 1 ? "" : "s"}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {priceTBDCount > 0 ? `${priceTBDCount} still missing pricing` : "Pricing is fully assigned"}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Payment state</p>
                                        <p className="mt-2 text-sm font-semibold">
                                            {estimate.paymentLinkId ? "Payment link attached" : "No payment link"}
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {estimate.paymentCompletedAt ? `Completed ${new Date(estimate.paymentCompletedAt).toLocaleDateString()}` : "Status polling keeps sent quotes current."}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">QuickBooks</p>
                                        <p className="mt-2 text-sm font-semibold">
                                            {estimate.quickbooksInvoiceId ? (estimate.quickbooksDocNumber || estimate.quickbooksInvoiceStatus || "Linked") : "Not synced"}
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {estimate.quickbooksSyncedAt ? `Synced ${new Date(estimate.quickbooksSyncedAt).toLocaleString()}` : "Sync this estimate when the record is ready."}
                                        </p>
                                    </div>
                                </div>

                                {/* Expanded Items */}
                                {isExpanded && items.length > 0 && (
                                    <div className="pt-3 border-t space-y-2">
                                        {items.map((item: EstimateItem, idx: number) => (
                                            <div key={idx} className={`flex justify-between text-sm ${item.unit_price === 0 ? 'bg-yellow-50 p-2 rounded border border-yellow-200' : ''}`}>
                                                <div>
                                                    <p className="font-medium">{item.description}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        Qty: {item.quantity} × ${item.unit_price.toFixed(2)}
                                                        {item.unit_price === 0 && <span className="ml-2 text-yellow-600">⚠️ Price TBD</span>}
                                                    </p>
                                                </div>
                                                <p className="font-semibold">{formatAmount(item.total)}</p>
                                            </div>
                                        ))}
                                        {estimate.taxAmount > 0 && (
                                            <div className="pt-2 border-t">
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-muted-foreground">Subtotal</span>
                                                    <span>{formatAmount(estimate.totalAmount - estimate.taxAmount)}</span>
                                                </div>
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-muted-foreground">Tax ({estimate.taxRate}%)</span>
                                                    <span>{formatAmount(estimate.taxAmount)}</span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Attachments Section - Dispute Prevention */}
                                        {estimate.attachments && (estimate.attachments.photos?.length > 0 || estimate.attachments.originalTranscript) && (
                                            <div className="pt-3 border-t mt-3">
                                                <p className="text-sm font-medium text-muted-foreground mb-2">📎 Original Data</p>

                                                {/* Photos */}
                                                {estimate.attachments.photos && estimate.attachments.photos.length > 0 && (
                                                    <div className="mb-2">
                                                        <p className="text-xs text-muted-foreground mb-1">Photos ({estimate.attachments.photos.length})</p>
                                                        <div className="flex gap-2 overflow-x-auto">
                                                            {estimate.attachments.photos.map((url, i) => (
                                                                // eslint-disable-next-line @next/next/no-img-element
                                                                <img
                                                                    key={i}
                                                                    src={url}
                                                                    alt={`Attachment ${i + 1}`}
                                                                    className="h-16 w-16 object-cover rounded border"
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Transcript */}
                                                {estimate.attachments.originalTranscript && (
                                                    <div>
                                                        <p className="text-xs text-muted-foreground mb-1">🎤 Original Transcript</p>
                                                        <p className="text-xs bg-muted p-2 rounded italic">
                                                            &ldquo;{estimate.attachments.originalTranscript}&rdquo;
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => toggleExpand(estimate.id)}
                                    >
                                        <FileText className="h-3 w-3 mr-1" />
                                        {isExpanded ? "Hide" : "Details"}
                                    </Button>

                                    {/* Mark as Sent button - only for drafts */}
                                    {activeTab === "drafts" && (
                                        <Button
                                            variant="default"
                                            size="sm"
                                            onClick={() => handleMarkAsSent(estimate.id)}
                                        >
                                            ✅ Mark Sent
                                        </Button>
                                    )}

                                    {activeTab === "sent" && estimate.status === "sent" && (
                                        <Button
                                            variant="default"
                                            size="sm"
                                            onClick={() => handleMarkAsPaid(estimate.id)}
                                        >
                                            💰 Mark Paid
                                        </Button>
                                    )}

                                    {/* Convert to Invoice - only for sent estimates that aren't already invoices */}
                                    {estimate.status === "sent" && estimate.type !== "invoice" && (
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => handleConvertToInvoice(estimate)}
                                        >
                                            💰 To Invoice
                                        </Button>
                                    )}

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleDuplicate(estimate)}
                                    >
                                        <Copy className="h-3 w-3 mr-1" />
                                        Duplicate
                                    </Button>
                                    {estimate.status !== "paid" && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setFollowUpEstimate(estimate)}
                                        >
                                            <Mail className="h-3 w-3 mr-1" />
                                            Follow-up
                                        </Button>
                                    )}
                                    {estimate.status !== "paid" && (
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => setSmsEstimate(estimate)}
                                        >
                                            <MessageSquare className="h-3 w-3 mr-1" />
                                            SMS
                                        </Button>
                                    )}
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => void handleSyncQuickBooks(estimate)}
                                        disabled={!quickBooksStatus?.connected || syncingQuickBooksEstimateId === estimate.id}
                                    >
                                        {syncingQuickBooksEstimateId === estimate.id ? (
                                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                        ) : (
                                            <Link2 className="h-3 w-3 mr-1" />
                                        )}
                                        {estimate.quickbooksInvoiceId ? "Refresh QB" : "QuickBooks"}
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={(e) => handleDeleteClick(e, estimate.id)}
                                    >
                                        <Trash2 className="h-3 w-3 mr-1" />
                                        Delete
                                    </Button>
                                    {items.length > 0 && (
                                        <>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setPreviewEstimate(estimate)}
                                            >
                                                <FileText className="h-3 w-3 mr-1" />
                                                Preview
                                            </Button>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => void handleDownloadPdf(estimate)}
                                                disabled={downloadingEstimateId === estimate.id}
                                            >
                                                {downloadingEstimateId === estimate.id ? (
                                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                                ) : (
                                                    <Download className="h-3 w-3 mr-1" />
                                                )}
                                                PDF
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    )
                })
            )}

            <ConfirmDialog
                open={deleteDialogOpen}
                onClose={() => setDeleteDialogOpen(false)}
                onConfirm={handleConfirmDelete}
                title="Delete Estimate"
                description="Are you sure you want to delete this estimate? This action cannot be undone."
            />

            {
                previewEstimate && (
                    <PDFPreviewModal
                        open={!!previewEstimate}
                        onClose={() => setPreviewEstimate(null)}
                        createDocument={() => createEstimatePdfDocument(previewEstimate)}
                        fileName={`${previewEstimate.estimateNumber || 'estimate'}.pdf`}
                    />
                )
            }

            {
                followUpEstimate && (
                    <FollowUpModal
                        open={!!followUpEstimate}
                        onClose={() => setFollowUpEstimate(null)}
                        clientName={followUpEstimate.clientName}
                        estimateNumber={followUpEstimate.estimateNumber}
                        totalAmount={followUpEstimate.totalAmount}
                        businessName={businessProfile?.business_name || ""}
                    />
                )
            }
            {
                smsEstimate && (
                    <SmsModal
                        open={!!smsEstimate}
                        onClose={() => setSmsEstimate(null)}
                        estimateTotal={smsEstimate.totalAmount}
                        paymentLink={smsEstimate.paymentLink || businessProfile?.payment_link || null}
                        businessName={businessProfile?.business_name}
                        onSend={(toPhoneNumber, message) => handleSendSms(smsEstimate, toPhoneNumber, message)}
                    />
                )
            }
        </div >
    )
}
