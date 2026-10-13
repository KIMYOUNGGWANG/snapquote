"use client"

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Download, FileText, Copy, Trash2, Mail, AlertCircle, MessageSquare, RefreshCw, Link2, Clock3, CloudUpload, CircleDollarSign, Send, CheckCircle2, ReceiptText, Image as ImageIcon, Mic, LogIn, MoreHorizontal, ChevronDown, Search, X, ArrowRight, CreditCard, Sparkles } from "lucide-react"
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
import { getDraftSendReadiness, hasScopeAssumptionsConfirmed, isCaptureOnlyDraft, isDraftEstimate, needsScopeAssumptionsReview } from "@/lib/estimates/draft-state"
import { cn } from "@/lib/utils"
import { buildEstimatePdfFileName, downloadBlobAsFile } from "@/lib/estimate-pdf-file"
import {
    buildPaymentLinkIssue,
    PaymentLinkCreationError,
    readPaymentLinkErrorPayload,
    type PaymentLinkIssue,
} from "@/lib/payment-link-errors"
import {
    appendCustomerPortalLink,
    createCustomerPortalLinkForEstimate,
    customerPortalEstimateUpdatesChanged,
    fetchCustomerPortalLinkForEstimate,
    getCustomerPortalEstimateUpdates,
    maybeCreateCustomerPortalLinkForEstimate,
} from "@/lib/customer-portal-client"
import { isOpenCustomerChangeRequest, isSupersededCustomerChangeRequest } from "@/lib/customer-revisions"
import { isEstimateReadyForFollowUp } from "@/lib/follow-up-service"
import { isEstimatePaidLike } from "@/lib/estimate-payment-state"

type TabType = 'drafts' | 'sent' | 'paid'
type HistoryDeepLinkAction = "follow-up" | "sms"

