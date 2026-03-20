"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Download, FileText, Copy, Trash2, Mail, AlertCircle, MessageSquare, RefreshCw, Link2 } from "lucide-react"
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

type TabType = 'drafts' | 'sent' | 'paid'

type StripePaymentStatusResponse = {
    ok: boolean
    paid: boolean
    checkoutSessionId?: string
    paidAt?: string
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

    // Filter estimates based on active tab
    const filteredEstimates = estimates.filter(e => {
        if (activeTab === 'drafts') {
            return e.status === 'draft' || !e.status  // Include legacy estimates
        }
        if (activeTab === 'sent') {
            return e.status === 'sent'
        }
        return e.status === 'paid'
    })

    // Count for badges
    const draftsCount = estimates.filter(e => e.status === 'draft' || !e.status).length
    const sentCount = estimates.filter(e => e.status === 'sent').length
    const paidCount = estimates.filter(e => e.status === 'paid').length
    const pendingSyncSummary = summarizePendingSync(estimates, 0)

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
        <div className="space-y-4 pb-20 max-w-2xl mx-auto px-4">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">Estimates</h1>
                <Button variant="outline" size="sm" onClick={handleExportCSV} title="Export for QuickBooks">
                    📊 Export CSV
                </Button>
            </div>

            {pendingSyncSummary.unsyncedEstimateCount > 0 && (
                <Card className="border-amber-300 bg-amber-50/70">
                    <CardContent className="flex items-center justify-between gap-3 py-4">
                        <div>
                            <p className="text-sm font-semibold text-amber-900">Local changes waiting to sync</p>
                            <p className="text-sm text-amber-800">
                                {formatPendingSyncSummary(pendingSyncSummary)}
                            </p>
                        </div>
                        <Badge variant="outline" className="border-amber-300 bg-white text-amber-900">
                            {pendingSyncSummary.unsyncedEstimateCount} queued
                        </Badge>
                    </CardContent>
                </Card>
            )}

            <Card className="border-primary/20">
                <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Link2 className="h-5 w-5" />
                                QuickBooks Sync
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">
                                Push won estimates into QuickBooks Online. CSV export stays available as a fallback.
                            </p>
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
                        <div className="rounded-lg border p-4 text-sm text-muted-foreground flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading QuickBooks status...
                        </div>
                    ) : !quickBooksStatus ? (
                        <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                            QuickBooks status is unavailable right now.
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-lg border p-3">
                                    <p className="text-xs text-muted-foreground">Plan access</p>
                                    <p className="text-2xl font-semibold capitalize">
                                        {quickBooksStatus.eligible ? quickBooksStatus.planTier : "Upgrade"}
                                    </p>
                                </div>
                                <div className="rounded-lg border p-3">
                                    <p className="text-xs text-muted-foreground">Synced invoices</p>
                                    <p className="text-2xl font-semibold">{quickBooksStatus.syncStats.syncedInvoices}</p>
                                </div>
                            </div>

                            <div className="rounded-lg border p-3 space-y-2">
                                <p className="text-sm font-medium">
                                    {quickBooksStatus.connected ? "Connected to QuickBooks Online" : "Not connected"}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    {quickBooksStatus.connected
                                        ? `Company ID ${quickBooksStatus.realmId || "linked"}.`
                                        : quickBooksStatus.eligible
                                            ? "Connect your QuickBooks company to create invoices directly from SnapQuote."
                                            : "Upgrade to Pro or Team to unlock direct QuickBooks invoice sync."}
                                </p>
                                {quickBooksStatus.syncStats.latestSyncedAt && (
                                    <p className="text-xs text-muted-foreground">
                                        Last synced {new Date(quickBooksStatus.syncStats.latestSyncedAt).toLocaleString()}
                                    </p>
                                )}
                                {quickBooksStatus.reconnectRequired && (
                                    <p className="text-xs text-amber-700">
                                        Your QuickBooks token needs a fresh reconnect.
                                    </p>
                                )}
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        type="button"
                                        onClick={() => void handleConnectQuickBooks()}
                                        disabled={quickBooksConnecting || !quickBooksStatus.eligible}
                                    >
                                        {quickBooksConnecting ? (
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        ) : (
                                            <Link2 className="h-4 w-4 mr-2" />
                                        )}
                                        {quickBooksStatus.connected ? "Reconnect QuickBooks" : "Connect QuickBooks"}
                                    </Button>
                                    <Button variant="outline" type="button" onClick={handleExportCSV}>
                                        📊 Export CSV
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Tab Navigation */}
            <div className="flex p-1 bg-muted rounded-lg">
                <Button
                    variant={activeTab === 'drafts' ? 'default' : 'ghost'}
                    className="flex-1 rounded-md h-10"
                    onClick={() => setActiveTab('drafts')}
                >
                    📝 Drafts
                    {draftsCount > 0 && (
                        <Badge variant="secondary" className="ml-2">
                            {draftsCount}
                        </Badge>
                    )}
                </Button>
                <Button
                    variant={activeTab === 'sent' ? 'default' : 'ghost'}
                    className="flex-1 rounded-md h-10"
                    onClick={() => setActiveTab('sent')}
                >
                    ✅ Sent
                    {sentCount > 0 && (
                        <Badge variant="secondary" className="ml-2">
                            {sentCount}
                        </Badge>
                    )}
                </Button>
                <Button
                    variant={activeTab === 'paid' ? 'default' : 'ghost'}
                    className="flex-1 rounded-md h-10"
                    onClick={() => setActiveTab('paid')}
                >
                    💰 Paid
                    {paidCount > 0 && (
                        <Badge variant="secondary" className="ml-2">
                            {paidCount}
                        </Badge>
                    )}
                </Button>
            </div>

            {filteredEstimates.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="font-medium text-lg mb-2">
                            {activeTab === 'drafts'
                                ? 'No drafts yet'
                                : (activeTab === 'sent' ? 'No sent estimates' : 'No paid estimates')}
                        </h3>
                        <p className="text-muted-foreground text-sm mb-4">
                            {activeTab === 'drafts'
                                ? 'Create a new estimate to get started'
                                : (activeTab === 'sent'
                                    ? 'Drafts will appear here after you send them'
                                    : 'Paid estimates will appear here after successful payment')}
                        </p>
                        {activeTab === 'drafts' && (
                            <Button onClick={() => router.push("/new-estimate")}>
                                Create New Estimate
                            </Button>
                        )}
                    </CardContent>
                </Card>
            ) : (
                filteredEstimates.map((estimate) => {
                    const isExpanded = expandedId === estimate.id
                    const items = estimate.items || []
                    const priceTBDCount = getPriceTBDCount(estimate)

                    return (
                        <Card key={estimate.id}>
                            <CardHeader className="pb-3">
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <CardTitle className="text-lg">{estimate.clientName || "Client"}</CardTitle>
                                            {estimate.estimateNumber && (
                                                <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
                                                    {estimate.estimateNumber}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            {new Date(estimate.createdAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {priceTBDCount > 0 && activeTab === 'drafts' && (
                                            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
                                                <AlertCircle className="h-3 w-3 mr-1" />
                                                {priceTBDCount} TBD
                                            </Badge>
                                        )}
                                        {estimate.synced === false && (
                                            <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300">
                                                Pending sync
                                            </Badge>
                                        )}
                                        {estimate.quickbooksInvoiceId && (
                                            <Badge variant="outline" className="bg-sky-50 text-sky-800 border-sky-300">
                                                QB {estimate.quickbooksInvoiceStatus || "linked"}
                                            </Badge>
                                        )}
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${estimate.status === 'paid'
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : (estimate.status === 'sent'
                                                ? 'bg-green-100 text-green-800'
                                                : 'bg-yellow-100 text-yellow-800')
                                            }`}>
                                            {estimate.type === 'invoice'
                                                ? 'INVOICE'
                                                : (estimate.status === 'paid'
                                                    ? 'PAID'
                                                    : (estimate.status === 'sent' ? 'SENT' : 'DRAFT'))}
                                        </span>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div>
                                    <p className="font-bold text-lg">${estimate.totalAmount.toFixed(2)}</p>
                                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                                        {estimate.summary_note}
                                    </p>
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
                                                <p className="font-semibold">${item.total.toFixed(2)}</p>
                                            </div>
                                        ))}
                                        {estimate.taxAmount > 0 && (
                                            <div className="pt-2 border-t">
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-muted-foreground">Subtotal</span>
                                                    <span>${(estimate.totalAmount - estimate.taxAmount).toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-muted-foreground">Tax ({estimate.taxRate}%)</span>
                                                    <span>${estimate.taxAmount.toFixed(2)}</span>
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

                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => toggleExpand(estimate.id)}
                                    >
                                        <FileText className="h-3 w-3 mr-1" />
                                        {isExpanded ? "Hide" : "Details"}
                                    </Button>

                                    {/* Mark as Sent button - only for drafts */}
                                    {activeTab === 'drafts' && (
                                        <Button
                                            variant="default"
                                            size="sm"
                                            onClick={() => handleMarkAsSent(estimate.id)}
                                        >
                                            ✅ Mark Sent
                                        </Button>
                                    )}

                                    {activeTab === 'sent' && estimate.status === 'sent' && (
                                        <Button
                                            variant="default"
                                            size="sm"
                                            onClick={() => handleMarkAsPaid(estimate.id)}
                                        >
                                            💰 Mark Paid
                                        </Button>
                                    )}

                                    {/* Convert to Invoice - only for sent estimates that aren't already invoices */}
                                    {estimate.status === 'sent' && estimate.type !== 'invoice' && (
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
                                    {estimate.status !== 'paid' && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setFollowUpEstimate(estimate)}
                                        >
                                            <Mail className="h-3 w-3 mr-1" />
                                            Follow-up
                                        </Button>
                                    )}
                                    {estimate.status !== 'paid' && (
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
                                                👁️
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
