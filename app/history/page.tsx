"use client"

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Download, FileText, Copy, Trash2, Mail, AlertCircle, MessageSquare, RefreshCw, Link2, Clock3, CloudUpload, CircleDollarSign, Send, CheckCircle2, ReceiptText, Image as ImageIcon, Mic, LogIn, MoreHorizontal, ChevronDown, Search, X, ArrowRight } from "lucide-react"
import dynamic from "next/dynamic"
import { useRouter, useSearchParams } from "next/navigation"
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
import { AuthGate } from "@/components/auth-gate"
import { sendEstimateSms } from "@/lib/send-sms"
import { formatPendingSyncSummary, summarizePendingSync } from "@/lib/offline-sync"
import { getBillingSubscriptionStatus, type BillingSubscriptionStatusResponse } from "@/lib/pricing"
import { Input } from "@/components/ui/input"
import {
    getQuickBooksStatus,
    startQuickBooksConnect,
    syncEstimateToQuickBooks,
    type QuickBooksStatusResponse,
} from "@/lib/quickbooks"
import { hasPdfBrandingAccess, hasPdfTemplateAccess } from "@/lib/pdf-branding"
import { getAllItemsFromEstimate } from "@/lib/estimates/math"
import { cn } from "@/lib/utils"
import { buildEstimatePdfFileName, downloadBlobAsFile } from "@/lib/estimate-pdf-file"

type TabType = 'drafts' | 'sent' | 'paid'

type StripePaymentStatusResponse = {
    ok: boolean
    paid: boolean
    checkoutSessionId?: string
    paidAt?: string
}

type HistoryActionIssue = {
    estimateId: string
    kind: "pdf" | "quickbooks"
    title: string
    message: string
}

type QuickBooksPanelIssue = {
    title: string
    message: string
}

type HistoryNextAction = {
    kind: "new" | "edit_draft" | "focus_sent" | "focus_paid" | "sync_quickbooks"
    title: string
    description: string
    buttonLabel: string
    estimateId?: string
}

function formatAmount(amount: number): string {
    return `$${amount.toFixed(2)}`
}

function getEstimateStatusTone(status: LocalEstimate["status"]) {
    if (status === "paid") {
        return "border border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
    }

    if (status === "sent") {
        return "border border-sky-400/30 bg-sky-500/10 text-sky-200"
    }

    return "border border-amber-400/30 bg-amber-500/10 text-amber-200"
}

function matchesPaymentReturnEstimate(estimate: LocalEstimate, estimateId: string, estimateNumber: string) {
    const idMatches = Boolean(estimateId) && estimate.id === estimateId
    const numberMatches = Boolean(estimateNumber) && estimate.estimateNumber === estimateNumber
    return idMatches || numberMatches
}

function getPriceTBDCount(estimate: LocalEstimate): number {
    return getAllItemsFromEstimate(estimate).filter((item) => item.unit_price === 0).length
}

function getEstimateDisplayName(estimate: LocalEstimate): string {
    return estimate.clientName || estimate.estimateNumber || "this quote"
}

function buildEstimateSearchText(estimate: LocalEstimate): string {
    const itemText = getAllItemsFromEstimate(estimate)
        .map((item) => `${item.description} ${item.category} ${item.quantity} ${item.unit} ${item.unit_price} ${item.total}`)
        .join(" ")

    return [
        estimate.clientName,
        estimate.clientAddress,
        estimate.estimateNumber,
        estimate.summary_note,
        estimate.status,
        estimate.type,
        estimate.totalAmount,
        estimate.taxAmount,
        estimate.paymentLinkId,
        estimate.quickbooksDocNumber,
        estimate.quickbooksInvoiceStatus,
        estimate.createdAt,
        estimate.updatedAt,
        estimate.sentAt,
        estimate.paymentCompletedAt,
        itemText,
    ]
        .filter((value) => value !== undefined && value !== null)
        .join(" ")
        .toLowerCase()
}

const historyBoxClass = "rounded-lg border border-white/10 bg-slate-950/55 p-4"
const historyCompactBoxClass = "rounded-lg border border-white/10 bg-slate-950/50 p-3"
const historySummaryMetricClass = "rounded-lg border border-white/10 bg-slate-950/55 p-2 sm:p-3"
const historyBoxSoftClass = "rounded-lg border border-white/10 bg-slate-900/55 p-4"
const historyBadgeClass = "border-white/10 bg-slate-950/65 text-slate-300"
const historyOutlineButtonClass = "border-white/10 bg-slate-950/60 text-slate-200 hover:bg-slate-900 hover:text-white"
const historySecondaryButtonClass = "w-full shrink-0 border-white/10 bg-slate-950/60 text-slate-200 hover:bg-slate-900 hover:text-white sm:w-auto"
const historyGhostButtonClass = "text-slate-300 hover:bg-white/10 hover:text-white"

function getLaneTabStyle(isActive: boolean): CSSProperties {
    return isActive
        ? {
            backgroundColor: "rgb(255, 255, 255)",
            borderColor: "rgb(255, 255, 255)",
            color: "rgb(2, 6, 23)",
        }
        : {
            backgroundColor: "rgba(2, 6, 23, 0.7)",
            borderColor: "rgba(255, 255, 255, 0.1)",
            color: "rgb(203, 213, 225)",
        }
}

function HistoryPageContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { authResolved, isAuthenticated } = useAuthGuard("/history")
    const [estimates, setEstimates] = useState<LocalEstimate[]>([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<TabType>('drafts')
    const [searchQuery, setSearchQuery] = useState("")
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [estimateToDelete, setEstimateToDelete] = useState<string | null>(null)
    const [previewEstimate, setPreviewEstimate] = useState<LocalEstimate | null>(null)
    const [followUpEstimate, setFollowUpEstimate] = useState<LocalEstimate | null>(null)
    const [smsEstimate, setSmsEstimate] = useState<LocalEstimate | null>(null)
    const [businessProfile, setBusinessProfile] = useState<BusinessInfo | undefined>(undefined)
    const [downloadingEstimateId, setDownloadingEstimateId] = useState<string | null>(null)
    const [historyActionIssue, setHistoryActionIssue] = useState<HistoryActionIssue | null>(null)
    const [quickBooksPanelIssue, setQuickBooksPanelIssue] = useState<QuickBooksPanelIssue | null>(null)
    const [subscription, setSubscription] = useState<BillingSubscriptionStatusResponse | null>(null)
    const [quickBooksStatus, setQuickBooksStatus] = useState<QuickBooksStatusResponse | null>(null)
    const [quickBooksLoading, setQuickBooksLoading] = useState(true)
    const [quickBooksConnecting, setQuickBooksConnecting] = useState(false)
    const [syncingQuickBooksEstimateId, setSyncingQuickBooksEstimateId] = useState<string | null>(null)
    const paymentStatusSyncInFlightRef = useRef(false)
    const historySearch = searchParams.toString()
    const currentHistoryPath = historySearch ? `/history?${historySearch}` : "/history"
    const loginToHistoryHref = `/login?next=${encodeURIComponent(currentHistoryPath)}`
    const isPaymentSuccessReturn = searchParams.get("payment") === "success"
    const returnEstimateId = searchParams.get("estimateId")?.trim() || ""
    const returnEstimateNumber = searchParams.get("estimateNumber")?.trim() || ""
    const isLocalOnlyMode = authResolved && !isAuthenticated

    const loadQuickBooks = useCallback(async () => {
        if (!isAuthenticated) {
            setQuickBooksStatus(null)
            setQuickBooksPanelIssue(null)
            setQuickBooksLoading(false)
            return
        }

        setQuickBooksLoading(true)
        try {
            const status = await getQuickBooksStatus()
            setQuickBooksStatus(status)
            setQuickBooksPanelIssue(status ? null : {
                title: "QuickBooks status is unavailable",
                message: "Retry the connection check or export CSV for manual import while QuickBooks is unreachable.",
            })
        } finally {
            setQuickBooksLoading(false)
        }
    }, [isAuthenticated])

    const syncSentEstimatePaymentStatuses = useCallback(async (sourceEstimates?: LocalEstimate[]) => {
        if (!isAuthenticated) return
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
                toast(`${updatedCount} payment${updatedCount > 1 ? "s" : ""} synced.`, "success")
            }
        } catch (error) {
            console.error("Failed to sync sent estimate payment statuses:", error)
        } finally {
            paymentStatusSyncInFlightRef.current = false
        }
    }, [isAuthenticated])

    const loadData = useCallback(async () => {
        const localEstimates = await getEstimates()
        const [status, subscriptionStatus] = isAuthenticated
            ? await Promise.all([
                getQuickBooksStatus(),
                getBillingSubscriptionStatus(),
            ])
            : [null, null] as const

        setEstimates(localEstimates)
        setQuickBooksStatus(status)
        setQuickBooksPanelIssue(isAuthenticated && !status ? {
            title: "QuickBooks status is unavailable",
            message: "Retry the connection check or export CSV for manual import while QuickBooks is unreachable.",
        } : null)
        setSubscription(subscriptionStatus)
        setQuickBooksLoading(false)
        const profile = getProfile()
        if (profile) setBusinessProfile(profile)
        setLoading(false)
        if (isAuthenticated) {
            void syncSentEstimatePaymentStatuses(localEstimates)
        }
    }, [isAuthenticated, syncSentEstimatePaymentStatuses])

    useEffect(() => {
        if (!authResolved) return
        void loadData()
    }, [authResolved, loadData])

    useEffect(() => {
        if (!isPaymentSuccessReturn) return

        setActiveTab("paid")

        const matchedEstimate = estimates.find((estimate) =>
            matchesPaymentReturnEstimate(estimate, returnEstimateId, returnEstimateNumber)
        )

        if (matchedEstimate) {
            setExpandedId(matchedEstimate.id)
        }
    }, [estimates, isPaymentSuccessReturn, returnEstimateId, returnEstimateNumber])

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

    const normalizedSearchQuery = searchQuery.trim().toLowerCase()

    const laneEstimates = useMemo(() => {
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

    const filteredEstimates = useMemo(() => {
        if (!normalizedSearchQuery) return laneEstimates

        return laneEstimates.filter((estimate) => buildEstimateSearchText(estimate).includes(normalizedSearchQuery))
    }, [laneEstimates, normalizedSearchQuery])

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
    const latestActivityCompactLabel = historyMetrics.latestUpdatedAt
        ? new Date(historyMetrics.latestUpdatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
        : "--"
    const quickBooksSummaryLabel = quickBooksStatus?.syncStats.latestSyncedAt
        ? `Last synced ${new Date(quickBooksStatus.syncStats.latestSyncedAt).toLocaleString()}`
        : quickBooksStatus?.connected
            ? "Connected, but no invoices synced yet"
            : "No QuickBooks connection yet"
    const paymentReturnEstimate = isPaymentSuccessReturn
        ? estimates.find((estimate) => matchesPaymentReturnEstimate(estimate, returnEstimateId, returnEstimateNumber))
        : undefined
    const paymentReturnReference = returnEstimateNumber || paymentReturnEstimate?.estimateNumber || returnEstimateId
    const hasActiveSearch = normalizedSearchQuery.length > 0

    const historyNextAction = useMemo<HistoryNextAction>(() => {
        const drafts = estimates.filter((estimate) => estimate.status === "draft" || !estimate.status)
        const sent = estimates.filter((estimate) => estimate.status === "sent")
        const paid = estimates.filter((estimate) => estimate.status === "paid")
        const draftWithMissingPrice = drafts.find((estimate) => getPriceTBDCount(estimate) > 0)
        const latestDraft = drafts[0]
        const latestSent = sent[0]
        const paidPendingQuickBooks = paid.find((estimate) => !estimate.quickbooksInvoiceId)

        if (draftWithMissingPrice) {
            return {
                kind: "edit_draft",
                estimateId: draftWithMissingPrice.id,
                title: "Finish draft pricing",
                description: `${getEstimateDisplayName(draftWithMissingPrice)} still has ${getPriceTBDCount(draftWithMissingPrice)} line item${getPriceTBDCount(draftWithMissingPrice) === 1 ? "" : "s"} without pricing.`,
                buttonLabel: "Finish pricing",
            }
        }

        if (latestDraft) {
            return {
                kind: "edit_draft",
                estimateId: latestDraft.id,
                title: "Finish the latest draft",
                description: `${getEstimateDisplayName(latestDraft)} is ready to review, PDF, or send before leaving the jobsite.`,
                buttonLabel: "Open draft",
            }
        }

        if (latestSent) {
            return {
                kind: "focus_sent",
                estimateId: latestSent.id,
                title: "Collect the open quote",
                description: `${getEstimateDisplayName(latestSent)} is out with the customer for ${formatAmount(latestSent.totalAmount)}.`,
                buttonLabel: "Review sent",
            }
        }

        if (paidPendingQuickBooks) {
            return quickBooksStatus?.connected
                ? {
                    kind: "sync_quickbooks",
                    estimateId: paidPendingQuickBooks.id,
                    title: "Send paid work to books",
                    description: `${getEstimateDisplayName(paidPendingQuickBooks)} is paid and ready for QuickBooks sync.`,
                    buttonLabel: "Sync QuickBooks",
                }
                : {
                    kind: "focus_paid",
                    estimateId: paidPendingQuickBooks.id,
                    title: "Review collected work",
                    description: `${getEstimateDisplayName(paidPendingQuickBooks)} is paid. Connect QuickBooks when you are ready to invoice from accounting.`,
                    buttonLabel: "View paid",
                }
        }

        return {
            kind: "new",
            title: "Start the next quote",
            description: "No open follow-up is blocking the pipeline. Capture the next job while the details are fresh.",
            buttonLabel: "New estimate",
        }
    }, [estimates, quickBooksStatus?.connected])

    const toggleExpand = (estimateId: string) => {
        setExpandedId(expandedId === estimateId ? null : estimateId)
    }

    const handleDuplicate = (estimate: LocalEstimate) => {
        const duplicateData = {
            items: estimate.items,
            summary_note: estimate.summary_note,
            clientName: estimate.clientName,
            clientAddress: estimate.clientAddress,
            clientEmail: estimate.clientEmail,
            clientPhone: estimate.clientPhone,
            clientNotes: estimate.clientNotes,
            taxRate: estimate.taxRate
        }
        localStorage.setItem('duplicate_estimate', JSON.stringify(duplicateData))
        router.push('/new-estimate')
    }

    const handleEditDraft = (estimate: LocalEstimate) => {
        const params = new URLSearchParams({ draftId: estimate.id })
        router.push(`/new-estimate?${params.toString()}`)
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
        toast("Marked as sent.", "success")
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
        toast("Marked as paid.", "success")
    }

    const handleConvertToInvoice = async (estimate: LocalEstimate) => {
        // Optimistic update
        await updateEstimate(estimate.id, {
            type: 'invoice',
            status: 'sent' // Ensure it's marked as sent/final
        })
        await loadData()
        toast("Converted to invoice.", "success")
    }

    const handleDeleteClick = (e: React.MouseEvent, estimateId: string) => {
        e.stopPropagation()
        e.preventDefault()
        setEstimateToDelete(estimateId)
        setDeleteDialogOpen(true)
    }

    const handleExportCSV = () => {
        if (estimates.length === 0) {
            toast("No estimates to export.", "error")
            return
        }
        const csv = generateQuickBooksCSV(estimates)
        downloadCSV(csv, `snapquote_export_${new Date().toISOString().split('T')[0]}.csv`)
        toast("Exported to CSV.", "success")
    }

    const handleConnectQuickBooks = useCallback(async () => {
        setQuickBooksPanelIssue(null)

        if (quickBooksStatus && !quickBooksStatus.eligible) {
            setQuickBooksPanelIssue({
                title: "Upgrade to sync QuickBooks",
                message: "Direct QuickBooks invoice sync is available on Pro or Team. CSV export is still available for manual import.",
            })
            return
        }

        setQuickBooksConnecting(true)
        try {
            const result = await startQuickBooksConnect("/history")
            if (!result?.url) {
                setQuickBooksPanelIssue({
                    title: "QuickBooks connection did not start",
                    message: "Retry the connection or export CSV for manual import while we cannot open QuickBooks.",
                })
                return
            }

            setQuickBooksPanelIssue(null)
            window.location.href = result.url
        } finally {
            setQuickBooksConnecting(false)
        }
    }, [quickBooksStatus])

    const handleSyncQuickBooks = useCallback(async (estimate: LocalEstimate) => {
        setHistoryActionIssue(null)

        if (!quickBooksStatus?.connected) {
            setHistoryActionIssue({
                estimateId: estimate.id,
                kind: "quickbooks",
                title: "Connect QuickBooks before syncing",
                message: "Use the QuickBooks panel above to connect, or export CSV as a fallback.",
            })
            return
        }

        if (!estimate.clientName?.trim() || !estimate.items?.length) {
            setHistoryActionIssue({
                estimateId: estimate.id,
                kind: "quickbooks",
                title: "Add client and line items first",
                message: "Edit the draft before syncing it into QuickBooks.",
            })
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
                setHistoryActionIssue({
                    estimateId: estimate.id,
                    kind: "quickbooks",
                    title: "QuickBooks sync failed",
                    message: "Retry QuickBooks sync or export CSV for manual import.",
                })
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
            setHistoryActionIssue(null)

            toast(response.deduped ? "QuickBooks invoice already linked." : "Synced to QuickBooks.", "success")
        } finally {
            setSyncingQuickBooksEstimateId(null)
        }
    }, [loadQuickBooks, quickBooksStatus])

    const handleConfirmDelete = async () => {
        if (estimateToDelete) {
            await deleteEstimate(estimateToDelete)
            await loadData()
            toast("Estimate deleted.", "success")
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
        toast("SMS sent.", "success")
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
        setHistoryActionIssue(null)
        try {
            const fileName = buildEstimatePdfFileName({
                estimateNumber: estimate.estimateNumber,
                clientName: estimate.clientName,
            })
            const [{ pdf }, pdfDocument] = await Promise.all([
                import("@react-pdf/renderer"),
                createEstimatePdfDocument(estimate),
            ])
            const blob = await pdf(pdfDocument).toBlob()
            downloadBlobAsFile(blob, fileName)
            toast(`PDF downloaded as ${fileName}.`, "success")
        } catch (error) {
            console.error("History PDF download failed:", error)
            setHistoryActionIssue({
                estimateId: estimate.id,
                kind: "pdf",
                title: "PDF was not downloaded",
                message: "Retry the PDF download or open Preview to inspect the estimate before trying again.",
            })
        } finally {
            setDownloadingEstimateId(null)
        }
    }, [createEstimatePdfDocument])

    const focusEstimateLane = (tab: TabType, estimateId?: string) => {
        setActiveTab(tab)
        setSearchQuery("")
        setExpandedId(estimateId || null)
        window.setTimeout(() => {
            document.getElementById("history-estimate-lanes")?.scrollIntoView({
                behavior: "smooth",
                block: "start",
            })
        }, 0)
    }

    const handleHistoryNextAction = () => {
        const targetEstimate = historyNextAction.estimateId
            ? estimates.find((estimate) => estimate.id === historyNextAction.estimateId)
            : null

        setHistoryActionIssue(null)

        if (historyNextAction.kind === "new") {
            router.push("/new-estimate")
            return
        }

        if (!targetEstimate) return

        if (historyNextAction.kind === "edit_draft") {
            handleEditDraft(targetEstimate)
            return
        }

        if (historyNextAction.kind === "focus_sent") {
            focusEstimateLane("sent", targetEstimate.id)
            return
        }

        if (historyNextAction.kind === "focus_paid") {
            focusEstimateLane("paid", targetEstimate.id)
            return
        }

        void handleSyncQuickBooks(targetEstimate)
    }

    if (!authResolved) {
        return (
            <AuthGate
                loading
                nextPath="/history"
                title="Sign in to view history"
                description="Your quote history, payment status, and follow-up tools are tied to your SnapQuote account."
            />
        )
    }

    if (loading) {
        return (
            <AuthGate
                loading
                nextPath="/history"
                title="Loading local quote history"
                description="Pulling the estimates saved on this device."
                loadingLabel="Loading quote history..."
            />
        )
    }

    return (
        <div className="history-console field-app min-h-screen px-4 pb-28 pt-5 text-white">
            <div className="mx-auto flex max-w-5xl flex-col gap-5">
                {isLocalOnlyMode ? (
                    <Card
                        className={cn("field-card border-sky-400/25 bg-sky-500/10", isPaymentSuccessReturn && "order-1")}
                        data-testid="history-local-mode-banner"
                    >
                        <CardContent className="flex items-center justify-between gap-3 p-3 sm:p-4">
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-sky-100">Local device mode</p>
                                <p className="mt-1 text-xs leading-5 text-sky-100/80 sm:text-sm sm:leading-6">
                                    Drafts stay available on this device. Sign in for cloud sync, SMS, QuickBooks, and payment polling.
                                </p>
                            </div>
                            <Button asChild size="sm" className="h-11 min-h-11 shrink-0 rounded-lg">
                                <Link href={loginToHistoryHref} data-testid="history-local-signin-link">
                                    <LogIn className="mr-2 h-4 w-4" />
                                    Sign in
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                ) : null}

                {isPaymentSuccessReturn ? (
                    <Card
                        className={cn(
                            "field-card",
                            isPaymentSuccessReturn && "order-first",
                            paymentReturnEstimate
                                ? "border-emerald-400/30 bg-emerald-500/10 ring-1 ring-emerald-400/20"
                                : "border-amber-300/25 bg-amber-400/10 ring-1 ring-amber-300/15"
                        )}
                        data-testid="history-payment-return-banner"
                    >
                        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex gap-3">
                                {paymentReturnEstimate ? (
                                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                                ) : (
                                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" />
                                )}
                                <div>
                                    <p className={cn("text-sm font-semibold", paymentReturnEstimate ? "text-emerald-100" : "text-amber-100")}>
                                        {paymentReturnEstimate ? "Payment matched in History" : "Payment received, local estimate not found"}
                                    </p>
                                    <p className={cn("mt-1 text-sm leading-6", paymentReturnEstimate ? "text-emerald-100/80" : "text-amber-100/80")}>
                                        {paymentReturnEstimate
                                            ? `${paymentReturnEstimate.estimateNumber || "This estimate"} is open in the Paid lane with the latest local payment state.`
                                            : paymentReturnReference
                                                ? `${paymentReturnReference} is not saved on this device. If the customer paid from their own phone, open History on the contractor device or sign in so cloud payment sync can catch up.`
                                                : "This payment return did not include a local estimate reference. Open the contractor device or sign in so cloud payment sync can catch up."}
                                    </p>
                                </div>
                            </div>
                            <Button
                                type="button"
                                className="shrink-0 rounded-lg"
                                onClick={() => {
                                    setActiveTab("paid")
                                    if (paymentReturnEstimate) setExpandedId(paymentReturnEstimate.id)
                                    if (isAuthenticated) void syncSentEstimatePaymentStatuses()
                                }}
                            >
                                <CircleDollarSign className="mr-2 h-4 w-4" />
                                {paymentReturnEstimate ? "Show paid estimate" : "Check paid lane"}
                            </Button>
                        </CardContent>
                    </Card>
                ) : null}

                <Card className={cn("field-panel overflow-hidden", isPaymentSuccessReturn && "order-3")} data-testid="history-summary-panel">
                    <CardContent className="space-y-3 p-3 sm:space-y-4 sm:p-5">
                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
                            <div className="space-y-3">
                                <div className="space-y-2">
                                    <Badge className="w-fit border-white/10 bg-white/10 text-white hover:bg-white/10">
                                        <FileText className="mr-1 h-3.5 w-3.5" />
                                        Estimate History
                                    </Badge>
                                    <div className="space-y-1.5">
                                        <h1 className="text-2xl font-semibold leading-[1.25] sm:text-3xl sm:leading-[1.25]" data-testid="history-page-title">Quote history</h1>
                                        <p className="hidden max-w-2xl text-sm leading-6 text-slate-300 sm:block">
                                            Pick up drafts, collect sent quotes, and close out paid work without digging through records.
                                        </p>
                                    </div>
                                </div>
                                <div className="hidden flex-wrap items-center gap-2 sm:flex">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className={historyOutlineButtonClass}
                                        onClick={() => router.push("/new-estimate")}
                                    >
                                        <FileText className="mr-2 h-4 w-4" />
                                        New Estimate
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className={historyOutlineButtonClass}
                                        onClick={handleExportCSV}
                                        title="Export for QuickBooks"
                                    >
                                        <Download className="mr-2 h-4 w-4" />
                                        Export CSV
                                    </Button>
                                </div>
                            </div>

                            <div
                                className="rounded-lg border border-white/10 bg-slate-950/60 p-2.5 sm:p-3"
                                data-testid="history-next-action"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <Badge variant="outline" className={historyBadgeClass}>Next up</Badge>
                                    <Badge variant="outline" className={cn("hidden sm:inline-flex", historyBadgeClass)}>{activeTabLabel}</Badge>
                                </div>
                                <p className="mt-2 text-base font-semibold sm:text-lg">{historyNextAction.title}</p>
                                <p
                                    className="mt-1 line-clamp-3 break-words text-sm leading-5 text-slate-400 [overflow-wrap:anywhere]"
                                    data-testid="history-next-action-description"
                                >
                                    {historyNextAction.description}
                                </p>
                                <Button
                                    type="button"
                                    size="sm"
                                    className="mt-2 h-11 min-h-11 w-full rounded-lg sm:mt-3 sm:w-auto"
                                    onClick={handleHistoryNextAction}
                                    data-testid="history-next-action-button"
                                >
                                    {historyNextAction.buttonLabel}
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                            <div className={historySummaryMetricClass}>
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Drafts</p>
                                    <FileText className="hidden h-4 w-4 text-slate-400 sm:block" />
                                </div>
                                <p className="mt-2 text-2xl font-semibold">{draftsCount}</p>
                                <p className="mt-1 hidden text-xs leading-4 text-slate-400 sm:block" data-testid="history-draft-value">{formatAmount(historyMetrics.draftValue)} open value</p>
                            </div>
                            <div className={historySummaryMetricClass}>
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Sent</p>
                                    <Send className="hidden h-4 w-4 text-slate-400 sm:block" />
                                </div>
                                <p className="mt-2 text-2xl font-semibold">{sentCount}</p>
                                <p className="mt-1 hidden text-xs leading-4 text-slate-400 sm:block" data-testid="history-sent-value">{formatAmount(historyMetrics.sentValue)} out</p>
                            </div>
                            <div className={historySummaryMetricClass}>
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Paid</p>
                                    <CircleDollarSign className="hidden h-4 w-4 text-slate-400 sm:block" />
                                </div>
                                <p className="mt-2 text-2xl font-semibold">{paidCount}</p>
                                <p className="mt-1 hidden text-xs leading-4 text-slate-400 sm:block" data-testid="history-paid-value">{formatAmount(historyMetrics.paidValue)} collected</p>
                            </div>
                            <div className={historySummaryMetricClass}>
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Latest</p>
                                    <Clock3 className="hidden h-4 w-4 text-slate-400 sm:block" />
                                </div>
                                <p className="mt-2 text-sm font-semibold leading-5 sm:hidden">{latestActivityCompactLabel}</p>
                                <p className="mt-2 hidden text-sm font-semibold leading-5 sm:block">{latestActivityLabel}</p>
                                <p className="mt-1 hidden text-xs leading-4 text-slate-400 sm:block" data-testid="history-total-records">{estimates.length} total records</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

            <div
                className="order-2 grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start"
                data-testid="history-workbench"
            >
            <aside
                className={cn("order-2 grid gap-5 lg:sticky lg:top-5", isPaymentSuccessReturn && "lg:top-5")}
                data-testid="history-operations-panel"
            >
                <Card className={cn("field-card", pendingSyncSummary.unsyncedEstimateCount > 0 && "ring-1 ring-amber-400/30")}>
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <CloudUpload className="h-5 w-5 text-sky-300" />
                            Offline Queue
                        </CardTitle>
                        <CardDescription className="text-slate-400">
                            Device-local edits stay safe here until cloud sync catches up.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className={historyBoxClass}>
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Queued changes</p>
                                <p className="mt-2 text-3xl font-semibold">{pendingSyncSummary.unsyncedEstimateCount}</p>
                                <p className="mt-1 text-xs text-slate-400">
                                    {pendingSyncSummary.unsyncedEstimateCount > 0 ? formatPendingSyncSummary(pendingSyncSummary) : "All local estimate changes are synced."}
                                </p>
                            </div>
                            <div className={historyBoxClass}>
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Current focus</p>
                                <p className="mt-2 text-lg font-semibold">{activeTabLabel}</p>
                                <p className="mt-1 text-xs text-slate-400">
                                    {filteredEstimates.length} of {laneEstimates.length} estimate{laneEstimates.length === 1 ? "" : "s"} visible
                                </p>
                            </div>
                        </div>

                        {pendingSyncSummary.unsyncedEstimateCount > 0 ? (
                            <div className="rounded-lg border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-100">
                                <p className="font-semibold">Local changes waiting to sync</p>
                                <p className="mt-1 text-amber-200/80">{formatPendingSyncSummary(pendingSyncSummary)}</p>
                            </div>
                        ) : (
                            <div className="flex items-start gap-2 rounded-lg border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-300" />
                                All draft, sent, and paid updates in local storage are currently synced.
                            </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                            <Badge variant="outline" className={historyBadgeClass}>
                                Plan {subscription?.planTier || "free"}
                            </Badge>
                            <Badge variant="outline" className={historyBadgeClass}>
                                {pendingSyncSummary.draftCount} draft updates
                            </Badge>
                            <Badge variant="outline" className={historyBadgeClass}>
                                {pendingSyncSummary.sentCount} sent updates
                            </Badge>
                            <Badge variant="outline" className={historyBadgeClass}>
                                {pendingSyncSummary.paidCount} paid updates
                            </Badge>
                        </div>
                    </CardContent>
                </Card>

                <Card className="field-card">
                    <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <Link2 className="h-5 w-5 text-sky-300" />
                                    QuickBooks Sync
                                </CardTitle>
                                <CardDescription className="text-slate-400">
                                    Push won estimates into QuickBooks Online. CSV export stays available as a fallback.
                                </CardDescription>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={cn(historyGhostButtonClass, "shrink-0")}
                                onClick={() => void loadQuickBooks()}
                                disabled={quickBooksLoading || isLocalOnlyMode}
                                aria-label="Refresh QuickBooks status"
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
                        {isLocalOnlyMode ? (
                            <div className={historyBoxSoftClass}>
                                <p className="text-sm font-medium">Sign in to connect QuickBooks</p>
                                <p className="mt-1 text-sm leading-6 text-slate-400">
                                    Your local drafts remain available here. Cloud-only accounting sync starts after sign-in so invoices stay tied to the right SnapQuote account.
                                </p>
                                <Button asChild className="mt-4 rounded-lg">
                                    <Link href={loginToHistoryHref}>
                                        <LogIn className="mr-2 h-4 w-4" />
                                        Sign in to sync
                                    </Link>
                                </Button>
                            </div>
                        ) : quickBooksLoading ? (
                            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/55 p-4 text-sm text-slate-400">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading QuickBooks status...
                            </div>
                        ) : !quickBooksStatus ? (
                            <div className="rounded-lg border border-white/10 bg-slate-950/55 p-4 text-sm text-slate-400">
                                QuickBooks status is unavailable right now.
                            </div>
                        ) : (
                            <>
                                <div className="grid gap-3 sm:grid-cols-3">
                                    <div className={historyBoxClass}>
                                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Plan access</p>
                                        <p className="mt-2 text-2xl font-semibold capitalize">
                                            {quickBooksStatus.eligible ? quickBooksStatus.planTier : "Upgrade"}
                                        </p>
                                    </div>
                                    <div className={historyBoxClass}>
                                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Synced invoices</p>
                                        <p className="mt-2 text-2xl font-semibold">{quickBooksStatus.syncStats.syncedInvoices}</p>
                                    </div>
                                    <div className={historyBoxClass}>
                                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Connection</p>
                                        <p className="mt-2 text-2xl font-semibold">{quickBooksStatus.connected ? "Live" : "Offline"}</p>
                                    </div>
                                </div>

                                <div className={historyBoxSoftClass}>
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                        <div>
                                            <p className="text-sm font-medium">
                                                {quickBooksStatus.connected ? "Connected to QuickBooks Online" : "Not connected"}
                                            </p>
                                            <p className="mt-1 text-sm text-slate-400">
                                                {quickBooksStatus.connected
                                                    ? `Company ID ${quickBooksStatus.realmId || "linked"}.`
                                                    : quickBooksStatus.eligible
                                                        ? "Connect your QuickBooks company to create invoices directly from SnapQuote."
                                                        : "Upgrade to Pro or Team to unlock direct QuickBooks invoice sync."}
                                            </p>
                                        </div>
                                        <Badge variant="outline" className={cn("w-fit", historyBadgeClass)}>
                                            {quickBooksSummaryLabel}
                                        </Badge>
                                    </div>
                                    {quickBooksStatus.reconnectRequired && (
                                        <p className="mt-3 text-xs text-amber-300">
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
                                        <Button variant="outline" type="button" className={historyOutlineButtonClass} onClick={handleExportCSV}>
                                            <Download className="mr-2 h-4 w-4" />
                                            Export CSV
                                        </Button>
                                    </div>
                                </div>
                            </>
                        )}
                        {!isLocalOnlyMode && !quickBooksLoading && quickBooksPanelIssue ? (
                            <div
                                className="rounded-lg border border-amber-300/20 bg-amber-400/10 p-3"
                                data-testid="history-quickbooks-panel-issue"
                                role="alert"
                            >
                                <div className="flex gap-2">
                                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200/80">QuickBooks action needed</p>
                                        <p className="mt-1 text-sm font-semibold text-amber-100">{quickBooksPanelIssue.title}</p>
                                        <p className="mt-1 text-xs leading-5 text-amber-100/75">{quickBooksPanelIssue.message}</p>
                                    </div>
                                </div>
                                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        className="rounded-lg"
                                        onClick={() => void handleConnectQuickBooks()}
                                        disabled={quickBooksConnecting}
                                        data-testid="history-quickbooks-connect-retry-action"
                                    >
                                        {quickBooksConnecting ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                            <RefreshCw className="mr-2 h-4 w-4" />
                                        )}
                                        Retry Connect
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="rounded-lg border-amber-300/20 bg-slate-950/70 text-amber-100 hover:bg-amber-400/10"
                                        onClick={handleExportCSV}
                                        data-testid="history-quickbooks-panel-export-action"
                                    >
                                        <Download className="mr-2 h-4 w-4" />
                                        Export CSV
                                    </Button>
                                </div>
                            </div>
                        ) : null}
                    </CardContent>
                </Card>
            </aside>

            <section
                id="history-estimate-lanes"
                className="order-1 space-y-5"
                data-testid="history-estimate-lanes-section"
            >
            <Card className="field-card">
                <CardContent className="space-y-3 p-3">
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold">Estimate lanes</p>
                                <Badge variant="outline" className={historyBadgeClass}>
                                    {filteredEstimates.length} of {laneEstimates.length}
                                </Badge>
                            </div>
                            <p className="mt-1 hidden text-sm leading-6 text-slate-400 sm:block">
                                Move from draft to sent to paid while keeping PDF, SMS, and QuickBooks actions close to the record.
                            </p>
                        </div>
                        <div className="relative w-full sm:w-64">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                            <Input
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder="Search client, quote, job"
                                aria-label="Search history"
                                className="border-white/10 bg-slate-950/60 pl-9 pr-12 text-white placeholder:text-slate-500"
                                data-testid="history-search-input"
                            />
                            {searchQuery ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-1/2 h-11 w-11 -translate-y-1/2 text-slate-400 hover:bg-white/10 hover:text-white"
                                    onClick={() => setSearchQuery("")}
                                    aria-label="Clear history search"
                                    data-testid="history-clear-search"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            ) : null}
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                        <Button
                            variant="ghost"
                            className={cn(
                                "h-auto justify-between rounded-lg border px-2 py-2 text-xs sm:px-4 sm:py-3 sm:text-sm",
                                activeTab === "drafts"
                                    ? "shadow-[0_16px_30px_-24px_rgba(255,255,255,0.75)]"
                                    : "hover:bg-slate-900 hover:text-white"
                            )}
                            style={getLaneTabStyle(activeTab === "drafts")}
                            onClick={() => setActiveTab("drafts")}
                            data-testid="history-drafts-tab"
                        >
                            <span className="flex items-center gap-2">
                                <FileText className="h-4 w-4" />
                                Drafts
                            </span>
                            <Badge variant="secondary" className={activeTab === "drafts" ? "bg-slate-950 text-white" : historyBadgeClass}>{draftsCount}</Badge>
                        </Button>
                        <Button
                            variant="ghost"
                            className={cn(
                                "h-auto justify-between rounded-lg border px-2 py-2 text-xs sm:px-4 sm:py-3 sm:text-sm",
                                activeTab === "sent"
                                    ? "shadow-[0_16px_30px_-24px_rgba(255,255,255,0.75)]"
                                    : "hover:bg-slate-900 hover:text-white"
                            )}
                            style={getLaneTabStyle(activeTab === "sent")}
                            onClick={() => setActiveTab("sent")}
                            data-testid="history-sent-tab"
                        >
                            <span className="flex items-center gap-2">
                                <Send className="h-4 w-4" />
                                Sent
                            </span>
                            <Badge variant="secondary" className={activeTab === "sent" ? "bg-slate-950 text-white" : historyBadgeClass}>{sentCount}</Badge>
                        </Button>
                        <Button
                            variant="ghost"
                            className={cn(
                                "h-auto justify-between rounded-lg border px-2 py-2 text-xs sm:px-4 sm:py-3 sm:text-sm",
                                activeTab === "paid"
                                    ? "shadow-[0_16px_30px_-24px_rgba(255,255,255,0.75)]"
                                    : "hover:bg-slate-900 hover:text-white"
                            )}
                            style={getLaneTabStyle(activeTab === "paid")}
                            onClick={() => setActiveTab("paid")}
                            data-testid="history-paid-tab"
                        >
                            <span className="flex items-center gap-2">
                                <CircleDollarSign className="h-4 w-4" />
                                Paid
                            </span>
                            <Badge variant="secondary" className={activeTab === "paid" ? "bg-slate-950 text-white" : historyBadgeClass}>{paidCount}</Badge>
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {filteredEstimates.length === 0 ? (
                <Card className="field-card border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        {hasActiveSearch ? (
                            <Search className="mb-4 h-12 w-12 text-slate-500" />
                        ) : (
                            <FileText className="mb-4 h-12 w-12 text-slate-500" />
                        )}
                        <h2 className="mb-2 text-lg font-medium">
                            {hasActiveSearch
                                ? "No matching estimates"
                                : activeTab === "drafts"
                                ? "No drafts yet"
                                : activeTab === "sent"
                                    ? "No sent estimates"
                                    : "No paid estimates"}
                        </h2>
                        <p className="mb-4 text-sm text-slate-400">
                            {hasActiveSearch
                                ? `No ${activeTabLabel.toLowerCase()} records match "${searchQuery.trim()}".`
                                : activeTab === "drafts"
                                ? "Create a new estimate to get started."
                                : activeTab === "sent"
                                    ? "Drafts will appear here after you send them."
                                    : "Paid estimates will appear here after successful payment."}
                        </p>
                        {hasActiveSearch ? (
                            <Button type="button" variant="outline" className={historyOutlineButtonClass} onClick={() => setSearchQuery("")}>
                                Clear search
                            </Button>
                        ) : activeTab === "drafts" ? (
                            <Button onClick={() => router.push("/new-estimate")}>
                                Create New Estimate
                            </Button>
                        ) : null}
                    </CardContent>
                </Card>
            ) : (
                filteredEstimates.map((estimate) => {
                    const isExpanded = expandedId === estimate.id
                    const items = getAllItemsFromEstimate(estimate)
                    const priceTBDCount = getPriceTBDCount(estimate)
                    const actionIssue = historyActionIssue?.estimateId === estimate.id ? historyActionIssue : null
                    const isPaymentReturnEstimate = isPaymentSuccessReturn && matchesPaymentReturnEstimate(estimate, returnEstimateId, returnEstimateNumber)

                    return (
                        <Card
                            key={estimate.id}
                            className={cn("field-card", isPaymentReturnEstimate && "border-emerald-400/35 ring-1 ring-emerald-400/25")}
                            data-testid={isPaymentReturnEstimate ? "history-payment-return-estimate" : undefined}
                        >
                            <CardHeader className="pb-3">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="min-w-0 space-y-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <CardTitle
                                                className="min-w-0 flex-[1_1_12rem] break-words text-lg leading-tight [overflow-wrap:anywhere] sm:text-xl"
                                                data-testid="history-estimate-client-name"
                                            >
                                                {estimate.clientName || "Client"}
                                            </CardTitle>
                                            {estimate.estimateNumber ? (
                                                <span className="rounded-full border border-white/10 bg-slate-950/65 px-2.5 py-1 font-mono text-xs text-slate-300">
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
                                                <Badge variant="outline" className="border-amber-400/30 bg-amber-500/10 text-amber-200">
                                                    <AlertCircle className="mr-1 h-3 w-3" />
                                                    {priceTBDCount} TBD
                                                </Badge>
                                            ) : null}
                                            {estimate.synced === false ? (
                                                <Badge variant="outline" className="border-amber-400/30 bg-amber-500/10 text-amber-200">
                                                    Pending sync
                                                </Badge>
                                            ) : null}
                                            {estimate.quickbooksInvoiceId ? (
                                                <Badge variant="outline" className="border-sky-400/30 bg-sky-500/10 text-sky-200">
                                                    QB {estimate.quickbooksInvoiceStatus || "linked"}
                                                </Badge>
                                            ) : null}
                                        </div>
                                        <p className="line-clamp-2 max-w-2xl text-sm leading-6 text-slate-400">
                                            {estimate.summary_note}
                                        </p>
                                    </div>

                                    <div className="w-full rounded-lg border border-white/10 bg-slate-950/55 p-3 lg:max-w-xs">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Estimate total</p>
                                                <p className="mt-1 text-2xl font-semibold">{formatAmount(estimate.totalAmount)}</p>
                                            </div>
                                            <div className="min-w-[8.5rem] text-right text-[11px] leading-5 text-slate-400">
                                                <p>Created {new Date(estimate.createdAt).toLocaleDateString()}</p>
                                                <p>Updated {new Date(estimate.updatedAt || estimate.createdAt).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                        {(estimate.sentAt || estimate.paymentCompletedAt) ? (
                                            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
                                                {estimate.sentAt ? <span>Sent {new Date(estimate.sentAt).toLocaleDateString()}</span> : null}
                                                {estimate.paymentCompletedAt ? <span>Paid {new Date(estimate.paymentCompletedAt).toLocaleDateString()}</span> : null}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-2">
                                    <div className={historyCompactBoxClass}>
                                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Client</p>
                                        <p className="mt-1 truncate text-sm font-semibold">{estimate.clientName || "Missing client"}</p>
                                        <p className="mt-1 line-clamp-1 text-xs text-slate-400">{estimate.clientAddress || "No address"}</p>
                                    </div>
                                    <div className={historyCompactBoxClass}>
                                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Line items</p>
                                        <p className="mt-1 text-sm font-semibold">{items.length} item{items.length === 1 ? "" : "s"}</p>
                                        <p className="mt-1 line-clamp-1 text-xs text-slate-400">
                                            {priceTBDCount > 0 ? `${priceTBDCount} still missing pricing` : "Pricing is fully assigned"}
                                        </p>
                                    </div>
                                    <div className={historyCompactBoxClass}>
                                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Payment</p>
                                        <p className="mt-1 text-sm font-semibold">
                                            {estimate.paymentLinkId ? "Payment link attached" : "No payment link"}
                                        </p>
                                        <p className="mt-1 line-clamp-1 text-xs text-slate-400">
                                            {estimate.paymentCompletedAt ? `Completed ${new Date(estimate.paymentCompletedAt).toLocaleDateString()}` : "Polling keeps sent quotes current"}
                                        </p>
                                    </div>
                                    <div className={historyCompactBoxClass}>
                                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">QuickBooks</p>
                                        <p className="mt-1 truncate text-sm font-semibold">
                                            {estimate.quickbooksInvoiceId ? (estimate.quickbooksDocNumber || estimate.quickbooksInvoiceStatus || "Linked") : "Not synced"}
                                        </p>
                                        <p className="mt-1 line-clamp-1 text-xs text-slate-400">
                                            {estimate.quickbooksSyncedAt ? `Synced ${new Date(estimate.quickbooksSyncedAt).toLocaleDateString()}` : "Ready when finalized"}
                                        </p>
                                    </div>
                                </div>

                                {actionIssue ? (
                                    <div
                                        className="rounded-lg border border-amber-300/20 bg-amber-400/10 p-3"
                                        data-testid={actionIssue.kind === "pdf" ? "history-pdf-issue" : "history-quickbooks-issue"}
                                        role="alert"
                                    >
                                        <div className="flex gap-2">
                                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                                            <div className="min-w-0">
                                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200/80">Action needed</p>
                                                <p className="mt-1 text-sm font-semibold text-amber-100">{actionIssue.title}</p>
                                                <p className="mt-1 text-xs leading-5 text-amber-100/75">{actionIssue.message}</p>
                                            </div>
                                        </div>
                                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                            {actionIssue.kind === "pdf" ? (
                                                <>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        className="rounded-lg"
                                                        onClick={() => void handleDownloadPdf(estimate)}
                                                        disabled={downloadingEstimateId === estimate.id}
                                                        data-testid="history-pdf-retry-action"
                                                    >
                                                        {downloadingEstimateId === estimate.id ? (
                                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                        ) : (
                                                            <RefreshCw className="mr-2 h-4 w-4" />
                                                        )}
                                                        Retry PDF
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        className="rounded-lg border-amber-300/20 bg-slate-950/70 text-amber-100 hover:bg-amber-400/10"
                                                        onClick={() => {
                                                            setHistoryActionIssue(null)
                                                            setPreviewEstimate(estimate)
                                                        }}
                                                        data-testid="history-pdf-preview-action"
                                                    >
                                                        <FileText className="mr-2 h-4 w-4" />
                                                        Preview instead
                                                    </Button>
                                                </>
                                            ) : (
                                                <>
                                                    {quickBooksStatus?.connected ? (
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            className="rounded-lg"
                                                            onClick={() => void handleSyncQuickBooks(estimate)}
                                                            disabled={syncingQuickBooksEstimateId === estimate.id}
                                                            data-testid="history-quickbooks-retry-action"
                                                        >
                                                            {syncingQuickBooksEstimateId === estimate.id ? (
                                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                            ) : (
                                                                <RefreshCw className="mr-2 h-4 w-4" />
                                                            )}
                                                            Retry QuickBooks
                                                        </Button>
                                                    ) : (
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            className="rounded-lg"
                                                            onClick={() => void handleConnectQuickBooks()}
                                                            disabled={quickBooksConnecting}
                                                            data-testid="history-quickbooks-connect-action"
                                                        >
                                                            {quickBooksConnecting ? (
                                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                            ) : (
                                                                <Link2 className="mr-2 h-4 w-4" />
                                                            )}
                                                            Connect QuickBooks
                                                        </Button>
                                                    )}
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        className="rounded-lg border-amber-300/20 bg-slate-950/70 text-amber-100 hover:bg-amber-400/10"
                                                        onClick={handleExportCSV}
                                                        data-testid="history-quickbooks-export-action"
                                                    >
                                                        <Download className="mr-2 h-4 w-4" />
                                                        Export CSV
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ) : null}

                                {/* Expanded Items */}
                                {isExpanded && items.length > 0 && (
                                    <div className="space-y-2 border-t border-white/10 pt-3">
                                        {items.map((item: EstimateItem, idx: number) => (
                                            <div key={idx} className={cn("flex justify-between gap-4 rounded-lg border border-white/10 bg-slate-950/45 p-3 text-sm", item.unit_price === 0 && "border-amber-400/25 bg-amber-500/10")}>
                                                <div>
                                                    <p className="font-medium">{item.description}</p>
                                                    <p className="text-xs text-slate-400">
                                                        Qty: {item.quantity} × ${item.unit_price.toFixed(2)}
                                                        {item.unit_price === 0 && <span className="ml-2 text-amber-300">Price TBD</span>}
                                                    </p>
                                                </div>
                                                <p className="font-semibold">{formatAmount(item.total)}</p>
                                            </div>
                                        ))}
                                        {estimate.taxAmount > 0 && (
                                            <div className="border-t border-white/10 pt-2">
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-slate-400">Subtotal</span>
                                                    <span>{formatAmount(estimate.totalAmount - estimate.taxAmount)}</span>
                                                </div>
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-slate-400">Tax ({estimate.taxRate}%)</span>
                                                    <span>{formatAmount(estimate.taxAmount)}</span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Attachments Section - Dispute Prevention */}
                                        {estimate.attachments && (estimate.attachments.photos?.length > 0 || estimate.attachments.originalTranscript) && (
                                            <div className="mt-3 border-t border-white/10 pt-3">
                                                <p className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-300">
                                                    <ReceiptText className="h-4 w-4 text-sky-300" />
                                                    Original data
                                                </p>

                                                {/* Photos */}
                                                {estimate.attachments.photos && estimate.attachments.photos.length > 0 && (
                                                    <div className="mb-2">
                                                        <p className="mb-1 flex items-center gap-1.5 text-xs text-slate-400">
                                                            <ImageIcon className="h-3.5 w-3.5" />
                                                            Photos ({estimate.attachments.photos.length})
                                                        </p>
                                                        <div className="flex gap-2 overflow-x-auto">
                                                            {estimate.attachments.photos.map((url, i) => (
                                                                // eslint-disable-next-line @next/next/no-img-element
                                                                <img
                                                                    key={i}
                                                                    src={url}
                                                                    alt={`Attachment ${i + 1}`}
                                                                    className="h-16 w-16 rounded-lg border border-white/10 object-cover"
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Transcript */}
                                                {estimate.attachments.originalTranscript && (
                                                    <div>
                                                        <p className="mb-1 flex items-center gap-1.5 text-xs text-slate-400">
                                                            <Mic className="h-3.5 w-3.5" />
                                                            Original transcript
                                                        </p>
                                                        <p className="rounded-lg border border-white/10 bg-slate-950/55 p-3 text-xs italic text-slate-300">
                                                            &ldquo;{estimate.attachments.originalTranscript}&rdquo;
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="space-y-3 border-t border-white/10 pt-4">
                                    <div
                                        className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
                                        data-testid="history-estimate-primary-actions"
                                    >
                                        {items.length > 0 && (
                                            <>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className={cn(historyOutlineButtonClass, "w-full sm:w-auto")}
                                                    onClick={() => {
                                                        setHistoryActionIssue(null)
                                                        setPreviewEstimate(estimate)
                                                    }}
                                                    data-testid="history-estimate-preview-action"
                                                >
                                                    <FileText className="mr-1 h-3 w-3" />
                                                    Preview
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    className="w-full bg-slate-800 text-slate-100 hover:bg-slate-700 sm:w-auto"
                                                    onClick={() => void handleDownloadPdf(estimate)}
                                                    disabled={downloadingEstimateId === estimate.id}
                                                >
                                                    {downloadingEstimateId === estimate.id ? (
                                                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                                    ) : (
                                                        <Download className="mr-1 h-3 w-3" />
                                                    )}
                                                    PDF
                                                </Button>
                                            </>
                                        )}

                                        {activeTab === "drafts" && (
                                            <Button
                                                variant="default"
                                                size="sm"
                                                className="w-full sm:w-auto"
                                                onClick={() => handleEditDraft(estimate)}
                                                data-testid="history-edit-draft-button"
                                            >
                                                {priceTBDCount > 0 ? (
                                                    <AlertCircle className="mr-1 h-3 w-3" />
                                                ) : (
                                                    <FileText className="mr-1 h-3 w-3" />
                                                )}
                                                {priceTBDCount > 0 ? "Finish pricing" : "Review draft"}
                                            </Button>
                                        )}

                                        {activeTab === "sent" && estimate.status === "sent" && (
                                            <Button
                                                variant="default"
                                                size="sm"
                                                className="w-full sm:w-auto"
                                                onClick={() => handleMarkAsPaid(estimate.id)}
                                            >
                                                <CircleDollarSign className="mr-1 h-3 w-3" />
                                                Mark Paid
                                            </Button>
                                        )}

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className={cn(historyOutlineButtonClass, "w-full sm:w-auto")}
                                            onClick={() => toggleExpand(estimate.id)}
                                        >
                                            <FileText className="mr-1 h-3 w-3" />
                                            {isExpanded ? "Hide" : "Details"}
                                        </Button>
                                    </div>

                                    <details className="group rounded-lg border border-white/10 bg-slate-950/35">
                                        <summary
                                            className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm font-medium text-slate-200 outline-none transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&::-webkit-details-marker]:hidden"
                                            data-testid="history-more-actions-toggle"
                                        >
                                            <span className="flex items-center gap-2">
                                                <MoreHorizontal className="h-4 w-4 text-slate-400" />
                                                More actions
                                            </span>
                                            <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
                                        </summary>
                                        <div
                                            className="grid grid-cols-2 gap-2 border-t border-white/10 px-3 py-3 sm:flex sm:flex-wrap"
                                            data-testid="history-estimate-secondary-actions"
                                        >
                                            {activeTab === "drafts" && (
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    className="w-full shrink-0 bg-slate-800 text-slate-100 hover:bg-slate-700 sm:w-auto"
                                                    onClick={() => handleMarkAsSent(estimate.id)}
                                                >
                                                    <Send className="mr-1 h-3 w-3" />
                                                    Mark Sent
                                                </Button>
                                            )}

                                            {estimate.status === "sent" && estimate.type !== "invoice" && (
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    className="w-full shrink-0 bg-slate-800 text-slate-100 hover:bg-slate-700 sm:w-auto"
                                                    onClick={() => handleConvertToInvoice(estimate)}
                                                >
                                                    <ReceiptText className="mr-1 h-3 w-3" />
                                                    To Invoice
                                                </Button>
                                            )}

                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className={historySecondaryButtonClass}
                                                onClick={() => handleDuplicate(estimate)}
                                            >
                                                <Copy className="mr-1 h-3 w-3" />
                                                Duplicate
                                            </Button>

                                            {isLocalOnlyMode ? (
                                                <Button
                                                    asChild
                                                    variant="outline"
                                                    size="sm"
                                                    className={historySecondaryButtonClass}
                                                >
                                                    <Link href={loginToHistoryHref}>
                                                        <LogIn className="mr-1 h-3 w-3" />
                                                        Sign in to send/sync
                                                    </Link>
                                                </Button>
                                            ) : (
                                                <>
                                                    {estimate.status !== "paid" && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className={historySecondaryButtonClass}
                                                            onClick={() => setFollowUpEstimate(estimate)}
                                                        >
                                                            <Mail className="mr-1 h-3 w-3" />
                                                            Follow-up
                                                        </Button>
                                                    )}
                                                    {estimate.status !== "paid" && (
                                                        <Button
                                                            variant="secondary"
                                                            size="sm"
                                                            className="w-full shrink-0 bg-slate-800 text-slate-100 hover:bg-slate-700 sm:w-auto"
                                                            onClick={() => setSmsEstimate(estimate)}
                                                        >
                                                            <MessageSquare className="mr-1 h-3 w-3" />
                                                            SMS
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className={historySecondaryButtonClass}
                                                        onClick={() => void handleSyncQuickBooks(estimate)}
                                                        disabled={!quickBooksStatus?.connected || syncingQuickBooksEstimateId === estimate.id}
                                                    >
                                                        {syncingQuickBooksEstimateId === estimate.id ? (
                                                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                                        ) : (
                                                            <Link2 className="mr-1 h-3 w-3" />
                                                        )}
                                                        {estimate.quickbooksInvoiceId ? "Refresh QB" : "QuickBooks"}
                                                    </Button>
                                                </>
                                            )}

                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                className="w-full shrink-0 sm:w-auto"
                                                onClick={(e) => handleDeleteClick(e, estimate.id)}
                                            >
                                                <Trash2 className="mr-1 h-3 w-3" />
                                                Delete
                                            </Button>
                                        </div>
                                    </details>
                                </div>
                            </CardContent>
                        </Card>
                    )
                })
            )}
            </section>
            </div>
            </div>

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
                        fileName={buildEstimatePdfFileName({
                            estimateNumber: previewEstimate.estimateNumber,
                            clientName: previewEstimate.clientName,
                        })}
                        clientName={previewEstimate.clientName}
                        clientAddress={previewEstimate.clientAddress}
                        businessName={businessProfile?.business_name}
                        estimateTotal={previewEstimate.totalAmount}
                        estimateItems={getAllItemsFromEstimate(previewEstimate)}
                        summaryNote={previewEstimate.summary_note}
                        taxRate={previewEstimate.taxRate}
                        paymentLink={previewEstimate.paymentLink || businessProfile?.payment_link || null}
                    />
                )
            }

            {
                followUpEstimate && (
                    <FollowUpModal
                        open={!!followUpEstimate}
                        onClose={() => setFollowUpEstimate(null)}
                        clientName={followUpEstimate.clientName}
                        clientEmail={followUpEstimate.clientEmail}
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

function HistoryPageFallback() {
    return (
        <AuthGate
            loading
            nextPath="/history"
            title="Loading local quote history"
            description="Pulling the estimates saved on this device."
            loadingLabel="Loading quote history..."
        />
    )
}

export default function HistoryPage() {
    return (
        <Suspense fallback={<HistoryPageFallback />}>
            <HistoryPageContent />
        </Suspense>
    )
}