type StripePaymentStatusResponse = {
    ok: boolean
    paid: boolean
    checkoutSessionId?: string
    paidAt?: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type HistoryActionIssue = {
    estimateId: string
    kind: "pdf" | "quickbooks" | "payment_link"
    title: string
    message: string
    paymentLinkIssue?: PaymentLinkIssue
}

type QuickBooksPanelIssue = {
    action: "status" | "connect" | "upgrade"
    title: string
    message: string
}

type HistoryNextAction = {
    kind: "new" | "edit_draft" | "review_scope" | "focus_sent" | "focus_paid" | "sync_quickbooks" | "revise_quote" | "send_follow_up"
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

function isUuidLike(value: string): boolean {
    return UUID_PATTERN.test(value)
}

function getTabForEstimate(estimate: LocalEstimate): TabType {
    if (isEstimatePaidLike(estimate)) return "paid"
    if (estimate.status === "sent") return "sent"
    return "drafts"
}

function getTabFromQueryParam(value: string | null): TabType | null {
    if (value === "drafts" || value === "sent" || value === "paid") return value
    return null
}

function getHistoryActionFromQueryParam(value: string | null): HistoryDeepLinkAction | null {
    if (value === "follow-up") return value
    if (value === "sms") return value
    return null
}

function getPriceTBDCount(estimate: LocalEstimate): number {
    return getAllItemsFromEstimate(estimate).filter((item) => item.unit_price === 0).length
}

function getEstimateDisplayName(estimate: LocalEstimate): string {
    return estimate.clientName || estimate.estimateNumber || "this quote"
}

function formatCustomerDate(value?: string): string {
    if (!value) return ""

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ""

    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function getCustomerPortalSummary(estimate: LocalEstimate): { label: string; helper: string } {
    if (estimate.customerPortalStatus === "approved") {
        const dateLabel = formatCustomerDate(estimate.customerApprovedAt)
        return {
            label: "Approved",
            helper: dateLabel ? `Approved ${dateLabel}` : "Ready to collect payment",
        }
    }

    if (estimate.customerPortalStatus === "change_requested") {
        if (isSupersededCustomerChangeRequest(estimate)) {
            const dateLabel = formatCustomerDate(estimate.supersededAt)
            return {
                label: "Revision sent",
                helper: dateLabel ? `Covered by a newer quote ${dateLabel}` : "Covered by a newer quote",
            }
        }

        const dateLabel = formatCustomerDate(estimate.customerChangeRequestedAt)
        return {
            label: "Changes requested",
            helper: estimate.customerPortalNote || (dateLabel ? `Requested ${dateLabel}` : "Start a revised quote"),
        }
    }

    if (estimate.customerPortalStatus === "viewed") {
        const dateLabel = formatCustomerDate(estimate.customerViewedAt)
        return {
            label: "Viewed",
            helper: dateLabel ? `Viewed ${dateLabel}. Follow up while it is fresh` : "Customer opened the quote",
        }
    }

    if (estimate.customerPortalUrl) {
        return {
            label: "Link shared",
            helper: "Waiting for the customer to open it",
        }
    }

    return {
        label: "No approval link",
        helper: "Send a customer link to track approval",
    }
}

function getFollowUpBadgeLabel(estimate: LocalEstimate): string {
    const dateLabel = formatCustomerDate(estimate.lastFollowedUpAt)
    if (estimate.lastFollowUpChannel === "sms") {
        return dateLabel ? `Texted ${dateLabel}` : "Texted"
    }
    if (estimate.lastFollowUpChannel === "automation") {
        return dateLabel ? `Auto-followed ${dateLabel}` : "Auto-followed"
    }

    return dateLabel ? `Followed up ${dateLabel}` : "Followed up"
}

function canSendCustomerFollowUp(estimate: LocalEstimate): boolean {
    return !isEstimatePaidLike(estimate)
        && estimate.status === "sent"
        && estimate.customerPortalStatus !== "approved"
        && estimate.customerPortalStatus !== "change_requested"
}

async function markEstimateFollowedUp(
    estimate: LocalEstimate,
    channel: NonNullable<LocalEstimate["lastFollowUpChannel"]>,
): Promise<LocalEstimate> {
    const followedUpAt = new Date().toISOString()
    const updates: Partial<LocalEstimate> = {
        firstFollowedUpAt: estimate.firstFollowedUpAt || followedUpAt,
        lastFollowedUpAt: followedUpAt,
        lastFollowUpChannel: channel,
        synced: false,
    }
    await updateEstimate(estimate.id, updates)

    return { ...estimate, ...updates }
}

function getEffectivePaymentLink(estimate: LocalEstimate, businessProfile?: BusinessInfo): string {
    return estimate.paymentLink?.trim() || businessProfile?.payment_link?.trim() || ""
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
        estimate.customerPortalUrl,
        estimate.customerPortalStatus,
        estimate.quickbooksDocNumber,
        estimate.quickbooksInvoiceStatus,
        estimate.createdAt,
        estimate.updatedAt,
        estimate.sentAt,
        estimate.paymentCompletedAt,
        itemText,
        estimate.customerPortalNote,
        estimate.supersededByEstimateId,
        estimate.supersededAt,
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
const quickBooksUpgradeHref = "/pricing?plan=pro&source=quickbooks_sync"

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
    const [creatingPortalLinkEstimateId, setCreatingPortalLinkEstimateId] = useState<string | null>(null)
    const [creatingPaymentLinkEstimateId, setCreatingPaymentLinkEstimateId] = useState<string | null>(null)
    const paymentStatusSyncInFlightRef = useRef(false)
    const handledDeepLinkActionRef = useRef<string | null>(null)
    const historySearch = searchParams.toString()
    const currentHistoryPath = historySearch ? `/history?${historySearch}` : "/history"
    const loginToHistoryHref = `/login?next=${encodeURIComponent(currentHistoryPath)}`
    const isPaymentSuccessReturn = searchParams.get("payment") === "success"
    const requestedHistoryTab = getTabFromQueryParam(searchParams.get("tab"))
    const requestedHistoryAction = getHistoryActionFromQueryParam(searchParams.get("action"))
    const returnEstimateId = searchParams.get("estimateId")?.trim() || ""
    const returnEstimateNumber = searchParams.get("estimateNumber")?.trim() || ""
    const paymentReturnStatus = searchParams.get("paymentStatus")?.trim() || ""
    const paymentReturnNeedsVerification = isPaymentSuccessReturn && paymentReturnStatus === "missing_session"
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
                action: "status",
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
        const paidLikeSentEstimates = estimatesForSync.filter(
            (estimate) => estimate.status === "sent" && isEstimatePaidLike(estimate)
        )
        const sentWithPaymentLinks = estimatesForSync.filter(
            (estimate) => estimate.status === "sent" && !isEstimatePaidLike(estimate) && Boolean(estimate.paymentLinkId)
        )

        if (paidLikeSentEstimates.length === 0 && sentWithPaymentLinks.length === 0) return

        paymentStatusSyncInFlightRef.current = true

        try {
            let updatedCount = 0
            let normalizedCount = 0
            const headers = await withAuthHeaders()

            for (const estimate of paidLikeSentEstimates) {
                await updateEstimate(estimate.id, {
                    status: "paid",
                    paymentCompletedAt: estimate.paymentCompletedAt,
                    synced: false,
                })
                normalizedCount += 1
            }

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
                        status_transitioned: true,
                    },
                })
            }

            if (updatedCount > 0 || normalizedCount > 0) {
                const refreshed = await getEstimates()
                setEstimates(refreshed)
                if (updatedCount > 0) {
                    toast(`${updatedCount} payment${updatedCount > 1 ? "s" : ""} synced.`, "success")
                }
            }
        } catch (error) {
            console.error("Failed to sync sent estimate payment statuses:", error)
        } finally {
            paymentStatusSyncInFlightRef.current = false
        }
    }, [isAuthenticated])

    const syncCustomerPortalStatuses = useCallback(async (sourceEstimates?: LocalEstimate[]) => {
        if (!isAuthenticated) return

        const estimatesForSync = sourceEstimates ?? await getEstimates()
        const portalEstimates = estimatesForSync.filter((estimate) => Boolean(estimate.customerPortalUrl))
        if (portalEstimates.length === 0) return

        try {
            let updatedCount = 0

            for (const estimate of portalEstimates) {
                const result = await fetchCustomerPortalLinkForEstimate(estimate.id)
                if (!result) continue

                const updates = getCustomerPortalEstimateUpdates(result)
                if (!customerPortalEstimateUpdatesChanged(estimate, updates)) continue

                await updateEstimate(estimate.id, updates)
                updatedCount += 1
            }

            if (updatedCount > 0) {
                setEstimates(await getEstimates())
                toast(`${updatedCount} customer response${updatedCount > 1 ? "s" : ""} synced.`, "success")
            }
        } catch (error) {
            console.error("Failed to sync customer quote portal statuses:", error)
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
            action: "status",
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
            void syncCustomerPortalStatuses(localEstimates)
        }
    }, [isAuthenticated, syncCustomerPortalStatuses, syncSentEstimatePaymentStatuses])

    useEffect(() => {
        if (!authResolved) return
        void loadData()
    }, [authResolved, loadData])

    useEffect(() => {
        if (!isPaymentSuccessReturn) return

        const matchedEstimate = estimates.find((estimate) =>
            matchesPaymentReturnEstimate(estimate, returnEstimateId, returnEstimateNumber)
        )

        setActiveTab(paymentReturnNeedsVerification && matchedEstimate
            ? getTabForEstimate(matchedEstimate)
            : "paid")

        if (matchedEstimate) {
            setExpandedId(matchedEstimate.id)
        }
    }, [estimates, isPaymentSuccessReturn, paymentReturnNeedsVerification, returnEstimateId, returnEstimateNumber])

    useEffect(() => {
        if (loading || isPaymentSuccessReturn) return
        if (!requestedHistoryTab && !returnEstimateId) return

        const matchedEstimate = returnEstimateId
            ? estimates.find((estimate) => estimate.id === returnEstimateId)
            : null
        const targetTab = requestedHistoryTab || (matchedEstimate ? getTabForEstimate(matchedEstimate) : null)

        if (!targetTab) return

        setActiveTab(targetTab)
        setSearchQuery("")
        if (matchedEstimate) {
            setExpandedId(matchedEstimate.id)
        }

        window.setTimeout(() => {
            document.getElementById("history-estimate-lanes")?.scrollIntoView({
                behavior: "smooth",
                block: "start",
            })
        }, 0)
    }, [estimates, isPaymentSuccessReturn, loading, requestedHistoryTab, returnEstimateId])

    useEffect(() => {
        if (!authResolved || !isAuthenticated) return

        const intervalId = window.setInterval(() => {
            void syncSentEstimatePaymentStatuses()
            void syncCustomerPortalStatuses()
        }, 20_000)

        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                void syncSentEstimatePaymentStatuses()
                void syncCustomerPortalStatuses()
            }
        }

        document.addEventListener("visibilitychange", handleVisibilityChange)
        return () => {
            window.clearInterval(intervalId)
            document.removeEventListener("visibilitychange", handleVisibilityChange)
        }
    }, [authResolved, isAuthenticated, syncCustomerPortalStatuses, syncSentEstimatePaymentStatuses])

    const normalizedSearchQuery = searchQuery.trim().toLowerCase()

    const laneEstimates = useMemo(() => {
        return estimates.filter((estimate) => {
            if (activeTab === "drafts") {
                return estimate.status === "draft" || !estimate.status
            }

            if (activeTab === "sent") {
                return estimate.status === "sent" && !isEstimatePaidLike(estimate)
            }

            return isEstimatePaidLike(estimate)
        })
    }, [activeTab, estimates])

    const filteredEstimates = useMemo(() => {
        if (!normalizedSearchQuery) return laneEstimates

        return laneEstimates.filter((estimate) => buildEstimateSearchText(estimate).includes(normalizedSearchQuery))
    }, [laneEstimates, normalizedSearchQuery])

    const historyMetrics = useMemo(() => {
        const drafts = estimates.filter((estimate) => estimate.status === "draft" || !estimate.status)
        const sent = estimates.filter((estimate) => estimate.status === "sent" && !isEstimatePaidLike(estimate))
        const paid = estimates.filter(isEstimatePaidLike)

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
    const paymentReturnMatchedAsPaid = Boolean(paymentReturnEstimate && (
        !paymentReturnNeedsVerification || isEstimatePaidLike(paymentReturnEstimate)
    ))
    const hasActiveSearch = normalizedSearchQuery.length > 0

    const historyNextAction = useMemo<HistoryNextAction>(() => {
        const now = new Date()
        const drafts = estimates.filter(isDraftEstimate)
        const sent = estimates.filter((estimate) => estimate.status === "sent" && !isEstimatePaidLike(estimate))
        const actionableSent = sent.filter((estimate) => !isSupersededCustomerChangeRequest(estimate))
        const paid = estimates.filter(isEstimatePaidLike)
        const sentWithChangeRequest = sent.find((estimate) => isOpenCustomerChangeRequest(estimate))
        const sentNeedingScopeReview = actionableSent.find((estimate) => needsScopeAssumptionsReview(estimate))
        const approvedOpenQuote = actionableSent.find((estimate) => estimate.customerPortalStatus === "approved")
        const viewedOpenQuote = actionableSent.find((estimate) => (
            estimate.customerPortalStatus === "viewed" && isEstimateReadyForFollowUp(estimate, now)
        ))
        const captureOnlyDraft = drafts.find(isCaptureOnlyDraft)
        const draftWithMissingPrice = drafts.find((estimate) => getPriceTBDCount(estimate) > 0)
        const latestDraft = drafts[0]
        const latestSent = actionableSent[0]
        const paidPendingQuickBooks = paid.find((estimate) => !estimate.quickbooksInvoiceId)

        if (sentWithChangeRequest) {
            return {
                kind: "revise_quote",
                estimateId: sentWithChangeRequest.id,
                title: "Revise requested changes",
                description: sentWithChangeRequest.customerPortalNote
                    ? `${getEstimateDisplayName(sentWithChangeRequest)} asked for: ${sentWithChangeRequest.customerPortalNote}`
                    : `${getEstimateDisplayName(sentWithChangeRequest)} asked for changes. Start the revised quote while the context is fresh.`,
                buttonLabel: "Start revision",
            }
        }

        if (sentNeedingScopeReview) {
            return {
                kind: "review_scope",
                estimateId: sentNeedingScopeReview.id,
                title: "Review sent scope",
                description: `${getEstimateDisplayName(sentNeedingScopeReview)} is sent, but the field notes need confirmation before follow-up, re-sharing, or collection.`,
                buttonLabel: "Review scope",
            }
        }

        if (captureOnlyDraft) {
            return {
                kind: "edit_draft",
                estimateId: captureOnlyDraft.id,
                title: "Turn capture into quote",
                description: `${getEstimateDisplayName(captureOnlyDraft)} has field notes saved but no AI draft yet.`,
                buttonLabel: "Resume capture",
            }
        }

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

        if (approvedOpenQuote) {
            return {
                kind: "focus_sent",
                estimateId: approvedOpenQuote.id,
                title: "Collect approved quote",
                description: `${getEstimateDisplayName(approvedOpenQuote)} approved ${formatAmount(approvedOpenQuote.totalAmount)}. Mark paid after collecting or confirming checkout.`,
                buttonLabel: "Collect payment",
            }
        }

        if (viewedOpenQuote) {
            return {
                kind: "send_follow_up",
                estimateId: viewedOpenQuote.id,
                title: "Follow up on viewed quote",
                description: `${getEstimateDisplayName(viewedOpenQuote)} opened the quote but has not approved yet.`,
                buttonLabel: "Send follow-up",
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
            sections: estimate.sections,
            summary_note: estimate.summary_note,
            payment_terms: estimate.payment_terms,
            closing_note: estimate.closing_note,
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

    const handleStartCustomerRevision = useCallback((estimate: LocalEstimate) => {
        const changeRequestedAt = formatCustomerDate(estimate.customerChangeRequestedAt)
        const customerRequestNote = estimate.customerPortalNote?.trim()
        const revisionNote = customerRequestNote
            ? `Customer requested changes${changeRequestedAt ? ` on ${changeRequestedAt}` : ""}: ${customerRequestNote}`
            : `Customer requested changes${changeRequestedAt ? ` on ${changeRequestedAt}` : ""}.`
        const clientNotes = [estimate.clientNotes, revisionNote]
            .filter((value) => typeof value === "string" && value.trim())
            .join("\n\n")

        localStorage.setItem('duplicate_estimate', JSON.stringify({
            items: estimate.items,
            sections: estimate.sections,
            summary_note: estimate.summary_note,
            payment_terms: estimate.payment_terms,
            closing_note: estimate.closing_note,
            clientName: estimate.clientName,
            clientAddress: estimate.clientAddress,
            clientEmail: estimate.clientEmail,
            clientPhone: estimate.clientPhone,
            clientNotes,
            taxRate: estimate.taxRate,
            revisionContext: {
                originalEstimateId: estimate.id,
                originalEstimateNumber: estimate.estimateNumber,
                requestedAt: estimate.customerChangeRequestedAt,
                customerName: estimate.customerPortalName || estimate.clientName,
                customerEmail: estimate.customerPortalEmail || estimate.clientEmail,
                note: customerRequestNote || undefined,
            },
        }))
        router.push('/new-estimate?mode=manual')
    }, [router])

    const handleEditDraft = useCallback((estimate: LocalEstimate) => {
        const params = new URLSearchParams({ draftId: estimate.id })
        router.push(`/new-estimate?${params.toString()}`)
    }, [router])

    const requestDeliveryScopeReview = useCallback((estimate: LocalEstimate, message: string) => {
        if (!needsScopeAssumptionsReview(estimate)) return false

        toast(message, "warning")
        handleEditDraft(estimate)
        return true
    }, [handleEditDraft])

    const handleMarkAsSent = async (estimateId: string) => {
        const targetEstimate = estimates.find(est => est.id === estimateId)
        if (targetEstimate) {
            const sendReadiness = getDraftSendReadiness(targetEstimate)
            if (!sendReadiness.ready) {
                toast(sendReadiness.message, "warning")
                handleEditDraft(targetEstimate)
                return
            }
        }

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
                metadata: {
                    status_transitioned: !isEstimatePaidLike(targetEstimate),
                },
            })
        }
        await loadData()
        toast("Marked as paid.", "success")
    }

    const handleCopyPaymentLink = useCallback(async (paymentLinkInput: string) => {
        const paymentLink = paymentLinkInput.trim()
        if (!paymentLink) {
            toast("No payment link is attached to this estimate.", "error")
            return
        }

        try {
            await navigator.clipboard.writeText(paymentLink)
            toast("Payment link copied.", "success")
        } catch (error) {
            console.error("Failed to copy payment link:", error)
            toast("Could not copy the payment link. Open preview and copy it manually.", "error")
        }
    }, [])

    const handleCreateApprovedPaymentLink = useCallback(async (estimate: LocalEstimate) => {
        setHistoryActionIssue(null)
        const amount = Number(estimate.totalAmount)
        if (!Number.isFinite(amount) || amount <= 0) {
            const issue = buildPaymentLinkIssue({ message: "Add a positive estimate total before creating a payment link." })
            setHistoryActionIssue({
                estimateId: estimate.id,
                kind: "payment_link",
                title: issue.title,
                message: issue.message,
                paymentLinkIssue: issue,
            })
            return
        }

        if (isLocalOnlyMode) {
            router.push(loginToHistoryHref)
            return
        }

        if (typeof navigator !== "undefined" && !navigator.onLine) {
            const issue = buildPaymentLinkIssue({ message: "Payment links require internet." })
            setHistoryActionIssue({
                estimateId: estimate.id,
                kind: "payment_link",
                title: issue.title,
                message: issue.message,
                paymentLinkIssue: issue,
            })
            return
        }

        setCreatingPaymentLinkEstimateId(estimate.id)
        try {
            const payload: {
                amount: number
                customerName: string
                estimateNumber: string
                estimateId?: string
            } = {
                amount,
                customerName: estimate.clientName || "Customer",
                estimateNumber: estimate.estimateNumber,
            }
            if (isUuidLike(estimate.id)) {
                payload.estimateId = estimate.id
            }

            const headers = await withAuthHeaders({ "Content-Type": "application/json" })
            const response = await fetch("/api/create-payment-link", {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
            })
            const data = await response.json().catch(() => ({}))

            if (!response.ok) {
                if (response.status === 401) {
                    toast("Session expired. Please sign in again.", "warning")
                    router.push(loginToHistoryHref)
                    return
                }

                const errorDetails = readPaymentLinkErrorPayload(data)
                throw new PaymentLinkCreationError(
                    errorDetails.message,
                    buildPaymentLinkIssue({
                        message: errorDetails.message,
                        code: errorDetails.code,
                        status: response.status,
                    })
                )
            }

            const paymentLinkData = data as { url?: unknown; id?: unknown }
            const paymentLink = typeof paymentLinkData.url === "string" ? paymentLinkData.url.trim() : ""
            if (!paymentLink) {
                throw new PaymentLinkCreationError(
                    "Payment link response was missing a URL.",
                    buildPaymentLinkIssue({ message: "Payment link response was missing a URL." })
                )
            }

            const paymentLinkId = typeof paymentLinkData.id === "string" ? paymentLinkData.id.trim() : ""
            const paymentLinkUpdates: Partial<LocalEstimate> = {
                paymentLink,
                paymentLinkId: paymentLinkId || undefined,
                paymentLinkType: "full",
                synced: false,
            }
            const estimateWithPaymentLink = {
                ...estimate,
                ...paymentLinkUpdates,
            }
            let portalUpdates: Partial<LocalEstimate> = {}

            if (estimate.customerPortalUrl) {
                try {
                    const portalResult = await createCustomerPortalLinkForEstimate(estimateWithPaymentLink, {
                        paymentLinkOverride: paymentLink,
                        paymentLinkTypeOverride: "full",
                    })
                    portalUpdates = getCustomerPortalEstimateUpdates(portalResult)
                } catch (portalError) {
                    console.warn("Payment link created, but customer portal snapshot refresh failed:", portalError)
                }
            }

            await updateEstimate(estimate.id, {
                ...paymentLinkUpdates,
                ...portalUpdates,
                synced: false,
            })
            const refreshed = await getEstimates()
            setEstimates(refreshed)

            void trackAnalyticsEvent({
                event: "payment_link_created",
                estimateId: estimate.id,
                estimateNumber: estimate.estimateNumber,
                channel: "history_approved_quote",
                metadata: {
                    amount,
                    type: "full",
                },
            })

            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(paymentLink)
                toast("Payment link created and copied.", "success")
            } else {
                toast("Payment link created.", "success")
            }
        } catch (error) {
            if (!(error instanceof PaymentLinkCreationError)) {
                console.error("Failed to create payment link from history:", error)
            }
            const message = error instanceof Error ? error.message : "Failed to create payment link."
            const issue = error instanceof PaymentLinkCreationError
                ? error.issue
                : buildPaymentLinkIssue({ message })
            setHistoryActionIssue({
                estimateId: estimate.id,
                kind: "payment_link",
                title: issue.title,
                message: issue.message,
                paymentLinkIssue: issue,
            })
            toast(message, "error")
        } finally {
            setCreatingPaymentLinkEstimateId(null)
        }
    }, [isLocalOnlyMode, loginToHistoryHref, router])

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
                action: "upgrade",
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
                    action: "connect",
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
        if (requestDeliveryScopeReview(estimate, "Review scope assumptions before texting this estimate.")) {
            throw new Error("Review scope assumptions before texting this estimate.")
        }

        const effectivePaymentLink = getEffectivePaymentLink(estimate, businessProfile)
        const shouldAttachPortalLink = canSendCustomerFollowUp(estimate)
        const portalResult = shouldAttachPortalLink
            ? await maybeCreateCustomerPortalLinkForEstimate(estimate, {
                paymentLinkOverride: effectivePaymentLink,
                paymentLinkTypeOverride: estimate.paymentLink ? estimate.paymentLinkType : "custom",
            })
            : null
        const messageWithApprovalLink = shouldAttachPortalLink
            ? appendCustomerPortalLink(message, portalResult?.shareUrl, "sms")
            : message
        const data = await sendEstimateSms({
            estimateId: estimate.id,
            toPhoneNumber,
            message: messageWithApprovalLink,
        })

        if (estimate.status !== "sent" && estimate.status !== "paid") {
            await updateEstimateStatus(estimate.id, "sent")
        }

        if (portalResult) {
            await updateEstimate(estimate.id, getCustomerPortalEstimateUpdates(portalResult))
        }

        if (shouldAttachPortalLink) {
            await markEstimateFollowedUp(estimate, "sms")
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
                hasCustomerPortalLink: Boolean(portalResult?.shareUrl),
            },
        })

        await loadData()
        toast("SMS sent.", "success")
    }, [businessProfile, loadData, requestDeliveryScopeReview])

    const handleFollowUpEmailSent = useCallback(async (estimate: LocalEstimate) => {
        await markEstimateFollowedUp(estimate, "email")
        await loadData()
    }, [loadData])

    const handleCreateCustomerPortalLink = useCallback(async (estimate: LocalEstimate) => {
        if (requestDeliveryScopeReview(estimate, "Review scope assumptions before creating a customer approval link.")) return

        setCreatingPortalLinkEstimateId(estimate.id)
        try {
            const effectivePaymentLink = getEffectivePaymentLink(estimate, businessProfile)
            const result = await createCustomerPortalLinkForEstimate(estimate, {
                paymentLinkOverride: effectivePaymentLink,
                paymentLinkTypeOverride: estimate.paymentLink ? estimate.paymentLinkType : "custom",
            })
            await updateEstimate(estimate.id, getCustomerPortalEstimateUpdates(result))

            if (result.shareUrl) {
                await navigator.clipboard.writeText(result.shareUrl)
            }
            const refreshed = await getEstimates()
            setEstimates(refreshed)
            void trackAnalyticsEvent({
                event: "customer_portal_link_created",
                estimateId: estimate.id,
                estimateNumber: estimate.estimateNumber,
                channel: "history_customer_portal",
                metadata: {
                    portalStatus: result.portal.status,
                    hasPaymentLink: Boolean(effectivePaymentLink),
                },
            })
            toast("Customer approval link copied.", "success")
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to create customer approval link."
            toast(message, "error")
        } finally {
            setCreatingPortalLinkEstimateId(null)
        }
    }, [businessProfile, requestDeliveryScopeReview])

    const handleOpenFollowUp = useCallback(async (estimate: LocalEstimate) => {
        if (isEstimatePaidLike(estimate)) {
            toast("This estimate is already paid. Follow-up is closed.", "info")
            return
        }
        if (requestDeliveryScopeReview(estimate, "Review scope assumptions before sending a follow-up.")) return

        if (estimate.customerPortalUrl || isLocalOnlyMode) {
            setFollowUpEstimate(estimate)
            return
        }

        setCreatingPortalLinkEstimateId(estimate.id)
        try {
            const effectivePaymentLink = getEffectivePaymentLink(estimate, businessProfile)
            const result = await createCustomerPortalLinkForEstimate(estimate, {
                paymentLinkOverride: effectivePaymentLink,
                paymentLinkTypeOverride: estimate.paymentLink ? estimate.paymentLinkType : "custom",
            })
            const updates = getCustomerPortalEstimateUpdates(result)
            await updateEstimate(estimate.id, updates)
            const refreshed = await getEstimates()
            setEstimates(refreshed)
            setFollowUpEstimate({ ...estimate, ...updates })
        } catch (error) {
            console.error("Failed to prepare approval link for follow-up:", error)
            setFollowUpEstimate(estimate)
        } finally {
            setCreatingPortalLinkEstimateId(null)
        }
    }, [businessProfile, isLocalOnlyMode, requestDeliveryScopeReview])

    const handleOpenSms = useCallback((estimate: LocalEstimate) => {
        if (isEstimatePaidLike(estimate)) {
            toast("This estimate is already paid. Customer reminders are closed.", "info")
            return
        }
        if (requestDeliveryScopeReview(estimate, "Review scope assumptions before texting this estimate.")) return

        setSmsEstimate(estimate)
    }, [requestDeliveryScopeReview])

    useEffect(() => {
        if (loading || isPaymentSuccessReturn || !requestedHistoryAction || !returnEstimateId || isLocalOnlyMode) return

        const actionKey = `${requestedHistoryAction}:${returnEstimateId}`
        if (handledDeepLinkActionRef.current === actionKey) return

        const matchedEstimate = estimates.find((estimate) => estimate.id === returnEstimateId)
        if (!matchedEstimate) return
        if (requestedHistoryAction === "follow-up" && !canSendCustomerFollowUp(matchedEstimate)) return
        if (requestedHistoryAction === "sms" && isEstimatePaidLike(matchedEstimate)) return

        handledDeepLinkActionRef.current = actionKey
        setActiveTab(getTabForEstimate(matchedEstimate))
        setSearchQuery("")
        setExpandedId(matchedEstimate.id)
        if (requestedHistoryAction === "sms") {
            handleOpenSms(matchedEstimate)
            return
        }

        void handleOpenFollowUp(matchedEstimate)
    }, [estimates, handleOpenFollowUp, handleOpenSms, isLocalOnlyMode, isPaymentSuccessReturn, loading, requestedHistoryAction, returnEstimateId])

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
        if (requestDeliveryScopeReview(estimate, "Review scope assumptions before downloading the customer PDF.")) return

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
    }, [createEstimatePdfDocument, requestDeliveryScopeReview])

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

        if (historyNextAction.kind === "edit_draft" || historyNextAction.kind === "review_scope") {
            handleEditDraft(targetEstimate)
            return
        }

        if (historyNextAction.kind === "revise_quote") {
            handleStartCustomerRevision(targetEstimate)
            return
        }

        if (historyNextAction.kind === "send_follow_up") {
            void handleOpenFollowUp(targetEstimate)
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
                            paymentReturnMatchedAsPaid
                                ? "border-emerald-400/30 bg-emerald-500/10 ring-1 ring-emerald-400/20"
                                : "border-amber-300/25 bg-amber-400/10 ring-1 ring-amber-300/15"
                        )}
                        data-testid="history-payment-return-banner"
                    >
                        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex gap-3">
                                {paymentReturnMatchedAsPaid ? (
                                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                                ) : (
                                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" />
                                )}
                                <div>
                                    <p className={cn("text-sm font-semibold", paymentReturnMatchedAsPaid ? "text-emerald-100" : "text-amber-100")}>
                                        {paymentReturnNeedsVerification && !paymentReturnMatchedAsPaid
                                            ? "Payment confirmation needed"
                                            : paymentReturnEstimate ? "Payment matched in History" : "Payment received, local estimate not found"}
                                    </p>
                                    <p className={cn("mt-1 text-sm leading-6", paymentReturnMatchedAsPaid ? "text-emerald-100/80" : "text-amber-100/80")}>
                                        {paymentReturnNeedsVerification && !paymentReturnMatchedAsPaid
                                            ? paymentReturnReference
                                                ? `${paymentReturnReference} opened without a Stripe checkout session id. Keep it in the current lane until Stripe webhook or History sync confirms the payment.`
                                                : "This payment return did not include a Stripe checkout session id. Keep the estimate in its current lane until Stripe webhook or History sync confirms the payment."
                                            : paymentReturnEstimate
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
                                    setActiveTab(paymentReturnNeedsVerification && paymentReturnEstimate
                                        ? getTabForEstimate(paymentReturnEstimate)
                                        : "paid")
                                    if (paymentReturnEstimate) {
                                        setExpandedId(paymentReturnEstimate.id)
                                    }
                                    if (isAuthenticated) void syncSentEstimatePaymentStatuses()
                                }}
                            >
                                <CircleDollarSign className="mr-2 h-4 w-4" />
                                {paymentReturnNeedsVerification
                                    ? "Check status"
                                    : paymentReturnEstimate ? "Show paid estimate" : "Check paid lane"}
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
                                        {quickBooksStatus.eligible ? (
                                            <Button
                                                type="button"
                                                onClick={() => void handleConnectQuickBooks()}
                                                disabled={quickBooksConnecting}
                                                data-testid="history-quickbooks-connect-primary"
                                            >
                                                {quickBooksConnecting ? (
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Link2 className="mr-2 h-4 w-4" />
                                                )}
                                                {quickBooksStatus.connected ? "Reconnect QuickBooks" : "Connect QuickBooks"}
                                            </Button>
                                        ) : (
                                            <Button asChild data-testid="history-quickbooks-upgrade-action">
                                                <Link href={quickBooksUpgradeHref}>
                                                    <Sparkles className="mr-2 h-4 w-4" />
                                                    See Pro plan
                                                </Link>
                                            </Button>
                                        )}
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
                                    {quickBooksPanelIssue.action === "upgrade" ? (
                                        <Button asChild size="sm" className="rounded-lg" data-testid="history-quickbooks-panel-upgrade-action">
                                            <Link href={quickBooksUpgradeHref}>
                                                <Sparkles className="mr-2 h-4 w-4" />
                                                See Pro plan
                                            </Link>
                                        </Button>
                                    ) : (
                                        <Button
                                            type="button"
                                            size="sm"
                                            className="rounded-lg"
                                            onClick={() => {
                                                if (quickBooksPanelIssue.action === "status") {
                                                    void loadQuickBooks()
                                                    return
                                                }
                                                void handleConnectQuickBooks()
                                            }}
                                            disabled={quickBooksPanelIssue.action === "status" ? quickBooksLoading : quickBooksConnecting}
                                            data-testid={quickBooksPanelIssue.action === "status" ? "history-quickbooks-status-retry-action" : "history-quickbooks-connect-retry-action"}
                                        >
                                            {(quickBooksPanelIssue.action === "status" ? quickBooksLoading : quickBooksConnecting) ? (
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : (
                                                <RefreshCw className="mr-2 h-4 w-4" />
                                            )}
                                            {quickBooksPanelIssue.action === "status" ? "Retry status" : "Retry Connect"}
                                        </Button>
                                    )}
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
                    const isCaptureDraft = activeTab === "drafts" && isCaptureOnlyDraft(estimate)
                    const isScopeReviewed = hasScopeAssumptionsConfirmed(estimate)
                    const draftSendReadiness = activeTab === "drafts" ? getDraftSendReadiness(estimate) : null
                    const deliveryScopeReviewNeeded = needsScopeAssumptionsReview(estimate)
                    const actionIssue = historyActionIssue?.estimateId === estimate.id ? historyActionIssue : null
                    const isPaymentReturnEstimate = isPaymentSuccessReturn && matchesPaymentReturnEstimate(estimate, returnEstimateId, returnEstimateNumber)
                    const estimateIsPaidLike = isEstimatePaidLike(estimate)
                    const customerPortalSummary = getCustomerPortalSummary(estimate)
                    const effectivePaymentLink = getEffectivePaymentLink(estimate, businessProfile)
                    const shouldShowFollowUpAction = canSendCustomerFollowUp(estimate)
                    const isApprovedSentQuote = activeTab === "sent"
                        && estimate.status === "sent"
                        && !estimateIsPaidLike
                        && estimate.customerPortalStatus === "approved"
                    const shouldCopyPaymentLinkPrimary = isApprovedSentQuote
                        && Boolean(effectivePaymentLink)
                    const canCreatePaymentLinkPrimary = isApprovedSentQuote
                        && !effectivePaymentLink
                        && !isLocalOnlyMode
                    const paymentStatusLabel = estimate.paymentLink?.trim()
                        ? "Payment link attached"
                        : businessProfile?.payment_link?.trim()
                            ? "Profile payment link"
                            : canCreatePaymentLinkPrimary
                                ? "Ready for payment link"
                                : "No payment link"
                    const paymentHelperText = estimate.paymentCompletedAt
                        ? `Completed ${new Date(estimate.paymentCompletedAt).toLocaleDateString()}`
                        : estimate.paymentLinkId
                            ? "Polling keeps sent quotes current"
                            : effectivePaymentLink
                                ? "Ready to copy for customer payment"
                                : canCreatePaymentLinkPrimary
                                    ? "Create a card link for this approved quote"
                                    : "Add a payment link before sending"

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
                                            <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium uppercase", getEstimateStatusTone(estimateIsPaidLike ? "paid" : estimate.status))}>
                                                {estimate.type === "invoice"
                                                    ? "Invoice"
                                                    : estimateIsPaidLike
                                                        ? "Paid"
                                                        : estimate.status === "sent"
                                                            ? "Sent"
                                                            : "Draft"}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {isCaptureDraft ? (
                                                <Badge
                                                    variant="outline"
                                                    className="border-blue-400/30 bg-blue-500/10 text-blue-200"
                                                    data-testid="history-capture-draft-badge"
                                                >
                                                    <Sparkles className="mr-1 h-3 w-3" />
                                                    Needs AI draft
                                                </Badge>
                                            ) : null}
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
                                            {isScopeReviewed ? (
                                                <Badge variant="outline" className="border-emerald-400/30 bg-emerald-500/10 text-emerald-200" data-testid="history-scope-reviewed-badge">
                                                    <CheckCircle2 className="mr-1 h-3 w-3" />
                                                    Scope reviewed
                                                </Badge>
                                            ) : null}
                                            {deliveryScopeReviewNeeded ? (
                                                <Badge variant="outline" className="border-amber-400/30 bg-amber-500/10 text-amber-200" data-testid="history-scope-review-needed-badge">
                                                    <AlertCircle className="mr-1 h-3 w-3" />
                                                    Scope review needed
                                                </Badge>
                                            ) : null}
                                            {estimate.quickbooksInvoiceId ? (
                                                <Badge variant="outline" className="border-sky-400/30 bg-sky-500/10 text-sky-200">
                                                    QB {estimate.quickbooksInvoiceStatus || "linked"}
                                                </Badge>
                                            ) : null}
                                            {estimate.customerPortalUrl ? (
                                                <Badge variant="outline" className="border-emerald-400/30 bg-emerald-500/10 text-emerald-200">
                                                    Customer {customerPortalSummary.label.toLowerCase()}
                                                </Badge>
                                            ) : null}
                                            {estimate.lastFollowedUpAt ? (
                                                <Badge
                                                    variant="outline"
                                                    className="border-amber-400/30 bg-amber-500/10 text-amber-200"
                                                    data-testid="history-follow-up-recorded-badge"
                                                >
                                                    <Clock3 className="mr-1 h-3 w-3" />
                                                    {getFollowUpBadgeLabel(estimate)}
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
                                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                                    {isCaptureDraft ? "Capture status" : "Estimate total"}
                                                </p>
                                                <p className="mt-1 text-2xl font-semibold">
                                                    {isCaptureDraft ? "Saved" : formatAmount(estimate.totalAmount)}
                                                </p>
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
                                        <p className="mt-1 text-sm font-semibold">
                                            {isCaptureDraft ? "Field capture saved" : `${items.length} item${items.length === 1 ? "" : "s"}`}
                                        </p>
                                        <p className="mt-1 line-clamp-1 text-xs text-slate-400">
                                            {isCaptureDraft
                                                ? "Resume to generate the quote"
                                                : priceTBDCount > 0
                                                    ? `${priceTBDCount} still missing pricing`
                                                    : "Pricing is fully assigned"}
                                        </p>
                                    </div>
                                    <div className={historyCompactBoxClass}>
                                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Payment</p>
                                        <p className="mt-1 text-sm font-semibold">
                                            {paymentStatusLabel}
                                        </p>
                                        <p className="mt-1 line-clamp-1 text-xs text-slate-400">
                                            {paymentHelperText}
                                        </p>
                                    </div>
                                    <div className={historyCompactBoxClass} data-testid="history-customer-portal-status">
                                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Customer</p>
                                        <p className="mt-1 text-sm font-semibold">{customerPortalSummary.label}</p>
                                        <p className="mt-1 line-clamp-1 text-xs text-slate-400">
                                            {customerPortalSummary.helper}
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
                                        data-testid={actionIssue.kind === "pdf"
                                            ? "history-pdf-issue"
                                            : actionIssue.kind === "payment_link"
                                                ? "history-payment-link-issue"
                                                : "history-quickbooks-issue"}
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
                                            ) : actionIssue.kind === "payment_link" ? (
                                                <>
                                                    {actionIssue.paymentLinkIssue?.actionHref && actionIssue.paymentLinkIssue.actionLabel ? (
                                                        <Button asChild size="sm" className="rounded-lg" data-testid="history-payment-link-profile-action">
                                                            <Link href={actionIssue.paymentLinkIssue.actionHref}>
                                                                <Sparkles className="mr-2 h-4 w-4" />
                                                                {actionIssue.paymentLinkIssue.actionLabel}
                                                            </Link>
                                                        </Button>
                                                    ) : null}
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        className="rounded-lg"
                                                        onClick={() => void handleCreateApprovedPaymentLink(estimate)}
                                                        disabled={creatingPaymentLinkEstimateId === estimate.id}
                                                        data-testid="history-payment-link-retry-action"
                                                    >
                                                        {creatingPaymentLinkEstimateId === estimate.id ? (
                                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                        ) : (
                                                            <RefreshCw className="mr-2 h-4 w-4" />
                                                        )}
                                                        Retry pay link
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        className="rounded-lg border-amber-300/20 bg-slate-950/70 text-amber-100 hover:bg-amber-400/10"
                                                        onClick={handleExportCSV}
                                                        data-testid="history-payment-link-export-action"
                                                    >
                                                        <Download className="mr-2 h-4 w-4" />
                                                        Export CSV
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
                                                data-testid={isCaptureDraft ? "history-resume-capture-button" : "history-edit-draft-button"}
                                            >
                                                {isCaptureDraft ? (
                                                    <ArrowRight className="mr-1 h-3 w-3" />
                                                ) : priceTBDCount > 0 ? (
                                                    <AlertCircle className="mr-1 h-3 w-3" />
                                                ) : (
                                                    <FileText className="mr-1 h-3 w-3" />
                                                )}
                                                {isCaptureDraft ? "Resume capture" : priceTBDCount > 0 ? "Finish pricing" : "Review draft"}
                                            </Button>
                                        )}

                                        {activeTab === "sent" && estimate.status === "sent" && !estimateIsPaidLike && (
                                            deliveryScopeReviewNeeded ? (
                                                <Button
                                                    variant="default"
                                                    size="sm"
                                                    className="w-full sm:w-auto"
                                                    onClick={() => requestDeliveryScopeReview(estimate, "Review scope assumptions before sharing this estimate.")}
                                                    data-testid="history-review-scope-before-delivery-action"
                                                >
                                                    <AlertCircle className="mr-1 h-3 w-3" />
                                                    Review scope
                                                </Button>
                                            ) : isOpenCustomerChangeRequest(estimate) ? (
                                                <Button
                                                    variant="default"
                                                    size="sm"
                                                    className="w-full sm:w-auto"
                                                    onClick={() => handleStartCustomerRevision(estimate)}
                                                    data-testid="history-customer-revision-action"
                                                >
                                                    <FileText className="mr-1 h-3 w-3" />
                                                    Revise
                                                </Button>
                                            ) : estimate.customerPortalStatus === "viewed" ? (
                                                <Button
                                                    variant="default"
                                                    size="sm"
                                                    className="w-full sm:w-auto"
                                                    onClick={() => void handleOpenFollowUp(estimate)}
                                                    disabled={creatingPortalLinkEstimateId === estimate.id}
                                                    data-testid="history-customer-follow-up-action"
                                                >
                                                    {creatingPortalLinkEstimateId === estimate.id ? (
                                                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                                    ) : (
                                                        <Mail className="mr-1 h-3 w-3" />
                                                    )}
                                                    Follow-up
                                                </Button>
                                            ) : shouldCopyPaymentLinkPrimary ? (
                                                <Button
                                                    variant="default"
                                                    size="sm"
                                                    className="w-full sm:w-auto"
                                                    onClick={() => void handleCopyPaymentLink(effectivePaymentLink)}
                                                    data-testid="history-copy-payment-link-action"
                                                >
                                                    <Copy className="mr-1 h-3 w-3" />
                                                    Copy pay link
                                                </Button>
                                            ) : canCreatePaymentLinkPrimary ? (
                                                <Button
                                                    variant="default"
                                                    size="sm"
                                                    className="w-full sm:w-auto"
                                                    onClick={() => void handleCreateApprovedPaymentLink(estimate)}
                                                    disabled={creatingPaymentLinkEstimateId === estimate.id}
                                                    data-testid="history-create-payment-link-action"
                                                >
                                                    {creatingPaymentLinkEstimateId === estimate.id ? (
                                                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                                    ) : (
                                                        <CreditCard className="mr-1 h-3 w-3" />
                                                    )}
                                                    Create pay link
                                                </Button>
                                            ) : (
                                                <Button
                                                    variant="default"
                                                    size="sm"
                                                    className="w-full sm:w-auto"
                                                    onClick={() => handleMarkAsPaid(estimate.id)}
                                                >
                                                    <CircleDollarSign className="mr-1 h-3 w-3" />
                                                    Mark Paid
                                                </Button>
                                            )
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
                                            {activeTab === "drafts" && draftSendReadiness?.ready ? (
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    className="w-full shrink-0 bg-slate-800 text-slate-100 hover:bg-slate-700 sm:w-auto"
                                                    onClick={() => handleMarkAsSent(estimate.id)}
                                                >
                                                    <Send className="mr-1 h-3 w-3" />
                                                    Mark Sent
                                                </Button>
                                            ) : activeTab === "drafts" ? (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full shrink-0 border-amber-300/25 bg-amber-500/10 text-amber-100 hover:bg-amber-500/15 hover:text-amber-50 sm:w-auto"
                                                    onClick={() => handleEditDraft(estimate)}
                                                    data-testid="history-review-before-sending-action"
                                                >
                                                    <AlertCircle className="mr-1 h-3 w-3" />
                                                    {draftSendReadiness?.actionLabel || "Review draft"}
                                                </Button>
                                            ) : null}

                                            {estimate.status === "sent" && !estimateIsPaidLike && estimate.type !== "invoice" && (
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

                                            {activeTab === "sent" && estimate.status === "sent" && !estimateIsPaidLike && (
                                                isOpenCustomerChangeRequest(estimate)
                                                || estimate.customerPortalStatus === "viewed"
                                                || shouldCopyPaymentLinkPrimary
                                                || canCreatePaymentLinkPrimary
                                            ) ? (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className={historySecondaryButtonClass}
                                                    onClick={() => handleMarkAsPaid(estimate.id)}
                                                >
                                                    <CircleDollarSign className="mr-1 h-3 w-3" />
                                                    Mark Paid
                                                </Button>
                                            ) : null}

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
                                                    {deliveryScopeReviewNeeded && !estimateIsPaidLike ? (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="w-full shrink-0 border-amber-300/25 bg-amber-500/10 text-amber-100 hover:bg-amber-500/15 hover:text-amber-50 sm:w-auto"
                                                            onClick={() => requestDeliveryScopeReview(estimate, "Review scope assumptions before sharing this estimate.")}
                                                            data-testid="history-secondary-review-scope-action"
                                                        >
                                                            <AlertCircle className="mr-1 h-3 w-3" />
                                                            Review scope
                                                        </Button>
                                                    ) : null}
                                                    {!deliveryScopeReviewNeeded && estimate.status !== "draft" && !estimateIsPaidLike ? (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className={historySecondaryButtonClass}
                                                            onClick={() => void handleCreateCustomerPortalLink(estimate)}
                                                            disabled={creatingPortalLinkEstimateId === estimate.id}
                                                            data-testid="history-customer-portal-link-action"
                                                        >
                                                            {creatingPortalLinkEstimateId === estimate.id ? (
                                                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                                            ) : (
                                                                <Link2 className="mr-1 h-3 w-3" />
                                                            )}
                                                            {estimate.customerPortalUrl ? "Copy approval link" : "Customer link"}
                                                        </Button>
                                                    ) : null}
                                                    {!deliveryScopeReviewNeeded && shouldShowFollowUpAction && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className={historySecondaryButtonClass}
                                                            onClick={() => void handleOpenFollowUp(estimate)}
                                                            disabled={creatingPortalLinkEstimateId === estimate.id}
                                                            data-testid="history-secondary-follow-up-action"
                                                        >
                                                            {creatingPortalLinkEstimateId === estimate.id ? (
                                                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                                            ) : (
                                                                <Mail className="mr-1 h-3 w-3" />
                                                            )}
                                                            Follow-up
                                                        </Button>
                                                    )}
                                                    {!deliveryScopeReviewNeeded && !estimateIsPaidLike && (
                                                        <Button
                                                            variant="secondary"
                                                            size="sm"
                                                            className="w-full shrink-0 bg-slate-800 text-slate-100 hover:bg-slate-700 sm:w-auto"
                                                            onClick={() => handleOpenSms(estimate)}
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
                        approvalLink={followUpEstimate.customerPortalUrl}
                        customerPortalStatus={followUpEstimate.customerPortalStatus}
                        customerViewedAt={followUpEstimate.customerViewedAt}
                        lastFollowedUpAt={followUpEstimate.lastFollowedUpAt}
                        lastFollowUpChannel={followUpEstimate.lastFollowUpChannel}
                        onSent={() => handleFollowUpEmailSent(followUpEstimate)}
                    />
                )
            }
            {
                smsEstimate && (
                    <SmsModal
                        open={!!smsEstimate}
                        onClose={() => setSmsEstimate(null)}
                        clientPhone={smsEstimate.clientPhone}
                        estimateTotal={smsEstimate.totalAmount}
                        paymentLink={smsEstimate.paymentLink || businessProfile?.payment_link || null}
                        businessName={businessProfile?.business_name}
                        approvalLink={smsEstimate.customerPortalUrl}
                        customerPortalStatus={smsEstimate.customerPortalStatus}
                        approvalLinkStatus={canSendCustomerFollowUp(smsEstimate) ? "included" : "signin"}
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
