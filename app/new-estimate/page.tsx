"use client"

import { Suspense, useState, useRef, useEffect, useCallback, useMemo } from "react"
import { AlertTriangle, ArrowRight, Camera, CheckCircle2, ClipboardList, CreditCard, Download, Eye, FileText, Link as LinkIcon, Loader2, LogIn, Mail, MapPin, MessageSquare, Mic, PenTool, Phone, Save, Share2, SlidersHorizontal, Sparkles, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { FreeTierQuotaBanner } from "@/components/free-tier-quota-banner"
import { ClientLoadDialog } from "@/components/new-estimate/client-load-dialog"
import { EstimateLineItemsEditor } from "@/components/new-estimate/estimate-line-items-editor"
import {
    DemoTutorialBanner,
    PhotoEstimateAnalysisCard,
    UpsellOptionsCard,
} from "@/components/new-estimate/result-assist-panels"
import { TeamEstimateStatusCard } from "@/components/new-estimate/team-estimate-status-card"
import Image from "next/image"
import NextLink from "next/link"
import dynamic from "next/dynamic"
import { useRouter, useSearchParams } from "next/navigation"
import { saveEstimate, generateEstimateNumber, getProfile, saveProfile, getEstimates, updateEstimate } from "@/lib/estimates-storage"
import { savePendingAudio, getUnprocessedAudio, deletePendingAudio, getPriceListForAI, getClients, type Client } from "@/lib/db"
import type { BusinessInfo, EstimateItem, EstimateSection } from "@/lib/estimates-storage"
import { normalizeCategory, normalizeEstimateItem, normalizeEstimatePayload, normalizeUnit, type EstimateDraft } from "@/lib/estimates/normalize"
import { getAllItemsFromEstimate, lineTotal } from "@/lib/estimates/math"
import { dismissToasts, toast } from "@/components/toast"
import { trackAnalyticsEvent } from "@/lib/analytics"
import { withAuthHeaders } from "@/lib/auth-headers"
import {
    getBillingSubscriptionStatus,
    getBillingUsageSnapshot,
    type BillingSubscriptionStatusResponse,
    type BillingUsageSnapshot,
} from "@/lib/pricing"
import { hasPdfBrandingAccess, hasPdfTemplateAccess } from "@/lib/pdf-branding"
import { copyReferralShareUrl, getReferralShareUrl } from "@/lib/referrals"
import { createDemoEstimateDraft, DUPLICATE_ESTIMATE_KEY } from "@/lib/demo-estimate"
import { sendEstimateSms } from "@/lib/send-sms"
import {
    buildPaymentLinkIssue,
    PaymentLinkCreationError,
    readPaymentLinkErrorPayload,
    type PaymentLinkIssue,
} from "@/lib/payment-link-errors"
import { consumeClientEstimatePrefill } from "@/lib/client-estimate-prefill"
import { consumeReceiptEstimatePrefill, formatReceiptEstimateNotes } from "@/lib/receipt-estimate-prefill"
import { consumeTimeEntryEstimatePrefill, formatTimeEntryEstimateNotes } from "@/lib/time-entry-estimate-prefill"
import {
    getTeamEstimateDetail,
    getTeamEstimateSession,
    mutateTeamEstimateSession,
    updateTeamEstimate,
    type TeamEstimateDetailResponse,
    type TeamEstimateSessionResponse,
} from "@/lib/team"
import { buildEstimatePdfFileName, downloadBlobAsFile } from "@/lib/estimate-pdf-file"
const PaymentOptionModal = dynamic(() => import("@/components/payment-option-modal").then(mod => mod.PaymentOptionModal), { ssr: false })
import { AudioRecorder } from "@/components/audio-recorder"
const PDFPreviewModal = dynamic(() => import("@/components/pdf-preview-modal").then(mod => mod.PDFPreviewModal), { ssr: false })
const EmailModal = dynamic(() => import("@/components/email-modal").then(mod => mod.EmailModal), { ssr: false })
const SmsModal = dynamic(() => import("@/components/sms-modal").then(mod => mod.SmsModal), { ssr: false })
const ExcelImportModal = dynamic(() => import("@/components/excel-import-modal").then(mod => mod.ExcelImportModal), { ssr: false })
const ReceiptScanner = dynamic(() => import("@/components/receipt-scanner").then(mod => mod.ReceiptScanner), { ssr: false })
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
const SignaturePad = dynamic(() => import("@/components/signature-pad").then(mod => mod.SignaturePad), { ssr: false })
import { cn } from "@/lib/utils"

type Estimate = EstimateDraft

type ReceiptScanResult = {
    items: Array<{
        id?: string
        description?: string
        quantity?: number
        unit_price?: number
        total?: number
        confidence_score?: number
    }>
    warnings: string[]
}

type Step = "input" | "transcribing" | "verifying" | "generating" | "result"
type SourceLanguage = "auto" | "en" | "es" | "ko"
type GenerateWorkflow = "standard" | "photo_estimate"
type CaptureIntent = "voice" | "photos" | "type"

const SOURCE_LANGUAGE_OPTIONS: Array<{ value: SourceLanguage; label: string; hint: string }> = [
    { value: "auto", label: "Auto", hint: "Detect mixed site language" },
    { value: "es", label: "Spanish Beta", hint: "Best for Spanish field notes" },
    { value: "ko", label: "Korean", hint: "Translate Korean job notes" },
    { value: "en", label: "English", hint: "Clean up English shorthand" },
]
const SOURCE_LANGUAGE_EXAMPLES: Record<SourceLanguage, string> = {
    auto: "\"Cambio la llave angular under the sink, check leak around the P-trap, then test water pressure.\"",
    es: "\"Cambio la llave angular debajo del lavamanos, arreglo la fuga en el desague y reviso la presion del agua.\"",
    ko: "\"싱크대 아래 앵글밸브 교체하고 배수 누수 잡고 수압 테스트합니다.\"",
    en: "\"Replace the angle stop under the sink, fix the drain leak, and pressure-test the line.\"",
}
const PHOTO_ESTIMATE_PRO_TIERS = new Set(["pro", "team"])
const CAPTURE_INTENT_COPY: Record<CaptureIntent, { eyebrow: string; title: string; description: string; status: string }> = {
    voice: {
        eyebrow: "Voice scope",
        title: "Record it while you are still on site.",
        description: "Start with a spoken scope, then add notes or photos before SnapQuote drafts the customer-ready estimate.",
        status: "Voice-first capture",
    },
    photos: {
        eyebrow: "Photo scope",
        title: "Attach jobsite photos before the details fade.",
        description: "Start with site shots, then add a short note so SnapQuote has the visible conditions and the trade context.",
        status: "Photo-first capture",
    },
    type: {
        eyebrow: "Typed scope",
        title: "Type the rough scope.",
        description: "Start with shorthand, customer requests, or materials. SnapQuote turns it into a professional draft.",
        status: "Typed notes capture",
    },
}

function isShareCanceledError(error: unknown) {
    return Boolean(
        error
        && typeof error === "object"
        && "name" in error
        && (error as { name?: unknown }).name === "AbortError"
    )
}

function scrollElementIntoBottomSafeView(
    element: Element | null,
    options: { behavior?: ScrollBehavior; block?: "start" | "center"; topInset?: number } = {}
) {
    if (!(element instanceof HTMLElement)) return

    const behavior = options.behavior ?? "smooth"
    const block = options.block ?? "start"
    const topInset = options.topInset ?? 16
    const bottomGap = 12
    const bottomNav = document.querySelector<HTMLElement>('[data-testid="bottom-navigation"]')
    const bottomNavTop = bottomNav?.getBoundingClientRect().top ?? window.innerHeight
    const targetBox = element.getBoundingClientRect()
    const availableHeight = Math.max(0, bottomNavTop - topInset - bottomGap)
    const targetTop = targetBox.top + window.scrollY
    const shouldCenter = block === "center" && targetBox.height < availableHeight
    const top = shouldCenter
        ? targetTop - topInset - (availableHeight - targetBox.height) / 2
        : targetTop - topInset

    window.scrollTo({
        top: Math.max(0, top),
        behavior,
    })
}

function parseCaptureIntent(value: string | null): CaptureIntent | null {
    if (value === "voice" || value === "photos" || value === "type") return value
    return null
}

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error) return error.message || fallback
    if (error && typeof error === "object" && "message" in error) {
        const message = (error as { message?: unknown }).message
        if (typeof message === "string" && message.trim()) return message
    }
    return fallback
}

function updateEstimateItemField(
    item: EstimateItem,
    field: keyof EstimateItem,
    value: string | number | boolean
): EstimateItem {
    if (field === "description") return { ...item, description: String(value) }
    if (field === "notes") return { ...item, notes: String(value) }
    if (field === "id") return { ...item, id: String(value) }
    if (field === "category") return { ...item, category: normalizeCategory(value) }
    if (field === "unit") return { ...item, unit: normalizeUnit(value) }
    if (field === "is_value_add") return { ...item, is_value_add: Boolean(value) }

    const numericValue = Number(value)
    if (field === "itemNumber") return { ...item, itemNumber: numericValue }
    if (field === "quantity") {
        const nextItem = { ...item, quantity: numericValue }
        return { ...nextItem, total: nextItem.quantity * nextItem.unit_price }
    }
    if (field === "unit_price") {
        const nextItem = { ...item, unit_price: numericValue }
        return { ...nextItem, total: nextItem.quantity * nextItem.unit_price }
    }
    if (field === "total") return { ...item, total: numericValue }

    return item
}

function NewEstimatePageContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [step, setStep] = useState<Step>("input")

    // Data States
    const [images, setImages] = useState<File[]>([])
    const [previewUrls, setPreviewUrls] = useState<string[]>([])
    const [transcribedText, setTranscribedText] = useState("")
    const [, setAudioBlob] = useState<Blob | null>(null)
    const [estimate, setEstimate] = useState<Estimate | null>(null)

    // Client Load State
    const [isClientModalOpen, setIsClientModalOpen] = useState(false)
    const [availableClients, setAvailableClients] = useState<Client[]>([])

    // Signature State
    const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false)

    // UI States
    const [isSaving, setIsSaving] = useState(false)
    const [isSharing, setIsSharing] = useState(false)
    const [isPreparingAuthRedirect, setIsPreparingAuthRedirect] = useState<"payment-link" | "referral-invite" | null>(null)
    const [authenticatedResumeIntent, setAuthenticatedResumeIntent] = useState<{
        intent: "payment-link" | "referral-invite"
        expectsDraft: boolean
    } | null>(null)
    const [taxRate, setTaxRate] = useState(13)
    const [clientName, setClientName] = useState("")
    const [clientAddress, setClientAddress] = useState("")
    const [clientEmail, setClientEmail] = useState("")
    const [clientPhone, setClientPhone] = useState("")
    const [clientNotes, setClientNotes] = useState("")
    const [isClientContactEditorOpen, setIsClientContactEditorOpen] = useState(false)
    const [isInputClientDetailsOpen, setIsInputClientDetailsOpen] = useState(false)
    const [isResultContactEditorOpen, setIsResultContactEditorOpen] = useState(false)
    const [isResultClientDetailsOpen, setIsResultClientDetailsOpen] = useState(false)
    const [businessProfile, setBusinessProfile] = useState<BusinessInfo | undefined>(undefined)
    const [isPreviewOpen, setIsPreviewOpen] = useState(false)
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false)
    const [isSmsModalOpen, setIsSmsModalOpen] = useState(false)
    const [isExcelModalOpen, setIsExcelModalOpen] = useState(false)
    const [isOffline, setIsOffline] = useState(false)
    const [pendingAudioId, setPendingAudioId] = useState<string | null>(null)
    const [projectType, setProjectType] = useState<'residential' | 'commercial'>('residential')
    const [sourceLanguage, setSourceLanguage] = useState<SourceLanguage>("auto")
    const [generateWorkflow, setGenerateWorkflow] = useState<GenerateWorkflow>("standard")
    const [photoContext, setPhotoContext] = useState("")
    const [paymentLink, setPaymentLink] = useState<string | null>(null)
    const [paymentLinkId, setPaymentLinkId] = useState<string | null>(null)
    const [paymentLinkType, setPaymentLinkType] = useState<'full' | 'deposit' | 'custom' | null>('full')
    const [isGeneratingPaymentLink, setIsGeneratingPaymentLink] = useState(false)
    const [includePaymentLink, setIncludePaymentLink] = useState(false)
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
    const [paymentLinkIssue, setPaymentLinkIssue] = useState<PaymentLinkIssue | null>(null)
    const [isCopyingReferral, setIsCopyingReferral] = useState(false)
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false)
    const [isReceiptScannerOpen, setIsReceiptScannerOpen] = useState(false)
    const [captureIntent, setCaptureIntent] = useState<CaptureIntent | null>(() => {
        const manualMode = searchParams.get("mode") === "manual"
        return manualMode ? "type" : parseCaptureIntent(searchParams.get("capture"))
    })
    const [showDemoTutorial, setShowDemoTutorial] = useState(false)
    const [billingUsageSnapshot, setBillingUsageSnapshot] = useState<BillingUsageSnapshot | null>(null)
    const [subscription, setSubscription] = useState<BillingSubscriptionStatusResponse | null>(null)
    const [teamEstimateContext, setTeamEstimateContext] = useState<TeamEstimateDetailResponse["estimate"] | null>(null)
    const [teamEstimateSession, setTeamEstimateSession] = useState<TeamEstimateSessionResponse["session"] | null>(null)
    const [teamEstimateLoading, setTeamEstimateLoading] = useState(false)
    const [teamSessionMutating, setTeamSessionMutating] = useState(false)

    const fileInputRef = useRef<HTMLInputElement>(null)
    const notesTextareaRef = useRef<HTMLTextAreaElement>(null)
    const draftMetaRef = useRef<{ id: string; estimateNumber: string; createdAt?: string } | null>(null)
    const handledPaymentIntentRef = useRef(false)
    const handledReferralIntentRef = useRef(false)
    const suppressPostAuthDraftToastRef = useRef(false)
    const handledClientPrefillRef = useRef(false)
    const handledReceiptPrefillRef = useRef(false)
    const handledTimeEntryPrefillRef = useRef(false)
    const resultQuickActionsRef = useRef<HTMLDivElement>(null)
    const resultClientCardRef = useRef<HTMLDivElement>(null)
    const resultClientNameInputRef = useRef<HTMLInputElement>(null)
    const resultClientEmailInputRef = useRef<HTMLInputElement>(null)
    const hasPhotoEstimateAccess = subscription ? PHOTO_ESTIMATE_PRO_TIERS.has(subscription.planTier) : false
    const activeCaptureIntent = captureIntent ?? "voice"
    const captureCopy = CAPTURE_INTENT_COPY[activeCaptureIntent]
    const canGenerateEstimate = Boolean(transcribedText.trim() || images.length > 0)
    const trimmedClientName = clientName.trim()
    const trimmedClientNotes = clientNotes.trim()
    const trimmedClientEmail = clientEmail.trim()
    const trimmedClientPhone = clientPhone.trim()
    const hasClientContext = Boolean(trimmedClientName)
    const hasEmailDeliveryContact = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedClientEmail)
    const hasSmsDeliveryContact = /^\+[1-9]\d{7,14}$/.test(trimmedClientPhone)
    const hasDeliveryContact = hasEmailDeliveryContact || hasSmsDeliveryContact
    const hasAnyDeliveryContactValue = Boolean(trimmedClientEmail || trimmedClientPhone)
    const hasInvalidDeliveryContactValue = Boolean(
        (trimmedClientEmail && !hasEmailDeliveryContact) || (trimmedClientPhone && !hasSmsDeliveryContact)
    )
    const scopeReadinessLabel = canGenerateEstimate
        ? "Scope ready"
        : activeCaptureIntent === "photos"
            ? "Add photos or notes"
            : activeCaptureIntent === "type"
                ? "Add rough scope"
                : "Record or type scope"
    const clientReadinessLabel = hasClientContext ? trimmedClientName : "Client later"
    const deliveryReadinessLabel = hasDeliveryContact ? "Delivery ready" : "Before sending"
    const shouldShowClientContactFields = hasClientContext && (!hasDeliveryContact || hasInvalidDeliveryContactValue || isClientContactEditorOpen)
    const shouldShowInputClientDetailsFields = isInputClientDetailsOpen
    const shouldShowResultDeliveryContactFields = !hasDeliveryContact || hasInvalidDeliveryContactValue || isResultContactEditorOpen
    const generateCtaLabel = hasClientContext ? `Generate for ${trimmedClientName}` : "Generate Estimate"
    const shouldShowInlineClientGenerate = hasClientContext && canGenerateEstimate && generateWorkflow === "standard"
    const clientInputContextCard = hasClientContext ? (
        <div
            className={cn(
                "rounded-lg border p-3",
                hasDeliveryContact
                    ? "border-emerald-300/25 bg-emerald-400/10"
                    : "border-amber-300/25 bg-amber-400/10"
            )}
            data-testid="input-client-context-card"
        >
            <div className="flex items-start gap-3">
                <div
                    className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                        hasDeliveryContact
                            ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
                            : "border-amber-300/30 bg-amber-400/10 text-amber-100"
                    )}
                >
                    <Users className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 truncate text-sm font-semibold text-white">
                            {trimmedClientName}
                        </p>
                        <span
                            className={cn(
                                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                hasDeliveryContact
                                    ? "bg-emerald-300/15 text-emerald-100"
                                    : "bg-amber-300/15 text-amber-100"
                            )}
                        >
                            {hasDeliveryContact ? "Delivery ready" : "Needs contact"}
                        </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-300">
                        {canGenerateEstimate ? "Scope is ready. Generate the customer draft next." : "Add rough scope next, then generate the customer draft."}
                    </p>
                    {shouldShowInlineClientGenerate ? (
                        <Button
                            type="button"
                            size="sm"
                            className="mt-3 h-10 w-full min-w-0 justify-between overflow-hidden rounded-lg px-3 text-sm font-semibold sm:w-auto sm:max-w-full"
                            onClick={handleGenerateEstimate}
                            data-testid="input-client-generate-button"
                        >
                            <span className="min-w-0 truncate">{generateCtaLabel}</span>
                            <ArrowRight className="ml-1.5 h-4 w-4 shrink-0" />
                        </Button>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold text-slate-300">
                        {clientAddress.trim() ? (
                            <span className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1">
                                <MapPin className="h-3 w-3 text-blue-200" />
                                Address ready
                            </span>
                        ) : null}
                        {trimmedClientEmail ? (
                            <span className={cn(
                                "inline-flex items-center gap-1 rounded-lg border px-2 py-1",
                                hasEmailDeliveryContact
                                    ? "border-white/10 bg-slate-950/60"
                                    : "border-amber-300/20 bg-amber-400/10 text-amber-100"
                            )}>
                                <Mail className={cn("h-3 w-3", hasEmailDeliveryContact ? "text-blue-200" : "text-amber-200")} />
                                {hasEmailDeliveryContact ? "Email ready" : "Check email"}
                            </span>
                        ) : null}
                        {trimmedClientPhone ? (
                            <span className={cn(
                                "inline-flex items-center gap-1 rounded-lg border px-2 py-1",
                                hasSmsDeliveryContact
                                    ? "border-white/10 bg-slate-950/60"
                                    : "border-amber-300/20 bg-amber-400/10 text-amber-100"
                            )}>
                                <Phone className={cn("h-3 w-3", hasSmsDeliveryContact ? "text-blue-200" : "text-amber-200")} />
                                {hasSmsDeliveryContact ? "SMS ready" : "Check phone"}
                            </span>
                        ) : null}
                        {hasDeliveryContact && !hasInvalidDeliveryContactValue && !isClientContactEditorOpen ? (
                            <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded-lg border border-blue-300/20 bg-blue-400/10 px-2 py-1 text-blue-100 transition hover:border-blue-200/35 hover:bg-blue-400/15"
                                onClick={() => setIsClientContactEditorOpen(true)}
                                data-testid="input-client-edit-contact-button"
                            >
                                <Mail className="h-3 w-3" />
                                Edit contact
                            </button>
                        ) : null}
                        {!hasDeliveryContact ? (
                            <span className="inline-flex items-center gap-1 rounded-lg border border-amber-300/20 bg-slate-950/60 px-2 py-1 text-amber-100">
                                <AlertTriangle className="h-3 w-3" />
                                {hasAnyDeliveryContactValue ? "Fix email or phone before sending" : "Add email or phone before sending"}
                            </span>
                        ) : null}
                    </div>
                    {shouldShowClientContactFields ? (
                        <div
                            className="mt-2 rounded-lg border border-white/10 bg-slate-950/55 p-2"
                            aria-label="Delivery contact"
                            data-testid="input-client-delivery-contact-fields"
                        >
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <Input
                                    type="email"
                                    value={clientEmail}
                                    onChange={(event) => {
                                        setIsClientContactEditorOpen(true)
                                        setClientEmail(event.target.value)
                                    }}
                                    placeholder="Email for PDF"
                                    aria-label="Client delivery email"
                                    className="h-11 min-w-0 rounded-lg border-white/10 bg-slate-950/75 text-sm text-white placeholder:text-slate-500"
                                    data-testid="input-client-email-input"
                                />
                                <Input
                                    type="tel"
                                    value={clientPhone}
                                    onChange={(event) => {
                                        setIsClientContactEditorOpen(true)
                                        setClientPhone(event.target.value)
                                    }}
                                    placeholder="SMS phone"
                                    aria-label="Client SMS phone"
                                    className="h-11 min-w-0 rounded-lg border-white/10 bg-slate-950/75 text-sm text-white placeholder:text-slate-500"
                                    data-testid="input-client-phone-input"
                                />
                            </div>
                        </div>
                    ) : null}
                    {trimmedClientNotes ? (
                        <div
                            className={cn(
                                "mt-2 rounded-lg border border-white/10 bg-slate-950/55 text-[11px] leading-4 text-slate-300",
                                isClientContactEditorOpen ? "px-2.5 py-0.5" : "px-2.5 py-1.5"
                            )}
                            aria-label={`Site note: ${trimmedClientNotes}`}
                            data-testid="input-client-site-notes"
                        >
                            {isClientContactEditorOpen ? (
                                <p className="truncate">
                                    <span className="font-semibold text-slate-500">Site:</span> {trimmedClientNotes}
                                </p>
                            ) : (
                                <>
                                    <p className="mb-0.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                        <ClipboardList className="h-3 w-3" />
                                        Site note
                                    </p>
                                    <p className="overflow-hidden break-words [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                                        {trimmedClientNotes}
                                    </p>
                                </>
                            )}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    ) : null
    const isTeamEstimateMode = Boolean(teamEstimateContext)
    const canEditTeamEstimate = !isTeamEstimateMode || Boolean(teamEstimateSession?.canEdit)
    const activeTeamEditorLabel = teamEstimateSession?.editor?.businessName
        || teamEstimateSession?.editor?.email
        || teamEstimateSession?.editor?.userId
        || "another teammate"
    const pdfBusinessProfile = useMemo(() => {
        if (!businessProfile) return undefined

        return {
            ...businessProfile,
            logo_url: hasPdfBrandingAccess(subscription?.planTier) ? businessProfile.logo_url : "",
            estimate_template_url: hasPdfTemplateAccess(subscription?.planTier) ? businessProfile.estimate_template_url : "",
        }
    }, [businessProfile, subscription?.planTier])

    const getOrCreateDraftMeta = useCallback(() => {
        if (!draftMetaRef.current) {
            draftMetaRef.current = {
                id: crypto.randomUUID(),
                estimateNumber: generateEstimateNumber(),
            }
        }
        return draftMetaRef.current
    }, [])

    const resetDraftMeta = useCallback(() => {
        draftMetaRef.current = null
    }, [])

    const resetPaymentLinkState = useCallback(() => {
        setIncludePaymentLink(false)
        setPaymentLink(null)
        setPaymentLinkId(null)
        setPaymentLinkType(null)
        setPaymentLinkIssue(null)
    }, [])

    const replaceComposerUrl = useCallback((url: string) => {
        if (typeof window === "undefined") return
        window.history.replaceState(null, "", url)
    }, [])

    const removeIntentFromComposerUrl = useCallback(() => {
        if (typeof window === "undefined") return

        const nextUrl = new URL(window.location.href)
        nextUrl.searchParams.delete("intent")
        replaceComposerUrl(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`)
    }, [replaceComposerUrl])

    const updateCaptureIntent = useCallback((intent: CaptureIntent) => {
        setCaptureIntent(intent)
        replaceComposerUrl(`/new-estimate?capture=${intent}`)
    }, [replaceComposerUrl])

    const openManualEntry = useCallback(() => {
        setCaptureIntent("type")
        setStep("verifying")
        replaceComposerUrl("/new-estimate?mode=manual")
    }, [replaceComposerUrl])

    const redirectToLoginForTeamEstimate = useCallback((estimateId: string) => {
        const params = new URLSearchParams({
            next: `/new-estimate?teamEstimateId=${estimateId}`,
            intent: "team-edit",
        })
        router.push(`/login?${params.toString()}`)
    }, [router])

    const loadDraftIntoComposer = useCallback((draft: Record<string, any>, options?: { tutorial?: boolean; toastMessage?: string; preserveDraftMeta?: boolean }) => {
        const draftId = typeof draft.id === "string" ? draft.id : ""
        const estimateNumber = typeof draft.estimateNumber === "string" ? draft.estimateNumber : ""
        if (options?.preserveDraftMeta && draftId && estimateNumber) {
            draftMetaRef.current = {
                id: draftId,
                estimateNumber,
                createdAt: typeof draft.createdAt === "string" ? draft.createdAt : undefined,
            }
        } else {
            resetDraftMeta()
        }
        resetPaymentLinkState()
        setEstimate(normalizeEstimatePayload(draft))
        setClientName(draft.clientName || "")
        setClientAddress(draft.clientAddress || "")
        setClientEmail(typeof draft.clientEmail === "string" ? draft.clientEmail : "")
        setClientPhone(typeof draft.clientPhone === "string" ? draft.clientPhone : "")
        setClientNotes(typeof draft.clientNotes === "string" ? draft.clientNotes : "")
        setIsClientContactEditorOpen(false)
        setIsInputClientDetailsOpen(false)
        setIsResultContactEditorOpen(false)
        setIsResultClientDetailsOpen(false)
        setTaxRate(typeof draft.taxRate === "number" ? draft.taxRate : 13)
        if (typeof draft.paymentLink === "string" && draft.paymentLink.trim()) {
            setIncludePaymentLink(true)
            setPaymentLink(draft.paymentLink)
            setPaymentLinkId(typeof draft.paymentLinkId === "string" ? draft.paymentLinkId : null)
            setPaymentLinkType(
                draft.paymentLinkType === "deposit" || draft.paymentLinkType === "custom" || draft.paymentLinkType === "full"
                    ? draft.paymentLinkType
                    : "full"
            )
        }
        setAudioBlob(null)
        setImages([])
        setPreviewUrls([])
        setTranscribedText("")
        setGenerateWorkflow("standard")
        setPhotoContext("")
        setStep("result")
        setShowDemoTutorial(Boolean(options?.tutorial))

        if (options?.toastMessage) {
            toast(options.toastMessage, "success")
        }
    }, [resetDraftMeta, resetPaymentLinkState])

    const applyTeamEstimateToComposer = useCallback((detail: TeamEstimateDetailResponse["estimate"]) => {
        draftMetaRef.current = {
            id: detail.estimateId,
            estimateNumber: detail.estimateNumber,
        }
        resetPaymentLinkState()
        setTeamEstimateContext(detail)
        setEstimate({
            items: detail.items as EstimateItem[],
            ...(detail.sections && detail.sections.length > 0 ? { sections: detail.sections as EstimateSection[] } : {}),
            summary_note: detail.summary_note,
            status: detail.status,
        })
        setClientName(detail.clientName)
        setClientAddress(detail.clientAddress)
        setClientEmail(detail.clientEmail || "")
        setClientPhone(detail.clientPhone || "")
        setClientNotes(detail.clientNotes || "")
        setIsClientContactEditorOpen(false)
        setIsInputClientDetailsOpen(false)
        setIsResultContactEditorOpen(false)
        setIsResultClientDetailsOpen(false)
        setTaxRate(detail.taxRate)
        setAudioBlob(null)
        setImages([])
        setPreviewUrls([])
        setTranscribedText("")
        setGenerateWorkflow("standard")
        setPhotoContext("")
        setShowDemoTutorial(false)
        setStep("result")
    }, [resetPaymentLinkState])

    const refreshTeamEstimateSession = useCallback(async (estimateId: string) => {
        const session = await getTeamEstimateSession(estimateId)
        setTeamEstimateSession(session.session)
        return session.session
    }, [])

    const loadTeamEstimate = useCallback(async (estimateId: string) => {
        setTeamEstimateLoading(true)
        try {
            const detail = await getTeamEstimateDetail(estimateId)
            applyTeamEstimateToComposer(detail.estimate)
            const session = await refreshTeamEstimateSession(estimateId)
            if (!session.active) {
                toast("Team estimate loaded. Claim editing when you're ready to make changes.", "info")
            }
        } catch (error: unknown) {
            const errorMessage = getErrorMessage(error, "Failed to open Team estimate.")
            if (errorMessage.toLowerCase().includes("log in required")) {
                redirectToLoginForTeamEstimate(estimateId)
                return
            }
            toast(errorMessage, "error")
        } finally {
            setTeamEstimateLoading(false)
        }
    }, [applyTeamEstimateToComposer, redirectToLoginForTeamEstimate, refreshTeamEstimateSession])

    const handleTeamSessionAction = useCallback(async (action: "claim" | "heartbeat" | "release" | "takeover") => {
        if (!teamEstimateContext) return
        setTeamSessionMutating(true)
        try {
            const result = await mutateTeamEstimateSession(teamEstimateContext.estimateId, action)
            setTeamEstimateSession(result.session)

            if (action === "claim") {
                toast("You now hold the Team editing session.", "success")
            } else if (action === "takeover") {
                toast("Team editing session taken over.", "warning")
            } else if (action === "release") {
                toast("Team editing session released.", "info")
            }
        } catch (error: unknown) {
            toast(getErrorMessage(error, "Failed to update Team editing session."), "error")
        } finally {
            setTeamSessionMutating(false)
        }
    }, [teamEstimateContext])

    const handleExitDemoTutorial = useCallback(() => {
        resetDraftMeta()
        resetPaymentLinkState()
        setEstimate(null)
        setClientName("")
        setClientAddress("")
        setClientEmail("")
        setClientPhone("")
        setClientNotes("")
        setIsClientContactEditorOpen(false)
        setIsInputClientDetailsOpen(false)
        setIsResultContactEditorOpen(false)
        setIsResultClientDetailsOpen(false)
        setImages([])
        setPreviewUrls([])
        setTranscribedText("")
        setAudioBlob(null)
        setShowDemoTutorial(false)
        setStep("input")
        setTaxRate(businessProfile?.tax_rate || 13)
        replaceComposerUrl("/new-estimate")
    }, [businessProfile?.tax_rate, replaceComposerUrl, resetDraftMeta, resetPaymentLinkState])

    const handleDismissDemoTutorial = useCallback(() => {
        setShowDemoTutorial(false)
        replaceComposerUrl("/new-estimate")
    }, [replaceComposerUrl])

    const fileToDataUrl = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.readAsDataURL(file)
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = (error) => reject(error)
        })
    }

    // Load business profile and check for duplicate data
    useEffect(() => {
        const tutorialMode = searchParams.get("tutorial") === "1"
        const manualMode = searchParams.get("mode") === "manual"
        const requestedCaptureIntent = parseCaptureIntent(searchParams.get("capture"))
        const draftId = searchParams.get("draftId")?.trim() || ""
        const postAuthIntent = searchParams.get("intent")?.trim() || ""
        const shouldSuppressDraftToast = Boolean(postAuthIntent) || suppressPostAuthDraftToastRef.current
        if (postAuthIntent) {
            suppressPostAuthDraftToastRef.current = true
        }
        const teamEstimateId = searchParams.get("teamEstimateId")?.trim() || ""
        const hasClientPrefill = searchParams.get("client") === "1"
        const hasReceiptPrefill = searchParams.get("receipt") === "1"
        const hasTimeEntryPrefill = searchParams.get("time") === "1"
        setShowDemoTutorial(tutorialMode)
        setCaptureIntent(manualMode ? "type" : requestedCaptureIntent)

        const profile = getProfile()
        if (profile) {
            setBusinessProfile(profile)
            if (profile.tax_rate) setTaxRate(profile.tax_rate)
        }

        // Check for duplicate estimate from history page
        const duplicateData = localStorage.getItem(DUPLICATE_ESTIMATE_KEY)
        if (duplicateData) {
            try {
                const data = JSON.parse(duplicateData)
                loadDraftIntoComposer(data, {
                    tutorial: tutorialMode,
                    toastMessage: tutorialMode ? undefined : "Estimate duplicated! Edit and save.",
                })
                localStorage.removeItem(DUPLICATE_ESTIMATE_KEY)
            } catch (e) {
                console.error('Failed to load duplicate data:', e)
                localStorage.removeItem(DUPLICATE_ESTIMATE_KEY)
            }
            return
        }

        if (tutorialMode) {
            loadDraftIntoComposer(createDemoEstimateDraft(), {
                tutorial: true,
            })
            return
        }

        if (draftId) {
            void getEstimates().then((savedEstimates) => {
                const savedDraft = savedEstimates.find((savedEstimate) => savedEstimate.id === draftId)
                if (!savedDraft) {
                    suppressPostAuthDraftToastRef.current = false
                    toast("Saved draft was not found on this device.", "error")
                    replaceComposerUrl("/new-estimate")
                    return
                }

                loadDraftIntoComposer(savedDraft, {
                    preserveDraftMeta: true,
                    toastMessage: shouldSuppressDraftToast ? undefined : "Draft loaded. Edits will update the saved estimate.",
                })
                suppressPostAuthDraftToastRef.current = false
            })
            return
        }

        if (hasClientPrefill) {
            if (!handledClientPrefillRef.current) {
                handledClientPrefillRef.current = true
                const prefill = consumeClientEstimatePrefill()

                if (prefill) {
                    setClientName(prefill.name)
                    setClientAddress(prefill.address || "")
                    setClientEmail(prefill.email || "")
                    setClientPhone(prefill.phone || "")
                    setClientNotes(prefill.notes || "")
                    setIsClientContactEditorOpen(false)
                    setIsInputClientDetailsOpen(false)
                    setIsResultContactEditorOpen(false)
                    setIsResultClientDetailsOpen(false)
                } else {
                    toast("Client details were not available. You can still start a quote.", "warning")
                }

                replaceComposerUrl("/new-estimate?capture=type")
            }

            return
        }

        if (hasReceiptPrefill) {
            if (!handledReceiptPrefillRef.current) {
                handledReceiptPrefillRef.current = true
                const prefill = consumeReceiptEstimatePrefill()

                if (prefill) {
                    setTranscribedText(formatReceiptEstimateNotes(prefill))
                    toast("Receipt loaded. Add job context before generating.", "success")
                } else {
                    toast("Receipt details were not available. You can still start a quote.", "warning")
                }

                replaceComposerUrl("/new-estimate?capture=type")
            }

            return
        }

        if (hasTimeEntryPrefill) {
            if (!handledTimeEntryPrefillRef.current) {
                handledTimeEntryPrefillRef.current = true
                const prefill = consumeTimeEntryEstimatePrefill()

                if (prefill) {
                    setTranscribedText(formatTimeEntryEstimateNotes(prefill))
                    toast("Time entry loaded. Add materials or scope before generating.", "success")
                } else {
                    toast("Time entry details were not available. You can still start a quote.", "warning")
                }

                replaceComposerUrl("/new-estimate?capture=type")
            }

            return
        }

        if (manualMode) {
            setStep("verifying")
            return
        }

        if (teamEstimateId) {
            void loadTeamEstimate(teamEstimateId)
        }
    }, [loadDraftIntoComposer, loadTeamEstimate, replaceComposerUrl, searchParams])

    useEffect(() => {
        if (step !== "input" || activeCaptureIntent !== "type") return

        const focusTimer = window.setTimeout(() => {
            notesTextareaRef.current?.focus()
        }, 0)

        return () => window.clearTimeout(focusTimer)
    }, [activeCaptureIntent, step])

    const handleLoadDemoQuote = useCallback(() => {
        loadDraftIntoComposer(createDemoEstimateDraft(), {
            tutorial: true,
        })
        replaceComposerUrl("/new-estimate?tutorial=1")
    }, [loadDraftIntoComposer, replaceComposerUrl])

    const openClientLoadDialog = useCallback(async () => {
        try {
            const clients = await getClients()
            setAvailableClients(clients)
            setIsClientModalOpen(true)
        } catch {
            toast("Saved clients could not be loaded.", "error")
        }
    }, [])

    useEffect(() => {
        if (!teamEstimateContext || !teamEstimateSession?.ownedByCaller) return

        const intervalId = window.setInterval(() => {
            void handleTeamSessionAction("heartbeat")
        }, 25_000)

        return () => window.clearInterval(intervalId)
    }, [handleTeamSessionAction, teamEstimateContext, teamEstimateSession?.ownedByCaller])

    // Offline detection and online recovery for pending audio
    useEffect(() => {
        setIsOffline(!navigator.onLine)

        const handleOnline = async () => {
            setIsOffline(false)

            // Check for pending audio to process
            try {
                const pending = await getUnprocessedAudio()
                if (pending.length > 0) {
                    const headers = await withAuthHeaders()
                    toast(`🔄 Processing ${pending.length} saved recording(s)...`, "info")

                    for (const audio of pending) {
                        try {
                            const formData = new FormData()
                            formData.append("file", audio.blob, "recording.webm")
                            formData.append("languageHint", sourceLanguage)

                            const response = await fetch("/api/transcribe", {
                                method: "POST",
                                headers,
                                body: formData,
                            })

                            if (response.status === 402) {
                                toast("Monthly voice quota reached. Upgrade flow will be enabled soon.", "warning")
                                continue
                            }

                            if (response.ok) {
                                const data = await response.json()
                                // If this page has the matching pending audio, update state
                                if (audio.id === pendingAudioId) {
                                    setTranscribedText(data.text)
                                    toast("Your recording was transcribed.", "success")
                                }
                                await deletePendingAudio(audio.id)
                            }
                        } catch (err) {
                            console.error("Failed to process pending audio:", err)
                        }
                    }
                }
            } catch (error) {
                console.error("Error processing pending audio:", error)
            }
        }

        const handleOffline = () => {
            setIsOffline(true)
        }

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [pendingAudioId, sourceLanguage])

    useEffect(() => {
        if (handledPaymentIntentRef.current) return
        if (typeof window === "undefined") return
        const params = new URLSearchParams(window.location.search)
        const intent = params.get("intent")
        if (intent !== "payment-link") return
        handledPaymentIntentRef.current = true
        const expectsDraft = Boolean(params.get("draftId"))

        void (async () => {
            const headers = await withAuthHeaders()
            if (!headers.authorization) {
                toast("Sign in to continue with payment link setup.", "warning")
                return
            }

            setAuthenticatedResumeIntent({ intent: "payment-link", expectsDraft })
        })()

        removeIntentFromComposerUrl()
    }, [removeIntentFromComposerUrl])

    useEffect(() => {
        if (handledReferralIntentRef.current) return
        if (typeof window === "undefined") return
        const params = new URLSearchParams(window.location.search)
        const intent = params.get("intent")
        if (intent !== "referral-invite") return
        handledReferralIntentRef.current = true
        const expectsDraft = Boolean(params.get("draftId"))

        void (async () => {
            const headers = await withAuthHeaders()
            if (!headers.authorization) {
                toast("Sign in to unlock referral invites.", "warning")
                return
            }

            setAuthenticatedResumeIntent({ intent: "referral-invite", expectsDraft })
        })()

        removeIntentFromComposerUrl()
    }, [removeIntentFromComposerUrl])

    useEffect(() => {
        if (!authenticatedResumeIntent) return

        if (authenticatedResumeIntent.expectsDraft && (!estimate || step !== "result")) {
            return
        }

        if (!estimate || step !== "result") {
            setCaptureIntent("type")
            toast(
                authenticatedResumeIntent.intent === "payment-link"
                    ? "Login confirmed. Add job details to continue payment setup."
                    : "Login confirmed. Add job details to create referral invites.",
                "success"
            )
            setAuthenticatedResumeIntent(null)
            return
        }

        if (authenticatedResumeIntent.intent === "payment-link") {
            toast("Login confirmed. Continue payment link setup.", "success")
            setIsPaymentModalOpen(true)
        } else {
            toast("Login confirmed. Referral invites are ready to copy.", "success")
            window.setTimeout(() => {
                document
                    .querySelector('[data-testid="handoff-actions-card"]')
                    ?.scrollIntoView({ behavior: "smooth", block: "center" })
            }, 0)
        }

        setAuthenticatedResumeIntent(null)
    }, [authenticatedResumeIntent, estimate, step])

    useEffect(() => {
        let isCancelled = false

        const loadBillingUsageSnapshot = async () => {
            try {
                const [usageResult, subscriptionResult] = await Promise.all([
                    getBillingUsageSnapshot(),
                    getBillingSubscriptionStatus(),
                ])

                if (isCancelled) return

                setSubscription(subscriptionResult)

                if (!usageResult.authorized) {
                    setBillingUsageSnapshot(null)
                    return
                }

                const snapshot = usageResult.snapshot
                setBillingUsageSnapshot(snapshot?.planTier === "free" ? snapshot : null)
            } catch (error) {
                console.error("Failed to load free tier usage banner:", error)
                if (!isCancelled) {
                    setBillingUsageSnapshot(null)
                    setSubscription(null)
                }
            }
        }

        void loadBillingUsageSnapshot()

        return () => {
            isCancelled = true
        }
    }, [])

    useEffect(() => {
        if (generateWorkflow === "photo_estimate" && !hasPhotoEstimateAccess) {
            setGenerateWorkflow("standard")
        }
    }, [generateWorkflow, hasPhotoEstimateAccess])

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])
        if (files.length > 0) {
            setCaptureIntent("photos")
            setImages(prev => [...prev, ...files])
            const newUrls = files.map(file => URL.createObjectURL(file))
            setPreviewUrls(prev => [...prev, ...newUrls])
        }
    }

    const handlePhotoCaptureClick = () => {
        updateCaptureIntent("photos")
        fileInputRef.current?.click()
    }

    const handleVoiceCaptureClick = () => {
        updateCaptureIntent("voice")
    }

    const handleTypeCaptureClick = () => {
        updateCaptureIntent("type")
        notesTextareaRef.current?.focus()
    }

    const handleSelectGenerateWorkflow = (nextWorkflow: GenerateWorkflow) => {
        if (nextWorkflow === "photo_estimate" && !hasPhotoEstimateAccess) {
            toast("Photo Estimate is available on Pro or Team.", "info")
            router.push("/pricing")
            return
        }

        setGenerateWorkflow(nextWorkflow)
    }

    const handleRemoveImage = (index: number) => {
        setImages(prev => prev.filter((_, i) => i !== index))
        setPreviewUrls(prev => {
            const newUrls = prev.filter((_, i) => i !== index)
            URL.revokeObjectURL(prev[index])
            return newUrls
        })
        if (fileInputRef.current) fileInputRef.current.value = ""
    }

    const handleAudioCaptured = async (blob: Blob) => {
        setAudioBlob(blob)

        // Check if offline
        if (!navigator.onLine) {
            // Save audio to IndexedDB for later processing
            try {
                const audioId = crypto.randomUUID()
                await savePendingAudio({
                    id: audioId,
                    blob: blob,
                    mimeType: 'audio/webm'
                })
                setPendingAudioId(audioId)
                toast("Offline: audio saved. Will process when online.", "info")
                setStep("verifying") // Let user type manually
            } catch (error) {
                console.error("Failed to save audio offline:", error)
                toast("Failed to save audio. Please try again.", "error")
            }
            return
        }

        // Online - process immediately
        setStep("transcribing")

        try {
            const formData = new FormData()
            formData.append("file", blob, "recording.webm")
            formData.append("languageHint", sourceLanguage)
            const headers = await withAuthHeaders()

            const response = await fetch("/api/transcribe", {
                method: "POST",
                headers,
                body: formData,
            })

            if (response.status === 402) {
                throw new Error("Monthly voice quota reached. Upgrade flow will be enabled soon.")
            }

            if (!response.ok) throw new Error("Transcription failed")

            const data = await response.json()
            setTranscribedText(data.text)
            setStep("verifying")
        } catch (error) {
            console.error(error)
            const message = error instanceof Error
                ? error.message
                : "Transcription failed. Please try again or type manually."
            toast(message, "error")
            setStep("verifying") // Go to verify anyway so user can type
        }
    }

    async function handleGenerateEstimate() {
        // Check network first
        if (!navigator.onLine) {
            toast("No internet connection. Please connect and try again.", "warning")
            return
        }

        if (generateWorkflow === "photo_estimate" && images.length === 0) {
            toast("Add at least one jobsite photo to run Photo Estimate.", "warning")
            return
        }

        setStep("generating")
        try {
            const base64Images = await Promise.all(images.map(fileToDataUrl))

            // Load price list for AI
            const priceListForAI = await getPriceListForAI()
            const headers = await withAuthHeaders({ "Content-Type": "application/json" })

            const response = await fetch("/api/generate", {
                method: "POST",
                headers,
                body: JSON.stringify({
                    images: base64Images,
                    notes: transcribedText,
                    sourceLanguage,
                    projectType,
                    workflow: generateWorkflow,
                    ...(generateWorkflow === "photo_estimate" && photoContext.trim()
                        ? { photoContext: photoContext.trim() }
                        : {}),
                    userProfile: businessProfile ? {
                        city: businessProfile.address?.split(',')[0] || "Toronto",
                        country: "Canada",
                        taxRate: businessProfile.tax_rate || 13,
                        businessName: businessProfile.business_name || "Our Company",
                        priceList: priceListForAI
                    } : { priceList: priceListForAI }
                }),
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                const status = response.status

                if (status === 429) {
                    throw new Error("Too many requests. Please wait a moment and try again.")
                } else if (status === 402) {
                    throw new Error(
                        generateWorkflow === "photo_estimate"
                            ? "Photo Estimate requires a Pro or Team plan."
                            : "Monthly AI generation quota reached. Upgrade flow will be enabled soon."
                    )
                } else if (status === 401 || status === 403) {
                    throw new Error(
                        generateWorkflow === "photo_estimate"
                            ? "Log in with a Pro or Team account to use Photo Estimate."
                            : "API key issue. Please check your configuration."
                    )
                } else if (status >= 500) {
                    throw new Error("Server error. Please try again in a few moments.")
                } else {
                    throw new Error(errorData.error || "Failed to generate estimate.")
                }
            }

            const data = await response.json()
            setEstimate(normalizeEstimatePayload(data))
            setStep("result")
        } catch (error: unknown) {
            console.error("Generate error:", error)

            // Determine error type for better messaging
            const generationErrorMessage = getErrorMessage(error, "Failed to generate estimate.")
            const isNetworkError =
                generationErrorMessage.includes("fetch") ||
                generationErrorMessage.includes("network")
            const errorMessage = isNetworkError
                ? "Network error. Check your connection and try again."
                : generationErrorMessage

            toast(errorMessage, "error")
            setStep("verifying")
        }
    }

    const handleItemChange = (index: number, field: keyof EstimateItem, value: string | number | boolean) => {
        if (!estimate) return
        const newItems = [...estimate.items]
        const item = newItems[index]
        if (!item) return
        newItems[index] = updateEstimateItemField(item, field, value)
        setEstimate({ ...estimate, items: newItems })
    }

    const handleSummaryChange = (value: string) => {
        if (!estimate) return
        setEstimate({ ...estimate, summary_note: value })
    }

    const handleAddItem = () => {
        if (!estimate) return
        const allItems = getAllItemsFromEstimate(estimate)
        const nextNumber = allItems.length + 1
        const newItem: EstimateItem = {
            id: `item-${crypto.randomUUID().slice(0, 8)}`,
            itemNumber: nextNumber,
            category: 'PARTS',
            description: "",
            quantity: 1,
            unit: 'ea',
            unit_price: 0,
            total: 0
        }
        setEstimate({ ...estimate, items: [...estimate.items, newItem] })
    }

    const handleDeleteItem = (index: number) => {
        if (!estimate) return
        const newItems = estimate.items.filter((_, i) => i !== index)
        setEstimate({ ...estimate, items: newItems })
    }

    // ========== Section Handlers ==========
    const handleAddSection = () => {
        if (!estimate) return
        const sections = estimate.sections || []
        const newSection: EstimateSection = {
            id: `section-${crypto.randomUUID().slice(0, 8)}`,
            name: `Section ${sections.length + 1}`,
            items: []
        }
        setEstimate({ ...estimate, sections: [...sections, newSection] })
    }

    const handleEditSectionName = (sectionId: string, newName: string) => {
        if (!estimate || !estimate.sections) return
        const updated = estimate.sections.map(s =>
            s.id === sectionId ? { ...s, name: newName } : s
        )
        setEstimate({ ...estimate, sections: updated })
    }

    const handleDeleteSection = (sectionId: string) => {
        if (!estimate || !estimate.sections) return
        // Move items to main items array before deleting section
        const sectionToDelete = estimate.sections.find(s => s.id === sectionId)
        const remainingSections = estimate.sections.filter(s => s.id !== sectionId)
        const itemsToMove = sectionToDelete?.items || []
        setEstimate({
            ...estimate,
            items: [...estimate.items, ...itemsToMove],
            sections: remainingSections
        })
    }

    const handleAddItemToSection = (sectionId: string) => {
        if (!estimate || !estimate.sections) return
        const allItems = getAllItemsFromEstimate(estimate)
        const nextNumber = allItems.length + 1
        const newItem: EstimateItem = {
            id: `item-${crypto.randomUUID().slice(0, 8)}`,
            itemNumber: nextNumber,
            category: 'PARTS',
            description: "",
            quantity: 1,
            unit: 'ea',
            unit_price: 0,
            total: 0
        }
        const updated = estimate.sections.map(s =>
            s.id === sectionId ? { ...s, items: [...(s.items || []), newItem] } : s
        )
        setEstimate({ ...estimate, sections: updated })
    }

    const handleSectionItemChange = (sectionId: string, itemIndex: number, field: keyof EstimateItem, value: string | number | boolean) => {
        if (!estimate || !estimate.sections) return
        const updated = estimate.sections.map(section => {
            if (section.id !== sectionId) return section
            const newItems = [...(section.items || [])]
            const item = newItems[itemIndex]
            if (!item) return section
            newItems[itemIndex] = updateEstimateItemField(item, field, value)
            return { ...section, items: newItems }
        })
        setEstimate({ ...estimate, sections: updated })
    }

    const handleDeleteSectionItem = (sectionId: string, itemIndex: number) => {
        if (!estimate || !estimate.sections) return
        const updated = estimate.sections.map(section => {
            if (section.id !== sectionId) return section
            return { ...section, items: (section.items || []).filter((_, i) => i !== itemIndex) }
        })
        setEstimate({ ...estimate, sections: updated })
    }

    const handleReceiptParsed = useCallback(({ items: parsedItems, warnings }: ReceiptScanResult) => {
        const normalizedWarnings = warnings
            .map((warning) => warning.trim())
            .filter(Boolean)

        setEstimate(prev => {
            if (!prev) return prev

            const allItems = getAllItemsFromEstimate(prev)
            const baseCount = allItems.length

            const mappedItems: EstimateItem[] = parsedItems.map((item, index) => ({
                id: item.id || `receipt-item-${crypto.randomUUID().slice(0, 8)}`,
                itemNumber: baseCount + index + 1,
                category: "PARTS",
                description: item.description || "Unknown Item",
                quantity: item.quantity || 1,
                unit: "ea",
                unit_price: item.unit_price || 0,
                total: item.total || 0,
                notes: (item.confidence_score !== undefined && item.confidence_score < 0.8)
                    ? "Need verification (Low AI Confidence)"
                    : undefined
            }))

            const mergedWarnings = Array.from(
                new Set([...(prev.warnings || []), ...normalizedWarnings])
            )

            return {
                ...prev,
                items: [...prev.items, ...mappedItems],
                warnings: mergedWarnings,
            }
        })

        if (normalizedWarnings.length > 0) {
            toast(`Review ${normalizedWarnings.length} receipt warning${normalizedWarnings.length === 1 ? "" : "s"} before sending.`, "info")
        }
    }, [])

    const handleApplyUpsellOption = (tier: "better" | "best") => {
        if (!estimate || !estimate.upsellOptions?.length) return

        const selectedOption = estimate.upsellOptions.find((option) => option.tier === tier)
        if (!selectedOption) return

        const allItems = getAllItemsFromEstimate(estimate)
        const baseCount = allItems.length

        const addedItems = selectedOption.addedItems.map((item, index) =>
            normalizeEstimateItem(
                {
                    ...item,
                    id: `upsell-${tier}-${crypto.randomUUID().slice(0, 8)}`,
                    itemNumber: baseCount + index + 1,
                },
                baseCount + index
            )
        )

        const nextEstimate = normalizeEstimatePayload({
            ...estimate,
            items: [...(estimate.items || []), ...addedItems],
            upsellOptions: estimate.upsellOptions.filter((option) => option.tier !== tier),
        })

        setEstimate(nextEstimate)
        toast(
            `${selectedOption.tier === "better" ? "Better" : "Best"} package added (+$${addedItems
                .reduce((sum, item) => sum + lineTotal(item), 0)
                .toFixed(2)})`,
            "success"
        )
    }

    const resultItems = useMemo(
        () => (estimate ? getAllItemsFromEstimate(estimate) : []),
        [estimate]
    )
    const resultSubtotal = useMemo(
        () => resultItems.reduce((sum, item) => sum + lineTotal(item), 0),
        [resultItems]
    )
    const resultTotal = useMemo(
        () => resultSubtotal * (1 + taxRate / 100),
        [resultSubtotal, taxRate]
    )
    const handleReviewLineItems = useCallback(() => {
        dismissToasts()
        const lineEditingBlock = document.querySelector('[data-testid="line-items-editing-block"]')
        const flatLineItems = document.querySelector('[data-testid="flat-line-items-list"]')
        const firstLineItem = document.querySelector('[data-testid="line-item-row-0"]')
        const reviewSummary = document.querySelector('[data-testid="line-items-review-summary"]')
        scrollElementIntoBottomSafeView(lineEditingBlock ?? flatLineItems ?? firstLineItem ?? reviewSummary, { block: "center" })
    }, [])
    const handleClientDetailsQuickAction = useCallback(() => {
        dismissToasts()
        setIsResultClientDetailsOpen(true)
        window.setTimeout(() => {
            scrollElementIntoBottomSafeView(resultClientCardRef.current, { block: "start" })
            resultClientNameInputRef.current?.focus({ preventScroll: true })
        }, 0)
    }, [])
    const handleResultDeliveryContactQuickAction = useCallback(() => {
        dismissToasts()
        setIsResultClientDetailsOpen(true)
        setIsResultContactEditorOpen(true)
        window.setTimeout(() => {
            const emailInput = resultClientEmailInputRef.current
            scrollElementIntoBottomSafeView(emailInput ?? resultClientCardRef.current, { block: "center" })
            emailInput?.focus({ preventScroll: true })
        }, 0)
    }, [])
    const hasAttachedPaymentLink = includePaymentLink && Boolean(paymentLink)
    const composerShellClassName = cn(
        "mx-auto space-y-5 px-4 pb-28 pt-4",
        step === "input" ? "max-w-4xl" : step === "result" ? "max-w-2xl" : "max-w-md",
    )
    const paymentLinkHelper = isPreparingAuthRedirect === "payment-link"
        ? "Saving this estimate so payment setup can resume after sign-in."
        : isOffline
        ? "Go online to add a Stripe card payment link."
        : isGeneratingPaymentLink
            ? "Creating a secure Stripe link for this estimate."
            : hasAttachedPaymentLink
                ? "This payment link will be attached to the PDF and customer message."
                : paymentLinkIssue
                    ? paymentLinkIssue.message
                    : "Add a card payment link before sending if you want online payment."
    const paymentLinkStatusLabel = isPreparingAuthRedirect === "payment-link"
        ? "Saving"
        : hasAttachedPaymentLink
        ? "Attached"
        : isGeneratingPaymentLink
            ? "Creating"
            : isOffline
                ? "Offline"
                : paymentLinkIssue?.statusLabel || "Not attached"
    const paymentLinkStatusClassName = isPreparingAuthRedirect === "payment-link"
        ? "border-blue-300/25 bg-blue-500/10 text-blue-200"
        : hasAttachedPaymentLink
        ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200"
        : isGeneratingPaymentLink
            ? "border-blue-300/25 bg-blue-500/10 text-blue-200"
            : isOffline || paymentLinkIssue
                ? "border-amber-300/25 bg-amber-400/10 text-amber-200"
                : "border-white/10 bg-slate-950/60 text-slate-400"
    const paymentLinkLabel = hasAttachedPaymentLink
        ? (paymentLinkType === "deposit" ? "50% deposit" : paymentLinkType === "custom" ? "Custom amount" : "Full payment")
        : paymentLinkIssue
            ? paymentLinkIssue.title
            : "Optional before delivery"
    const paymentQuickActionLabel = isPreparingAuthRedirect === "payment-link"
        ? "Saving draft"
        : hasAttachedPaymentLink
        ? "Payment attached"
        : paymentLinkIssue
            ? "Fix payment"
            : isOffline
                ? "Payment offline"
                : isGeneratingPaymentLink
                    ? "Creating link"
                    : "Add payment"
    const hasClientDetails = Boolean(clientName.trim())
    const shouldShowResultClientDetailsEditor = hasClientDetails || isResultClientDetailsOpen
    const resultClientStatusClassName = hasClientDetails
        ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200"
        : "border-amber-300/25 bg-amber-400/10 text-amber-200"
    const resultDeliveryStatusClassName = hasDeliveryContact
        ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200"
        : "border-amber-300/25 bg-amber-400/10 text-amber-200"
    const resultEmailActionLabel = trimmedClientEmail && !hasEmailDeliveryContact ? "Fix email" : "Add email"
    const resultPaymentStatusClassName = hasAttachedPaymentLink
        ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200"
        : paymentLinkIssue || isOffline
            ? "border-amber-300/25 bg-amber-400/10 text-amber-200"
            : "border-white/10 bg-slate-950/60 text-slate-400"
    const handoffHelper = hasAttachedPaymentLink
        ? "PDF includes payment and final line items."
        : "PDF is ready; payment and referral are optional."
    const handoffPaymentStatusLabel = hasAttachedPaymentLink
        ? (paymentLinkType === "deposit" ? "50%" : paymentLinkType === "custom" ? "Custom" : "Full")
        : paymentLinkIssue
            ? "Needs setup"
            : "Optional"
    const handoffPaymentStatusClassName = hasAttachedPaymentLink
        ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
        : paymentLinkIssue
            ? "border-amber-300/25 bg-amber-400/10 text-amber-100"
            : "border-white/10 bg-slate-950/55 text-slate-300"
    const referralHandoffStatusLabel = isPreparingAuthRedirect === "referral-invite" ? "Saving" : subscription ? "Ready" : "Sign in"
    const referralButtonHelper = subscription ? "Reward link for your customer" : "Login required to copy"
    const estimatePdfFileName = buildEstimatePdfFileName({
        estimateNumber: draftMetaRef.current?.estimateNumber,
        clientName,
    })

    const createEstimatePdfDocument = useCallback(async (
        options: { includePhotos?: boolean; includeSignature?: boolean } = {}
    ) => {
        if (!estimate) {
            throw new Error("Estimate data is unavailable.")
        }

        const { includePhotos = false, includeSignature = false } = options
        const { EstimatePDF } = await import("@/components/estimate-pdf")

        return (
            <EstimatePDF
                items={resultItems}
                total={resultSubtotal}
                summary={estimate.summary_note}
                taxRate={taxRate}
                client={{ name: clientName, address: clientAddress }}
                business={pdfBusinessProfile}
                paymentLink={includePaymentLink && paymentLink ? paymentLink : undefined}
                signature={includeSignature ? estimate.clientSignature : undefined}
                signedAt={includeSignature ? estimate.signedAt : undefined}
                templateUrl={pdfBusinessProfile?.estimate_template_url}
                paymentLabel={paymentLinkType === 'deposit' ? 'PAY DEPOSIT' : (paymentLinkType === 'custom' ? 'PAY AMOUNT' : 'PAY ONLINE')}
                photos={includePhotos ? previewUrls : undefined}
            />
        )
    }, [
        estimate,
        resultItems,
        resultSubtotal,
        taxRate,
        clientName,
        clientAddress,
        pdfBusinessProfile,
        includePaymentLink,
        paymentLink,
        paymentLinkType,
        previewUrls,
    ])

    const buildLocalEstimatePayload = useCallback(async (
        status: 'draft' | 'sent',
        overrides: { clientSignature?: string; signedAt?: string } = {}
    ) => {
        if (!estimate) {
            throw new Error("Estimate data is unavailable.")
        }

        const allItems = getAllItemsFromEstimate(estimate)
        const subtotal = allItems.reduce((sum, item) => sum + lineTotal(item), 0)
        const taxAmount = subtotal * (taxRate / 100)
        const totalAmount = subtotal + taxAmount
        const draftMeta = getOrCreateDraftMeta()
        const attachmentPhotos = images.length > 0 ? await Promise.all(images.map(fileToDataUrl)) : []

        const attachments = {
            photos: attachmentPhotos,
            originalTranscript: transcribedText || undefined,
        }

        return {
            id: draftMeta.id,
            estimateNumber: draftMeta.estimateNumber,
            items: allItems,
            sections: estimate.sections,
            summary_note: estimate.summary_note,
            upsellOptions: estimate.upsellOptions && estimate.upsellOptions.length > 0 ? estimate.upsellOptions : undefined,
            clientName: clientName || "Walk-in Client",
            clientAddress: clientAddress || "N/A",
            clientEmail: trimmedClientEmail || undefined,
            clientPhone: trimmedClientPhone || undefined,
            clientNotes: trimmedClientNotes || undefined,
            taxRate,
            taxAmount,
            totalAmount,
            createdAt: teamEstimateContext?.createdAt || draftMeta.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sentAt: status === "sent" ? (teamEstimateContext?.sentAt || new Date().toISOString()) : undefined,
            status,
            paymentLink: includePaymentLink && paymentLink ? paymentLink : undefined,
            paymentLinkId: includePaymentLink && paymentLinkId ? paymentLinkId : undefined,
            paymentLinkType: includePaymentLink && paymentLinkType ? paymentLinkType : undefined,
            clientSignature: overrides.clientSignature ?? estimate.clientSignature,
            signedAt: overrides.signedAt ?? estimate.signedAt,
            attachments: (attachmentPhotos.length > 0 || transcribedText) ? attachments : undefined,
            synced: false,
        }
    }, [
        estimate,
        taxRate,
        images,
        transcribedText,
        clientName,
        clientAddress,
        trimmedClientEmail,
        trimmedClientPhone,
        trimmedClientNotes,
        getOrCreateDraftMeta,
        includePaymentLink,
        paymentLink,
        paymentLinkId,
        paymentLinkType,
        teamEstimateContext?.createdAt,
        teamEstimateContext?.sentAt,
    ])

    const buildLoginNextPathWithDraft = useCallback(async () => {
        if (!estimate) return "/new-estimate"

        const localEstimate = await buildLocalEstimatePayload("draft")
        await saveEstimate(localEstimate)
        return `/new-estimate?draftId=${encodeURIComponent(localEstimate.id)}`
    }, [buildLocalEstimatePayload, estimate])

    const redirectToLoginForEstimateIntent = useCallback(async (intent: "payment-link" | "referral-invite") => {
        setIsPreparingAuthRedirect(intent)
        let nextPath = "/new-estimate"

        try {
            nextPath = await buildLoginNextPathWithDraft()
        } catch (error) {
            console.error("Failed to save estimate before sign-in:", error)
        }

        const params = new URLSearchParams({
            next: nextPath,
            intent,
        })
        router.push(`/login?${params.toString()}`)
    }, [buildLoginNextPathWithDraft, router])

    const openPaymentLinkSetup = useCallback(async () => {
        if (!navigator.onLine) {
            toast('Payment links require internet connection.', 'warning')
            return
        }

        const headers = await withAuthHeaders()
        if (!headers.authorization) {
            void redirectToLoginForEstimateIntent("payment-link")
            return
        }

        setPaymentLinkIssue(null)
        setIsPaymentModalOpen(true)
    }, [redirectToLoginForEstimateIntent])

    const handlePaymentLinkSwitch = useCallback(async () => {
        if (!includePaymentLink) {
            await openPaymentLinkSetup()
            return
        }

        resetPaymentLinkState()
    }, [includePaymentLink, openPaymentLinkSetup, resetPaymentLinkState])

    const handlePaymentLinkQuickAction = useCallback(() => {
        if (hasAttachedPaymentLink || paymentLinkIssue || isOffline || isGeneratingPaymentLink || isPreparingAuthRedirect) {
            document
                .querySelector('[data-testid="payment-link-card"]')
                ?.scrollIntoView({ behavior: "smooth", block: "center" })
            return
        }

        void openPaymentLinkSetup()
    }, [
        hasAttachedPaymentLink,
        isGeneratingPaymentLink,
        isOffline,
        isPreparingAuthRedirect,
        openPaymentLinkSetup,
        paymentLinkIssue,
    ])

    const handleReferralSignIn = useCallback(() => {
        void redirectToLoginForEstimateIntent("referral-invite")
    }, [redirectToLoginForEstimateIntent])

    const persistTeamEstimateToCloud = useCallback(async (localEstimate: Awaited<ReturnType<typeof buildLocalEstimatePayload>>) => {
        if (!teamEstimateContext) {
            return localEstimate
        }

        const result = await updateTeamEstimate(teamEstimateContext.estimateId, {
            clientName: localEstimate.clientName,
            clientAddress: localEstimate.clientAddress,
            clientEmail: localEstimate.clientEmail,
            clientPhone: localEstimate.clientPhone,
            clientNotes: localEstimate.clientNotes,
            summary_note: localEstimate.summary_note,
            status: localEstimate.status,
            taxRate: localEstimate.taxRate,
            taxAmount: localEstimate.taxAmount,
            totalAmount: localEstimate.totalAmount,
            sentAt: localEstimate.sentAt,
            items: localEstimate.items.map((item) => ({
                id: item.id,
                itemNumber: item.itemNumber,
                category: item.category,
                description: item.description,
                quantity: item.quantity,
                unit: item.unit,
                unit_price: item.unit_price,
                total: item.total,
            })),
            sections: localEstimate.sections?.map((section) => ({
                id: section.id,
                name: section.name,
                divisionCode: section.divisionCode,
                items: section.items.map((item) => ({
                    id: item.id,
                    itemNumber: item.itemNumber,
                    category: item.category,
                    description: item.description,
                    quantity: item.quantity,
                    unit: item.unit,
                    unit_price: item.unit_price,
                    total: item.total,
                })),
            })),
        })

        setTeamEstimateContext(result.estimate)
        return {
            ...localEstimate,
            estimateNumber: result.estimate.estimateNumber,
            createdAt: result.estimate.createdAt,
            updatedAt: result.estimate.updatedAt,
            sentAt: result.estimate.sentAt,
            synced: true,
        }
    }, [teamEstimateContext])

    const persistCurrentEstimateAsSent = useCallback(async (
        overrides: { clientSignature?: string; signedAt?: string } = {}
    ) => {
        if (isTeamEstimateMode && !canEditTeamEstimate) {
            throw new Error("Claim the Team editing session before sending.")
        }

        const nextEstimate = await buildLocalEstimatePayload("sent", overrides)
        const persistedEstimate = await persistTeamEstimateToCloud(nextEstimate)
        const existing = (await getEstimates()).find((entry) => entry.id === nextEstimate.id)

        if (!existing) {
            await saveEstimate(persistedEstimate)
            return persistedEstimate
        }

        const sentAt = existing.sentAt || persistedEstimate.sentAt || new Date().toISOString()
        await updateEstimate(existing.id, {
            ...persistedEstimate,
            createdAt: existing.createdAt,
            sentAt,
            status: "sent",
            synced: isTeamEstimateMode ? true : false,
        })

        return { ...existing, ...persistedEstimate, createdAt: existing.createdAt, sentAt, status: "sent" as const }
    }, [buildLocalEstimatePayload, canEditTeamEstimate, isTeamEstimateMode, persistTeamEstimateToCloud])

    const handleSave = async () => {
        if (!estimate) return
        if (isTeamEstimateMode && !canEditTeamEstimate) {
            toast("Claim the Team editing session before saving shared changes.", "warning")
            return
        }
        setIsSaving(true)
        try {
            const localEstimate = await buildLocalEstimatePayload("draft")
            const persistedEstimate = await persistTeamEstimateToCloud(localEstimate)
            const allItems = localEstimate.items || []
            await saveEstimate(persistedEstimate)
            void trackAnalyticsEvent({
                event: "draft_saved",
                estimateId: persistedEstimate.id,
                estimateNumber: persistedEstimate.estimateNumber,
                metadata: {
                    totalAmount: persistedEstimate.totalAmount,
                    itemCount: allItems.length,
                    hasAttachments: Boolean(persistedEstimate.attachments),
                    teamEstimate: isTeamEstimateMode,
                },
            })
            toast(isTeamEstimateMode ? "Team estimate saved to shared workspace." : "Estimate saved successfully.", "success")
            setTimeout(() => router.push("/history"), 500)
        } catch (error) {
            console.error(error)
            toast("Failed to save. Storage might be full.", "error")
        } finally {
            setIsSaving(false)
        }
    }

    const handleShare = async () => {
        if (!estimate) return
        if (isTeamEstimateMode && !canEditTeamEstimate) {
            toast("Claim the Team editing session before sharing.", "warning")
            return
        }

        setIsSharing(true)
        let deliveredPdf = false
        try {
            const allItems = getAllItemsFromEstimate(estimate)
            const subtotal = allItems.reduce((sum, item) => sum + lineTotal(item), 0)
            const total = subtotal * (1 + taxRate / 100)
            const draftMeta = getOrCreateDraftMeta()
            const fileName = buildEstimatePdfFileName({
                estimateNumber: draftMeta.estimateNumber,
                clientName,
            })
            const { pdf } = await import("@react-pdf/renderer")
            const pdfDoc = await createEstimatePdfDocument({ includePhotos: true, includeSignature: true })
            const blob = await pdf(pdfDoc).toBlob()
            const file = new File([blob], fileName, { type: "application/pdf" })
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: `Estimate ${draftMeta.estimateNumber}`,
                    text: `Estimate Total: $${total.toFixed(2)}`,
                    files: [file],
                })
                deliveredPdf = true
                await persistCurrentEstimateAsSent()
                void trackAnalyticsEvent({
                    event: "quote_sent",
                    estimateId: draftMeta.id,
                    estimateNumber: draftMeta.estimateNumber,
                    channel: "share_pdf",
                    metadata: {
                        fileName,
                        nativeShare: true,
                        hasPaymentLink: includePaymentLink && Boolean(paymentLink),
                    },
                })
                toast("PDF shared. Estimate marked sent.", "success")
            } else {
                downloadBlobAsFile(blob, fileName)
                deliveredPdf = true
                await persistCurrentEstimateAsSent()
                void trackAnalyticsEvent({
                    event: "quote_sent",
                    estimateId: draftMeta.id,
                    estimateNumber: draftMeta.estimateNumber,
                    channel: "share_pdf_download",
                    metadata: {
                        fileName,
                        nativeShare: false,
                        hasPaymentLink: includePaymentLink && Boolean(paymentLink),
                    },
                })
                toast("PDF downloaded for sharing. Estimate marked sent.", "success")
            }
        } catch (error) {
            if (isShareCanceledError(error)) {
                toast("Share canceled.", "info")
                return
            }
            console.error("Share failed:", error)
            toast(
                deliveredPdf
                    ? "PDF was prepared, but saving sent status failed."
                    : "Failed to generate PDF. Please try again.",
                "error"
            )
        } finally {
            setIsSharing(false)
        }
    }

    const handleDownloadPdf = async () => {
        if (!estimate) return
        setIsDownloadingPdf(true)
        try {
            const draftMeta = getOrCreateDraftMeta()
            const fileName = buildEstimatePdfFileName({
                estimateNumber: draftMeta.estimateNumber,
                clientName,
            })
            const { pdf } = await import("@react-pdf/renderer")
            const pdfDoc = await createEstimatePdfDocument({ includeSignature: true })

            const blob = await pdf(pdfDoc).toBlob()
            downloadBlobAsFile(blob, fileName)
            toast(`PDF downloaded as ${fileName}.`, "success")
        } catch (error) {
            console.error("Download PDF failed:", error)
            toast("Failed to create PDF.", "error")
        } finally {
            setIsDownloadingPdf(false)
        }
    }

    const handleOpenPreview = () => {
        getOrCreateDraftMeta()
        setIsPreviewOpen(true)
    }

    const handleCopyReferralLink = async () => {
        setIsCopyingReferral(true)
        try {
            const shareUrl = await copyReferralShareUrl({ source: "estimate_result" })
            if (!shareUrl) {
                toast("Log in first to generate your referral link.", "info")
                return
            }

            const draftMeta = getOrCreateDraftMeta()
            void trackAnalyticsEvent({
                event: "referral_link_copied",
                estimateId: draftMeta.id,
                estimateNumber: draftMeta.estimateNumber,
                channel: "new_estimate_result",
            })
            toast("Referral link copied.", "success")
        } catch (error) {
            console.error("Failed to copy referral link:", error)
            toast("Failed to copy referral link.", "error")
        } finally {
            setIsCopyingReferral(false)
        }
    }

    const handleSendEstimateEmail = useCallback(async (email: string, message: string) => {
        try {
            const { pdf } = await import("@react-pdf/renderer")
            const pdfDoc = await createEstimatePdfDocument({ includeSignature: true })
            const blob = await pdf(pdfDoc).toBlob()

            const reader = new FileReader()
            const pdfBase64 = await new Promise<string>((resolve, reject) => {
                reader.onload = () => {
                    const result = reader.result as string
                    const base64 = result.split(",")[1]
                    resolve(base64)
                }
                reader.onerror = reject
                reader.readAsDataURL(blob)
            })
            const referralUrl = await getReferralShareUrl({ source: "estimate_email" })
            const headers = await withAuthHeaders({ "Content-Type": "application/json" })

            const response = await fetch("/api/send-email", {
                method: "POST",
                headers,
                body: JSON.stringify({
                    email,
                    subject: `Estimate from ${businessProfile?.business_name || "SnapQuote"}`,
                    message,
                    pdfBase64,
                    businessName: businessProfile?.business_name,
                    referralUrl: referralUrl || undefined,
                })
            })

            if (!response.ok) {
                const errorData = await response.json().catch((): { error?: unknown } => ({}))
                if (response.status === 402) {
                    throw new Error("Monthly email quota reached. Upgrade flow will be enabled soon.")
                }
                throw new Error(typeof errorData.error === "string" ? errorData.error : "Failed to send email")
            }

            const data = await response.json()

            if (data.method === "mailto") {
                window.open(data.mailtoUrl, "_blank")
                toast("Email client opened. Please attach the PDF.", "warning")
            } else {
                const draftMeta = getOrCreateDraftMeta()
                void trackAnalyticsEvent({
                    event: "quote_sent",
                    estimateId: draftMeta.id,
                    estimateNumber: draftMeta.estimateNumber,
                    channel: "email",
                    metadata: {
                        recipient: email,
                        hasPaymentLink: includePaymentLink && Boolean(paymentLink),
                    },
                })
                await persistCurrentEstimateAsSent()
                toast("Email sent with PDF attached.", "success")
            }
        } catch (error: unknown) {
            const message = getErrorMessage(error, "Failed to send. Try again.")
            throw new Error(message)
        }
    }, [
        businessProfile?.business_name,
        createEstimatePdfDocument,
        getOrCreateDraftMeta,
        includePaymentLink,
        paymentLink,
        persistCurrentEstimateAsSent,
    ])

    const handleExcelImport = useCallback((importedItems: EstimateItem[]) => {
        const normalizedImportedItems = (importedItems || []).map((item, index) => normalizeEstimateItem(item, index))

        if (!estimate) {
            // Create new estimate with imported items
            setEstimate({
                items: normalizedImportedItems,
                summary_note: "Imported from CSV",
            })
            setStep("verifying")
        } else {
            // Merge with existing items
            const updatedItems = [
                ...(estimate.items || []),
                ...normalizedImportedItems.map((item, idx) => ({
                    ...item,
                    itemNumber: (estimate.items?.length || 0) + idx + 1
                }))
            ]
            setEstimate(normalizeEstimatePayload({ ...estimate, items: updatedItems }))
        }
        toast(`Imported ${normalizedImportedItems.length} items from CSV.`, "success")
    }, [estimate, setEstimate, setStep])

    return (
        <div className={composerShellClassName}>
            <CardHeader className="px-0 pb-0">
                <h1 className="text-xl font-semibold text-white">
                    {step === "input" && "New Estimate"}
                    {step === "transcribing" && "Processing Audio..."}
                    {step === "verifying" && "Verify Details"}
                    {step === "generating" && "Creating Estimate..."}
                    {step === "result" && "Estimate Ready"}
                </h1>
            </CardHeader>

            {billingUsageSnapshot ? (
                <FreeTierQuotaBanner
                    used={billingUsageSnapshot.usage.generate}
                    limit={billingUsageSnapshot.limits.generate}
                    periodStart={billingUsageSnapshot.periodStart}
                />
            ) : null}

            <TeamEstimateStatusCard
                activeEditorLabel={activeTeamEditorLabel}
                context={teamEstimateContext}
                isLoading={teamEstimateLoading}
                isMutating={teamSessionMutating}
                onAction={(action) => void handleTeamSessionAction(action)}
                session={teamEstimateSession}
            />

            {/* STEP 1: INPUT */}
            {step === "input" && (
                <div className="animate-in fade-in slide-in-from-bottom-4 space-y-4 md:grid md:grid-cols-[minmax(0,1.15fr)_minmax(260px,0.85fr)] md:items-start md:gap-4 md:space-y-0">
                    <section className="field-panel overflow-hidden" data-testid="input-capture-panel">
                        <div className="border-b border-white/10 px-4 py-3 sm:py-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{captureCopy.eyebrow}</p>
                                    <h2 className="mt-1 text-xl font-semibold leading-tight text-white sm:text-2xl">{captureCopy.title}</h2>
                                </div>
                                <span className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${isOffline ? "border-amber-300/30 bg-amber-400/10 text-amber-200" : "border-emerald-300/25 bg-emerald-400/10 text-emerald-200"}`}>
                                    {isOffline ? "Offline" : "Online"}
                                </span>
                            </div>
                            <p className="mt-2 text-sm leading-5 text-slate-300 sm:leading-6">
                                {captureCopy.description}
                            </p>
                            <span className="sr-only" data-testid="capture-intent-status">
                                {captureCopy.status}
                            </span>
                        </div>

                        <div className="space-y-2.5 p-3 sm:space-y-4 sm:p-4">
                            <div className="grid grid-cols-4 gap-2" data-testid="capture-switcher">
                                <button
                                    type="button"
                                    onClick={handleVoiceCaptureClick}
                                    aria-pressed={activeCaptureIntent === "voice"}
                                    className={cn(
                                        "field-action min-h-11 gap-1 py-2 text-[11px] sm:min-h-12",
                                        activeCaptureIntent === "voice" && "field-action-primary"
                                    )}
                                    data-testid="voice-capture-action"
                                >
                                    <Mic className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                                    <span>Voice</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handlePhotoCaptureClick}
                                    aria-pressed={activeCaptureIntent === "photos"}
                                    className={cn(
                                        "field-action min-h-11 gap-1 py-2 text-[11px] sm:min-h-12",
                                        activeCaptureIntent === "photos" && "field-action-primary"
                                    )}
                                    data-testid="photo-capture-action"
                                >
                                    <Camera className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                                    <span>Photos</span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        ref={fileInputRef}
                                        onChange={handleImageSelect}
                                        suppressHydrationWarning
                                    />
                                </button>
                                <button
                                    type="button"
                                    onClick={handleTypeCaptureClick}
                                    aria-pressed={activeCaptureIntent === "type"}
                                    className={cn(
                                        "field-action min-h-11 gap-1 py-2 text-[11px] sm:min-h-12",
                                        activeCaptureIntent === "type" && "field-action-primary"
                                    )}
                                    data-testid="type-capture-action"
                                >
                                    <FileText className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                                    <span>Type</span>
                                </button>
                                <NextLink
                                    href="/new-estimate?tutorial=1"
                                    className="field-action min-h-11 gap-1 py-2 text-[11px] sm:min-h-12"
                                    data-testid="load-demo-quote-button"
                                    onClick={(event) => {
                                        event.preventDefault()
                                        handleLoadDemoQuote()
                                    }}
                                >
                                    <Sparkles className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                                    <span>Demo</span>
                                </NextLink>
                            </div>

                            {clientInputContextCard}

                            {activeCaptureIntent === "voice" ? (
                                <AudioRecorder
                                    className="rounded-lg ring-2 ring-blue-400/40 ring-offset-2 ring-offset-slate-950"
                                    onAudioCaptured={(audioBlob) => {
                                        setCaptureIntent("voice")
                                        handleAudioCaptured(audioBlob)
                                    }}
                                    onAudioRemoved={() => setAudioBlob(null)}
                                />
                            ) : null}

                            <div className="space-y-2">
                                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                    Rough job notes
                                </label>
                                <Textarea
                                    ref={notesTextareaRef}
                                    value={transcribedText}
                                    onChange={(event) => setTranscribedText(event.target.value)}
                                    className="min-h-[96px] rounded-lg border-white/10 bg-slate-950/75 text-base text-white placeholder:text-slate-500 focus-visible:ring-blue-500 sm:min-h-[112px]"
                                    placeholder="Example: replace angle stop under sink, fix P-trap leak, test water pressure, include cleanup..."
                                    data-testid="job-description-input"
                                />
                                {!hasClientContext && (activeCaptureIntent === "type" || canGenerateEstimate) ? (
                                    <div
                                        className={cn(
                                            "flex items-center justify-between gap-3 rounded-lg border p-2.5",
                                            canGenerateEstimate
                                                ? "border-blue-300/25 bg-blue-500/10"
                                                : "border-white/10 bg-slate-950/60"
                                        )}
                                        data-testid={canGenerateEstimate ? "quick-generate-ready-state" : "quick-generate-empty-state"}
                                    >
                                        {canGenerateEstimate ? (
                                            <div className="min-w-0">
                                                <p className="text-xs font-semibold text-blue-100">Scope ready</p>
                                                <p className="truncate text-[11px] text-slate-400">Generate a draft from this capture.</p>
                                            </div>
                                        ) : (
                                            <div className="min-w-0">
                                                <p className="text-xs font-semibold text-slate-200">Add rough scope</p>
                                                <p className="truncate text-[11px] text-slate-500">Type a few job notes first.</p>
                                            </div>
                                        )}
                                        {canGenerateEstimate ? (
                                            <Button
                                                type="button"
                                                size="sm"
                                                className="h-10 shrink-0 rounded-lg px-3 text-sm font-semibold"
                                                onClick={handleGenerateEstimate}
                                                data-testid="quick-generate-button"
                                            >
                                                Generate
                                                <ArrowRight className="ml-1.5 h-4 w-4" />
                                            </Button>
                                        ) : (
                                            <Button
                                                type="button"
                                                size="sm"
                                                className="h-10 shrink-0 rounded-lg px-3 text-sm font-semibold"
                                                disabled
                                                data-testid="quick-generate-disabled-button"
                                            >
                                                Generate
                                            </Button>
                                        )}
                                    </div>
                                ) : null}
                            </div>

                            <div className="space-y-2" data-testid="input-client-details-section">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Client</span>
                                    <div className="flex items-center gap-1.5">
                                        {hasClientContext ? (
                                            <button
                                                type="button"
                                                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white"
                                                onClick={() => setIsInputClientDetailsOpen((isOpen) => !isOpen)}
                                                data-testid="input-edit-client-details-button"
                                            >
                                                <PenTool className="h-4 w-4" />
                                                <span>{isInputClientDetailsOpen ? "Hide details" : "Edit details"}</span>
                                            </button>
                                        ) : null}
                                        {!hasClientContext ? (
                                            <button
                                                type="button"
                                                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white"
                                                onClick={() => setIsInputClientDetailsOpen((isOpen) => !isOpen)}
                                                data-testid="input-add-client-details-button"
                                            >
                                                <PenTool className="h-4 w-4" />
                                                <span>{isInputClientDetailsOpen ? "Hide" : "Add"}</span>
                                            </button>
                                        ) : null}
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-11 min-h-11 rounded-lg px-3 text-xs text-blue-300 hover:bg-blue-500/10"
                                            onClick={openClientLoadDialog}
                                            data-testid="input-load-client-button"
                                        >
                                            <Users className="mr-1 h-4 w-4" />
                                            {hasClientContext ? "Change" : "Load"}
                                        </Button>
                                    </div>
                                </div>
                                {!hasClientContext && !isInputClientDetailsOpen ? (
                                    <button
                                        type="button"
                                            className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-left transition hover:border-blue-300/25 hover:bg-blue-500/10"
                                        onClick={() => setIsInputClientDetailsOpen(true)}
                                        data-testid="input-client-details-collapsed"
                                    >
                                        <span className="min-w-0">
                                            <span className="block text-sm font-semibold text-white">Customer later</span>
                                            <span className="block truncate text-xs leading-4 text-slate-400" data-testid="input-client-details-collapsed-description">
                                                Add details before sending.
                                            </span>
                                        </span>
                                        <ArrowRight className="h-4 w-4 shrink-0 text-blue-200" />
                                    </button>
                                ) : null}
                                {hasClientContext && !isInputClientDetailsOpen ? (
                                    <div
                                        className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-300"
                                        data-testid="input-client-details-summary"
                                    >
                                        <MapPin className="h-3.5 w-3.5 shrink-0 text-blue-200" />
                                        <div className="min-w-0">
                                            <p className="truncate font-semibold text-white">{trimmedClientName}</p>
                                            <p className="truncate text-slate-400">
                                                {clientAddress.trim() || "No job address yet"}
                                            </p>
                                        </div>
                                    </div>
                                ) : null}
                                {shouldShowInputClientDetailsFields ? (
                                    <div className="grid gap-2 sm:grid-cols-2" data-testid="input-client-details-fields">
                                        <Input
                                            value={clientName}
                                            onChange={(event) => {
                                                setIsInputClientDetailsOpen(true)
                                                setClientName(event.target.value)
                                                setClientEmail("")
                                                setClientPhone("")
                                                setClientNotes("")
                                                setIsClientContactEditorOpen(false)
                                                setIsResultContactEditorOpen(false)
                                                setIsResultClientDetailsOpen(false)
                                            }}
                                            placeholder="Client name"
                                            className="rounded-lg border-white/10 bg-slate-950/75 text-white placeholder:text-slate-500"
                                        />
                                        <Input
                                            value={clientAddress}
                                            onChange={(event) => setClientAddress(event.target.value)}
                                            placeholder="Job address"
                                            className="rounded-lg border-white/10 bg-slate-950/75 text-white placeholder:text-slate-500"
                                        />
                                    </div>
                                ) : null}
                            </div>

                            <details
                                className="!mt-48 rounded-lg border border-white/10 bg-slate-950/60 px-3 sm:!mt-0"
                                data-testid="input-capture-settings"
                            >
                                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-200 [&::-webkit-details-marker]:hidden" data-testid="input-capture-settings-summary">
                                    <span className="inline-flex min-w-0 items-center gap-2">
                                        <SlidersHorizontal className="h-4 w-4 shrink-0 text-blue-200" />
                                        <span>Capture settings</span>
                                    </span>
                                    <span className="shrink-0 text-xs font-medium text-slate-500">
                                        {SOURCE_LANGUAGE_OPTIONS.find((option) => option.value === sourceLanguage)?.label.replace(" Beta", "") || "Auto"} · {projectType === "residential" ? "Residential" : "Commercial"}
                                    </span>
                                </summary>
                                <div className="mt-3 space-y-3">
                                    <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-950/80 p-1">
                                        {SOURCE_LANGUAGE_OPTIONS.map((option) => (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() => setSourceLanguage(option.value)}
                                                className={`min-h-11 rounded-md px-2 text-xs font-semibold transition-colors ${
                                                    sourceLanguage === option.value
                                                        ? "bg-blue-600 text-white"
                                                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                                                }`}
                                                title={option.hint}
                                            >
                                                {option.label.replace(" Beta", "")}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setProjectType("residential")}
                                            className={`min-h-11 rounded-lg border px-3 py-2.5 text-left text-xs font-semibold transition-colors ${
                                                projectType === "residential"
                                                    ? "border-blue-400/40 bg-blue-600/20 text-white"
                                                    : "border-white/10 bg-slate-950/60 text-slate-400"
                                            }`}
                                        >
                                            Residential
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setProjectType("commercial")}
                                            className={`min-h-11 rounded-lg border px-3 py-2.5 text-left text-xs font-semibold transition-colors ${
                                                projectType === "commercial"
                                                    ? "border-blue-400/40 bg-blue-600/20 text-white"
                                                    : "border-white/10 bg-slate-950/60 text-slate-400"
                                            }`}
                                        >
                                            Commercial
                                        </button>
                                    </div>

                                    <p className="text-xs leading-5 text-slate-400">
                                        Try: {SOURCE_LANGUAGE_EXAMPLES[sourceLanguage]}
                                    </p>
                                </div>
                            </details>

                            {previewUrls.length > 0 && (
                                <div className="grid grid-cols-3 gap-2">
                                    {previewUrls.map((url, index) => (
                                        <div key={url} className="relative aspect-square">
                                            <Image
                                                src={url}
                                                alt={`Site photo ${index + 1}`}
                                                fill
                                                className="rounded-lg object-cover"
                                            />
                                            <Button
                                                variant="destructive"
                                                size="icon"
                                                className="absolute right-1 top-1 rounded-lg border border-white/20 bg-red-600/90 text-white shadow-lg hover:bg-red-500"
                                                onClick={(event) => {
                                                    event.stopPropagation()
                                                    handleRemoveImage(index)
                                                }}
                                                aria-label={`Remove site photo ${index + 1}`}
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="field-panel p-4 md:sticky md:top-4" data-testid="input-workflow-panel">
                        <div className="mb-3 rounded-lg border border-blue-300/20 bg-blue-500/10 p-3" data-testid="input-readiness-card">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-100/80">Job readiness</p>
                                    <p className="mt-1 text-sm font-semibold leading-5 text-white">
                                        {canGenerateEstimate ? "Ready to draft a quote." : "Capture the scope first."}
                                    </p>
                                </div>
                                <span
                                    className={cn(
                                        "shrink-0 rounded-lg border px-2 py-1 text-[11px] font-semibold",
                                        canGenerateEstimate
                                            ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200"
                                            : "border-amber-300/25 bg-amber-400/10 text-amber-200"
                                    )}
                                    data-testid="input-readiness-scope-status"
                                >
                                    {scopeReadinessLabel}
                                </span>
                            </div>
                            <div className="mt-3 grid gap-2 text-xs font-semibold">
                                <div className="flex min-h-9 items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/55 px-2.5">
                                    <span className="inline-flex min-w-0 items-center gap-2 text-slate-400">
                                        <ClipboardList className="h-3.5 w-3.5 shrink-0 text-blue-200" />
                                        Scope
                                    </span>
                                    <span className={cn("truncate", canGenerateEstimate ? "text-emerald-200" : "text-amber-200")}>
                                        {scopeReadinessLabel}
                                    </span>
                                </div>
                                <div className="flex min-h-9 items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/55 px-2.5">
                                    <span className="inline-flex min-w-0 items-center gap-2 text-slate-400">
                                        <Users className="h-3.5 w-3.5 shrink-0 text-blue-200" />
                                        Client
                                    </span>
                                    <span className={cn("truncate", hasClientContext ? "text-emerald-200" : "text-slate-300")} data-testid="input-readiness-client-status">
                                        {clientReadinessLabel}
                                    </span>
                                </div>
                                <div className="flex min-h-9 items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/55 px-2.5">
                                    <span className="inline-flex min-w-0 items-center gap-2 text-slate-400">
                                        <Mail className="h-3.5 w-3.5 shrink-0 text-blue-200" />
                                        Delivery
                                    </span>
                                    <span className={cn("truncate", hasDeliveryContact ? "text-emerald-200" : "text-slate-300")} data-testid="input-readiness-delivery-status">
                                        {deliveryReadinessLabel}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => handleSelectGenerateWorkflow("standard")}
                                className={`rounded-lg border p-3 text-left transition-colors ${
                                    generateWorkflow === "standard"
                                        ? "border-blue-400/40 bg-blue-600/20"
                                        : "border-white/10 bg-slate-950/60 hover:bg-slate-900"
                                }`}
                            >
                                <p className="text-sm font-semibold text-white">Standard Draft</p>
                                <p className="mt-1 text-xs leading-4 text-slate-400">Voice, text, and photos into a quote.</p>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSelectGenerateWorkflow("photo_estimate")}
                                className={`rounded-lg border p-3 text-left transition-colors ${
                                    generateWorkflow === "photo_estimate"
                                        ? "border-blue-400/40 bg-blue-600/20"
                                        : "border-white/10 bg-slate-950/60 hover:bg-slate-900"
                                }`}
                            >
                                <p className="text-sm font-semibold text-white">Photo Estimate</p>
                                <p className="mt-1 text-xs leading-4 text-slate-400">{hasPhotoEstimateAccess ? "Analyze visible conditions." : "Pro feature."}</p>
                            </button>
                        </div>

                        {generateWorkflow === "photo_estimate" ? (
                            <div className="mt-3 space-y-2">
                                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Photo context</label>
                                <Textarea
                                    value={photoContext}
                                    onChange={(event) => setPhotoContext(event.target.value)}
                                    className="min-h-[88px] rounded-lg border-white/10 bg-slate-950/75 text-white placeholder:text-slate-500"
                                    placeholder="Room, finish level, access issues, customer expectations..."
                                />
                            </div>
	                        ) : null}

	                        <button
	                            type="button"
	                            className="mt-3 flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/55 px-3 py-2.5 text-left text-sm text-slate-300 transition hover:border-blue-300/25 hover:bg-blue-500/10 hover:text-white"
	                            onClick={openManualEntry}
	                            data-testid="skip-to-manual-entry"
	                        >
	                            <span className="min-w-0">
	                                <span className="block font-semibold">Manual line entry</span>
	                                <span className="block truncate text-xs text-slate-500">Build the quote yourself from line items.</span>
	                            </span>
	                            <FileText className="h-4 w-4 shrink-0 text-blue-200" />
	                        </button>

	                        {!shouldShowInlineClientGenerate ? (
	                            <div className="mt-4 space-y-2">
	                                <Button
	                                    size="lg"
	                                    className="h-12 w-full min-w-0 rounded-lg px-4 text-base font-semibold"
	                                    onClick={handleGenerateEstimate}
	                                    disabled={!canGenerateEstimate}
	                                    data-testid="generate-estimate-button"
	                                >
	                                    <span className="min-w-0 truncate">{canGenerateEstimate ? generateCtaLabel : "Add scope first"}</span>
	                                    <ArrowRight className="ml-2 h-5 w-5 shrink-0" />
	                                </Button>
	                                {!canGenerateEstimate ? (
	                                    <p className="text-center text-xs leading-5 text-slate-500">
	                                        Add rough notes, record voice, or attach photos to generate.
	                                    </p>
	                                ) : null}
	                            </div>
	                        ) : null}

	                    </section>
                </div>
            )}

            {step === "transcribing" && (
                <div className="flex flex-col items-center justify-center space-y-4 py-12 animate-in fade-in">
                    <Loader2 className="h-12 w-12 animate-spin text-blue-300" />
                    <p className="text-lg font-medium text-white">Transcribing your voice...</p>
                </div>
            )}

            {step === "verifying" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-slate-200">Job Description</label>
                            <span className="text-xs text-slate-400">
                                {sourceLanguage === "es" ? "Spanish beta to English" : sourceLanguage === "ko" ? "Korean to English" : "Edit if needed"}
                            </span>
                        </div>
                        <Textarea
                            value={transcribedText}
                            onChange={(e) => setTranscribedText(e.target.value)}
                            className="min-h-[150px] text-lg p-4 leading-relaxed"
                            placeholder="Describe the job here..."
                            data-testid="job-description-input"
                        />
                    </div>

                    {previewUrls.length > 0 && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Attached Photos ({previewUrls.length})</label>
                            <div className="flex gap-2 overflow-x-auto pb-2">
                                {previewUrls.map((url, index) => (
                                    <div key={index} className="relative h-16 w-16 flex-shrink-0">
                                        <Image src={url} alt="" fill className="object-cover rounded-md" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {generateWorkflow === "photo_estimate" ? (
                        <div className="field-card space-y-3 p-4">
                            <div className="space-y-1">
                                <p className="text-sm font-semibold text-white">Photo Estimate review</p>
                                <p className="text-xs leading-5 text-slate-400">
                                    AI will return visible observations, suggested scope bullets, and likely materials. Hidden conditions should still be verified before sending.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-slate-400">Extra context for the photos</label>
                                <Textarea
                                    value={photoContext}
                                    onChange={(e) => setPhotoContext(e.target.value)}
                                    className="min-h-[88px] border-white/10 bg-slate-950/70 text-white placeholder:text-slate-500"
                                    placeholder="Add room, finish level, trade, or customer expectations before generating"
                                />
                            </div>
                        </div>
                    ) : null}

                    <Button
                        size="lg"
                        className="w-full h-14 text-lg font-semibold"
                        onClick={handleGenerateEstimate}
                        disabled={!transcribedText.trim() && images.length === 0}
                        data-testid="generate-estimate-button"
                    >
                        Generate Estimate
                        <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>

                    <Button
                        variant="ghost"
                        className="w-full"
                        onClick={() => setStep("input")}
                    >
                        Back to Recording
                    </Button>
                </div>
            )}

            {step === "generating" && (
                <div className="flex flex-col items-center justify-center space-y-4 py-12 animate-in fade-in">
                    <Loader2 className="h-12 w-12 animate-spin text-blue-300" />
                    <p className="text-lg font-medium text-white">AI is drafting your estimate...</p>
                    <p className="text-sm text-slate-400">Applying professional terminology</p>
                </div>
            )}

            {step === "result" && estimate && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                    {showDemoTutorial ? (
                        <DemoTutorialBanner
                            onDismiss={handleDismissDemoTutorial}
                            onStartBlank={handleExitDemoTutorial}
                        />
                    ) : null}
                    <section className="field-panel overflow-hidden" data-testid="estimate-result-panel">
                        <div className="border-b border-white/10 px-4 py-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Ready to review</p>
                                    <h1 className="mt-1 text-2xl font-semibold leading-tight text-white" data-testid="estimate-draft-title">
                                        Estimate Draft
                                    </h1>
                                </div>
                                <div className="text-right">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Total</p>
                                    <p className="mt-1 text-2xl font-semibold text-white">
                                        ${Math.round(resultTotal).toLocaleString()}
                                    </p>
                                </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <span
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-200"
                                    data-testid="result-generation-status"
                                >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Draft ready
                                </span>
                                <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300/25 bg-blue-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-blue-200">
                                    Review before sending
                                </span>
                            </div>
                        </div>

                        <div className="space-y-4 p-4">
                            <div
                                ref={resultQuickActionsRef}
                                className="field-card space-y-2.5 p-2.5 sm:space-y-3 sm:p-3"
                                data-testid="result-quick-actions"
                            >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Finalize</p>
                                        <p className="mt-1 text-sm font-semibold leading-5 text-white">
                                            {hasClientDetails
                                                ? "Review the essentials, then send the customer copy."
                                                : "Add customer details, then send the quote."}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-1 text-[10px] font-semibold" data-testid="result-readiness-strip">
                                        <span className={cn("rounded-md border px-1.5 py-0.5", resultClientStatusClassName)}>
                                            {hasClientDetails ? "Client ready" : "Client needed"}
                                        </span>
                                        <span className="rounded-md border border-blue-300/25 bg-blue-500/10 px-1.5 py-0.5 text-blue-200">
                                            {resultItems.length} {resultItems.length === 1 ? "line" : "lines"}
                                        </span>
                                        <span className={cn("rounded-md border px-1.5 py-0.5", resultDeliveryStatusClassName)}>
                                            {hasDeliveryContact ? "Contact ready" : "Contact needed"}
                                        </span>
                                        <span className={cn("rounded-md border px-1.5 py-0.5", resultPaymentStatusClassName)}>
                                            {hasAttachedPaymentLink ? "Payment ready" : "Payment optional"}
                                        </span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2" data-testid="result-readiness-actions">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-11 justify-center rounded-lg border-blue-300/30 bg-blue-500/10 px-2 text-xs font-semibold text-blue-100 hover:bg-blue-500/20 hover:text-white sm:justify-start sm:px-3"
                                        onClick={handleReviewLineItems}
                                        data-testid="result-review-lines-button"
                                    >
                                        <FileText className="mr-2 h-4 w-4" />
                                        Review {resultItems.length} {resultItems.length === 1 ? "line" : "lines"}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-11 justify-center rounded-lg border-emerald-300/25 bg-emerald-500/10 px-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20 hover:text-white sm:justify-start sm:px-3"
                                        onClick={handlePaymentLinkQuickAction}
                                        disabled={Boolean(isPreparingAuthRedirect)}
                                        data-testid="result-payment-link-button"
                                    >
                                        {isPreparingAuthRedirect === "payment-link" ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                            <CreditCard className="mr-2 h-4 w-4" />
                                        )}
                                        {paymentQuickActionLabel}
                                    </Button>
                                </div>
                                <div className="grid grid-cols-2 gap-2" data-testid="result-primary-actions">
                                    {hasClientDetails && hasEmailDeliveryContact ? (
                                        <>
                                            <Button
                                                size="sm"
                                                className="h-10 min-w-0 justify-center overflow-hidden rounded-lg px-2 text-sm font-semibold sm:h-11 sm:justify-start"
                                                onClick={() => setIsEmailModalOpen(true)}
                                                disabled={isTeamEstimateMode && !canEditTeamEstimate}
                                                aria-label="Send to Customer"
                                                data-testid="result-quick-send-button"
                                            >
                                                <Mail className="mr-2 h-4 w-4 shrink-0" />
                                                <span className="min-w-0 truncate sm:hidden">Email quote</span>
                                                <span className="hidden min-w-0 truncate sm:inline">Send to Customer</span>
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-10 min-w-0 justify-center overflow-hidden rounded-lg border-blue-300/30 bg-blue-500/10 px-2 text-sm font-semibold text-blue-100 hover:bg-blue-500/20 hover:text-white sm:h-11 sm:justify-start"
                                                onClick={handleSave}
                                                disabled={isSaving || teamEstimateLoading || teamSessionMutating || !canEditTeamEstimate}
                                                aria-label={isSaving ? "Saving estimate" : "Save Estimate"}
                                                data-testid="result-quick-save-button"
                                            >
                                                {isSaving ? (
                                                    <>
                                                        <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />
                                                        <span className="min-w-0 truncate">Saving...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Save className="mr-2 h-4 w-4 shrink-0" />
                                                        <span className="min-w-0 truncate sm:hidden" data-testid="result-quick-save-label">Save quote</span>
                                                        <span className="hidden min-w-0 truncate sm:inline">Save Estimate</span>
                                                    </>
                                                )}
                                                </Button>
                                        </>
                                    ) : hasClientDetails ? (
                                        <>
                                            <Button
                                                size="sm"
                                                className="h-10 min-w-0 justify-center overflow-hidden rounded-lg px-2 text-sm font-semibold sm:h-11 sm:justify-start"
                                                onClick={handleResultDeliveryContactQuickAction}
                                                disabled={isTeamEstimateMode && !canEditTeamEstimate}
                                                data-testid="result-add-contact-button"
                                            >
                                                <Mail className="mr-2 h-4 w-4 shrink-0" />
                                                <span className="min-w-0 truncate">{resultEmailActionLabel}</span>
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-10 min-w-0 justify-center overflow-hidden rounded-lg border-blue-300/30 bg-blue-500/10 px-2 text-sm font-semibold text-blue-100 hover:bg-blue-500/20 hover:text-white sm:h-11 sm:justify-start"
                                                onClick={handleSave}
                                                disabled={isSaving || teamEstimateLoading || teamSessionMutating || !canEditTeamEstimate}
                                                aria-label={isSaving ? "Saving estimate" : "Save Estimate"}
                                                data-testid="result-quick-save-button"
                                            >
                                                {isSaving ? (
                                                    <>
                                                        <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />
                                                        <span className="min-w-0 truncate">Saving...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Save className="mr-2 h-4 w-4 shrink-0" />
                                                        <span className="min-w-0 truncate sm:hidden" data-testid="result-quick-save-label">Save quote</span>
                                                        <span className="hidden min-w-0 truncate sm:inline">Save Estimate</span>
                                                    </>
                                                )}
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            <Button
                                                size="sm"
                                                className="h-10 min-w-0 justify-center overflow-hidden rounded-lg px-2 text-sm font-semibold sm:h-11"
                                                onClick={handleSave}
                                                disabled={isSaving || teamEstimateLoading || teamSessionMutating || !canEditTeamEstimate}
                                                aria-label={isSaving ? "Saving estimate" : "Save Estimate"}
                                                data-testid="result-quick-save-button"
                                            >
                                                {isSaving ? (
                                                    <>
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                        Saving...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Save className="mr-2 h-4 w-4" />
                                                        <span className="min-w-0 truncate sm:hidden" data-testid="result-quick-save-label">Save quote</span>
                                                        <span className="hidden min-w-0 truncate sm:inline">Save Estimate</span>
                                                    </>
                                                )}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-10 min-w-0 justify-center overflow-hidden rounded-lg border-blue-300/30 bg-blue-500/10 px-2 text-sm font-semibold text-blue-100 hover:bg-blue-500/20 hover:text-white sm:h-11"
                                                onClick={handleClientDetailsQuickAction}
                                                disabled={isTeamEstimateMode && !canEditTeamEstimate}
                                                data-testid="result-client-details-button"
                                            >
                                                <Users className="mr-2 h-4 w-4" />
                                                Add customer
                                            </Button>
                                        </>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="result-secondary-actions">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-11 min-w-0 justify-start overflow-hidden rounded-lg border-white/10 bg-slate-950/70 px-3 text-sm text-white hover:bg-slate-900"
                                        onClick={() => setIsSmsModalOpen(true)}
                                        disabled={isTeamEstimateMode && !canEditTeamEstimate}
                                        aria-label="Send via SMS"
                                        title="Send via SMS"
                                        data-testid="result-quick-sms-button"
                                    >
                                        <MessageSquare className="mr-2 h-4 w-4 shrink-0" />
                                        <span className="min-w-0 truncate" data-testid="result-quick-sms-label">Text quote</span>
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-11 min-w-0 justify-start overflow-hidden rounded-lg border-white/10 bg-slate-950/70 px-3 text-sm text-white hover:bg-slate-900"
                                        onClick={handleOpenPreview}
                                        aria-label="Preview"
                                        title="Preview"
                                        data-testid="result-quick-preview-button"
                                    >
                                        <Eye className="mr-2 h-4 w-4 shrink-0" />
                                        <span className="min-w-0 truncate" data-testid="result-quick-preview-label">Preview</span>
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-11 min-w-0 justify-start overflow-hidden rounded-lg border-white/10 bg-slate-950/70 px-3 text-sm text-white hover:bg-slate-900"
                                        onClick={handleDownloadPdf}
                                        disabled={isDownloadingPdf}
                                        aria-label={isDownloadingPdf ? "Creating PDF" : "Download PDF"}
                                        title={isDownloadingPdf ? "Creating PDF" : "Download PDF"}
                                        data-testid="result-quick-pdf-button"
                                    >
                                        {isDownloadingPdf ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />
                                                <span className="min-w-0 truncate" data-testid="result-quick-pdf-label">Creating</span>
                                            </>
                                        ) : (
                                            <>
                                                <Download className="mr-2 h-4 w-4 shrink-0" />
                                                <span className="min-w-0 truncate" data-testid="result-quick-pdf-label">Download</span>
                                            </>
                                        )}
                                    </Button>
                                    <Button
                                        variant={estimate.clientSignature ? "default" : "outline"}
                                        size="sm"
                                        className={cn(
                                            "h-11 min-w-0 justify-start overflow-hidden rounded-lg px-3 text-sm hover:text-white",
                                            estimate.clientSignature
                                                ? "border-emerald-300/25 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/20"
                                                : "border-white/10 bg-slate-950/70 text-white hover:bg-slate-900"
                                        )}
                                        onClick={() => setIsSignatureModalOpen(true)}
                                        aria-label={estimate.clientSignature ? "Signature Added" : "Sign & Accept"}
                                        title={estimate.clientSignature ? "Signature Added" : "Sign & Accept"}
                                        data-testid="result-quick-sign-button"
                                    >
                                        <PenTool className="mr-2 h-4 w-4 shrink-0" />
                                        <span className="min-w-0 truncate" data-testid="result-quick-sign-label">
                                            {estimate.clientSignature ? "Signed" : "Sign"}
                                        </span>
                                    </Button>
                                </div>
                            </div>

                            {estimate.photoAnalysis ? (
                                <PhotoEstimateAnalysisCard analysis={estimate.photoAnalysis} />
                            ) : null}
                            {/* Warnings */}
                            {estimate.warnings && estimate.warnings.length > 0 && (
                                <div className="rounded-lg border border-amber-300/25 bg-amber-400/10 p-3">
                                    <p className="flex items-center gap-2 text-sm font-medium text-amber-100">
                                        Warnings
                                    </p>
                                    <ul className="mt-1 list-inside list-disc text-sm text-amber-100/80">
                                        {estimate.warnings.map((warning: string, i: number) => (
                                            <li key={i}>{warning}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {estimate.upsellOptions ? (
                                <UpsellOptionsCard
                                    onApply={handleApplyUpsellOption}
                                    options={estimate.upsellOptions}
                                />
                            ) : null}
                            {/* Client Info */}
                            <div
                                ref={resultClientCardRef}
                                className={cn(
                                    "field-card scroll-mt-24 scroll-mb-28",
                                    shouldShowResultClientDetailsEditor ? "grid gap-2 p-3 sm:grid-cols-2" : "p-2.5"
                                )}
                                data-testid="result-client-details-card"
                            >
                                {!shouldShowResultClientDetailsEditor ? (
                                    <div
                                        className="flex items-center justify-between gap-3"
                                        data-testid="result-client-details-collapsed"
                                    >
                                        <div className="flex min-w-0 items-center gap-2">
                                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-300/20 bg-amber-400/10 text-amber-100">
                                                <Users className="h-4 w-4" />
                                            </span>
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-white">Customer needed</p>
                                                <p className="truncate text-xs text-slate-400">Add name, email, or phone.</p>
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1">
                                            <Button
                                                type="button"
                                                size="sm"
                                                className="h-11 min-w-11 rounded-lg px-3 text-xs"
                                                onClick={handleClientDetailsQuickAction}
                                                data-testid="result-client-details-inline-add"
                                            >
                                                Add
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-11 min-w-11 rounded-lg px-3 text-xs text-blue-300 hover:bg-blue-500/10"
                                                onClick={openClientLoadDialog}
                                                data-testid="result-load-client-button"
                                            >
                                                Load
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div>
                                            <div className="mb-1 flex items-center justify-between">
                                                <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Client</label>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="px-3 text-[11px] text-blue-300 hover:bg-blue-500/10"
                                                    onClick={openClientLoadDialog}
                                                    data-testid="result-load-client-button"
                                                >
                                                    <Users className="h-3 w-3 mr-1" /> Load
                                                </Button>
                                            </div>
                                            <Input
                                                ref={resultClientNameInputRef}
                                                value={clientName}
                                                onChange={(e) => {
                                                    setClientName(e.target.value)
                                                    setClientEmail("")
                                                    setClientPhone("")
                                                    setClientNotes("")
                                                    setIsClientContactEditorOpen(false)
                                                    setIsResultContactEditorOpen(false)
                                                    setIsResultClientDetailsOpen(true)
                                                }}
                                                placeholder="Enter client name"
                                                aria-label="Client name"
                                                className="mt-1 h-11 rounded-lg border-white/10 bg-slate-950/75 text-sm text-white placeholder:text-slate-500"
                                                data-testid="result-client-name-input"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Address</label>
                                            <Input
                                                value={clientAddress}
                                                onChange={(e) => setClientAddress(e.target.value)}
                                                placeholder="Enter client address"
                                                aria-label="Client address"
                                                className="mt-1 h-11 rounded-lg border-white/10 bg-slate-950/75 text-sm text-white placeholder:text-slate-500"
                                                data-testid="result-client-address-input"
                                            />
                                        </div>
                                        {hasDeliveryContact && !hasInvalidDeliveryContactValue && !isResultContactEditorOpen ? (
                                            <div
                                                className="sm:col-span-2 flex flex-col gap-2 rounded-lg border border-blue-300/15 bg-blue-500/10 p-2.5 sm:flex-row sm:items-center sm:justify-between"
                                                data-testid="result-client-delivery-summary"
                                            >
                                                <div className="min-w-0">
                                                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-100/75">
                                                        Delivery contact
                                                    </p>
                                                    <div className="mt-1 flex min-w-0 flex-wrap gap-1.5 text-[11px] font-medium text-blue-50">
                                                        {trimmedClientEmail ? (
                                                            <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border border-blue-200/15 bg-slate-950/45 px-2 py-1">
                                                                <Mail className="h-3 w-3 shrink-0 text-blue-200" />
                                                                <span className="min-w-0 truncate">{trimmedClientEmail}</span>
                                                            </span>
                                                        ) : null}
                                                        {trimmedClientPhone ? (
                                                            <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border border-blue-200/15 bg-slate-950/45 px-2 py-1">
                                                                <Phone className="h-3 w-3 shrink-0 text-blue-200" />
                                                                <span className="min-w-0 truncate">{trimmedClientPhone}</span>
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="shrink-0 self-start rounded-lg border border-blue-300/20 bg-blue-500/10 px-3 text-xs font-semibold text-blue-100 hover:bg-blue-500/15 sm:self-center"
                                                    onClick={() => setIsResultContactEditorOpen(true)}
                                                    data-testid="result-edit-delivery-contact-button"
                                                >
                                                    <Mail className="mr-1 h-3 w-3" />
                                                    Edit contact
                                                </Button>
                                            </div>
                                        ) : null}
                                        {shouldShowResultDeliveryContactFields ? (
                                            <>
                                                <div>
                                                    <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Delivery email</label>
                                                    <Input
                                                        ref={resultClientEmailInputRef}
                                                        type="email"
                                                        value={clientEmail}
                                                        onChange={(event) => {
                                                            setIsResultContactEditorOpen(true)
                                                            setClientEmail(event.target.value)
                                                        }}
                                                        placeholder="Email for PDF"
                                                        aria-label="Delivery email"
                                                        className="mt-1 h-11 rounded-lg border-white/10 bg-slate-950/75 text-sm text-white placeholder:text-slate-500"
                                                        data-testid="result-client-email-input"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">SMS phone</label>
                                                    <Input
                                                        type="tel"
                                                        value={clientPhone}
                                                        onChange={(event) => {
                                                            setIsResultContactEditorOpen(true)
                                                            setClientPhone(event.target.value)
                                                        }}
                                                        placeholder="Phone for SMS"
                                                        aria-label="SMS phone"
                                                        className="mt-1 h-11 rounded-lg border-white/10 bg-slate-950/75 text-sm text-white placeholder:text-slate-500"
                                                        data-testid="result-client-phone-input"
                                                    />
                                                </div>
                                            </>
                                        ) : null}
                                    </>
                                )}
                            </div>

                            <div className="field-card p-3" data-testid="summary-note-card">
                                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400" htmlFor="summary-note-textarea">Summary note</label>
                                <Textarea
                                    id="summary-note-textarea"
                                    value={estimate.summary_note}
                                    onChange={(e) => handleSummaryChange(e.target.value)}
                                    className="min-h-[86px] resize-none rounded-lg border-white/10 bg-slate-950/75 text-sm leading-6 text-slate-100 placeholder:text-slate-500 focus-visible:ring-blue-500"
                                />
                            </div>

                            <EstimateLineItemsEditor
                                estimate={estimate}
                                onAddItem={handleAddItem}
                                onAddItemToSection={handleAddItemToSection}
                                onAddSection={handleAddSection}
                                onDeleteItem={handleDeleteItem}
                                onDeleteSection={handleDeleteSection}
                                onDeleteSectionItem={handleDeleteSectionItem}
                                onEditSectionName={handleEditSectionName}
                                onItemChange={handleItemChange}
                                onOpenExcelImport={() => setIsExcelModalOpen(true)}
                                onScanReceipt={() => setIsReceiptScannerOpen(true)}
                                onSectionItemChange={handleSectionItemChange}
                                onTaxRateChange={setTaxRate}
                                resultSubtotal={resultSubtotal}
                                resultTotal={resultTotal}
                                taxRate={taxRate}
                            />

                            {/* Payment Link Toggle */}
                            <div className="field-card mt-3 space-y-2 p-2 sm:mt-4 sm:space-y-3 sm:p-3" data-testid="payment-link-card">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex min-w-0 gap-2">
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-300/25 bg-blue-500/10 text-blue-200 sm:h-9 sm:w-9">
                                            <CreditCard className="h-4 w-4" />
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-white">Customer payment</p>
                                            <p className="mt-0.5 overflow-hidden break-words text-xs leading-5 text-slate-400 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [overflow-wrap:anywhere]" data-testid="payment-link-helper">
                                                {paymentLinkHelper}
                                            </p>
                                        </div>
                                    </div>
                                    <span
                                        className={`shrink-0 rounded-lg border px-2 py-1 text-[11px] font-semibold ${paymentLinkStatusClassName}`}
                                        data-testid="payment-link-status"
                                    >
                                        {paymentLinkStatusLabel}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/55 px-3 py-1.5">
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Payment link</p>
                                        <p className="mt-0.5 break-words text-sm text-slate-200 [overflow-wrap:anywhere]" data-testid="payment-link-label">
                                            {paymentLinkLabel}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={includePaymentLink}
                                        aria-label={includePaymentLink ? "Remove payment link" : "Add payment link"}
                                        data-testid="payment-link-switch"
                                        onClick={() => void handlePaymentLinkSwitch()}
                                        disabled={isGeneratingPaymentLink || isOffline || Boolean(isPreparingAuthRedirect)}
                                        className={`relative inline-flex h-11 w-16 shrink-0 items-center rounded-full transition-colors ${includePaymentLink ? "bg-blue-500" : "bg-slate-700"
                                            } ${isGeneratingPaymentLink || isOffline || isPreparingAuthRedirect ? "opacity-50" : ""}`}
                                    >
                                        <span
                                            className={`inline-block h-8 w-8 transform rounded-full bg-white transition-transform ${includePaymentLink ? "translate-x-7" : "translate-x-1.5"
                                                }`}
                                        />
                                    </button>
                                </div>
                                {paymentLinkIssue && !hasAttachedPaymentLink ? (
                                    <div
                                        className="flex flex-col gap-3 rounded-lg border border-amber-300/20 bg-amber-400/10 p-3 sm:flex-row sm:items-center sm:justify-between"
                                        data-testid="payment-link-issue"
                                        role="alert"
                                    >
                                        <div className="flex min-w-0 gap-2">
                                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                                            <div className="min-w-0">
                                                <p className="break-words text-sm font-semibold text-amber-100 [overflow-wrap:anywhere]" data-testid="payment-link-issue-title">{paymentLinkIssue.title}</p>
                                                <p className="mt-1 break-words text-xs leading-5 text-amber-100/75 [overflow-wrap:anywhere]" data-testid="payment-link-issue-message">{paymentLinkIssue.message}</p>
                                            </div>
                                        </div>
                                        <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex sm:shrink-0" data-testid="payment-link-issue-actions">
                                            {paymentLinkIssue.actionHref && paymentLinkIssue.actionLabel ? (
                                                <Button asChild size="sm" className="h-11 w-full rounded-lg sm:w-auto" data-testid="payment-link-profile-action">
                                                    <NextLink href={paymentLinkIssue.actionHref}>
                                                        {paymentLinkIssue.actionLabel}
                                                    </NextLink>
                                                </Button>
                                            ) : null}
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-11 w-full rounded-lg border-amber-300/20 bg-slate-950/70 text-amber-100 hover:bg-amber-400/10 sm:w-auto"
                                                onClick={() => void openPaymentLinkSetup()}
                                                disabled={isGeneratingPaymentLink || isOffline || Boolean(isPreparingAuthRedirect)}
                                                data-testid="payment-link-retry-action"
                                            >
                                                Retry
                                            </Button>
                                        </div>
                                    </div>
                                ) : null}
                            </div>

                            {/* Payment Option Modal */}
                            {estimate && (
                                <PaymentOptionModal
                                    open={isPaymentModalOpen}
                                    onClose={() => setIsPaymentModalOpen(false)}
                                    totalAmount={resultTotal}
                                    onConfirm={async (amount: number, type: 'full' | 'deposit' | 'custom') => {
                                        setIsPaymentModalOpen(false)
                                        setIncludePaymentLink(true)
                                        setPaymentLinkType(type)
                                        setPaymentLinkIssue(null)
                                        setIsGeneratingPaymentLink(true)

                                        try {
                                            const headers = await withAuthHeaders({ 'Content-Type': 'application/json' })
                                            const response = await fetch('/api/create-payment-link', {
                                                method: 'POST',
                                                headers,
                                                body: JSON.stringify({
                                                    amount: amount,
                                                    customerName: clientName || 'Customer',
                                                    estimateNumber: getOrCreateDraftMeta().estimateNumber,
                                                    estimateId: getOrCreateDraftMeta().id,
                                                })
                                            })
                                            const data: unknown = await response.json().catch(() => ({}))

                                            if (!response.ok) {
                                                const errorDetails = readPaymentLinkErrorPayload(data)

                                                if (response.status === 401) {
                                                    toast("Session expired. Please sign in again.", "warning")
                                                    resetPaymentLinkState()
                                                    void redirectToLoginForEstimateIntent("payment-link")
                                                    return
                                                }

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
                                            if (typeof paymentLinkData.url !== "string" || !paymentLinkData.url.trim()) {
                                                throw new PaymentLinkCreationError(
                                                    "Payment link response was missing a URL.",
                                                    buildPaymentLinkIssue({ message: "Payment link response was missing a URL." })
                                                )
                                            }

                                            setPaymentLink(paymentLinkData.url)
                                            setPaymentLinkId(typeof paymentLinkData.id === "string" ? paymentLinkData.id : null)
                                            const draftMeta = getOrCreateDraftMeta()
                                            void trackAnalyticsEvent({
                                                event: "payment_link_created",
                                                estimateId: draftMeta.id,
                                                estimateNumber: draftMeta.estimateNumber,
                                                channel: "stripe_payment_link",
                                                metadata: {
                                                    amount,
                                                    type,
                                                },
                                            })
                                            toast("Payment link generated.", "success")
                                        } catch (error) {
                                            if (!(error instanceof PaymentLinkCreationError)) {
                                                console.error(error)
                                            }
                                            const message = error instanceof Error ? error.message : "Failed to generate payment link"
                                            const issue = error instanceof PaymentLinkCreationError
                                                ? error.issue
                                                : buildPaymentLinkIssue({ message })
                                            resetPaymentLinkState()
                                            setPaymentLinkIssue(issue)
                                        } finally {
                                            setIsGeneratingPaymentLink(false)
                                        }
                                    }}
                                />
                            )}
                            <div className="field-card mt-3 space-y-2.5 p-2.5 sm:mt-4 sm:space-y-3 sm:p-3" data-testid="handoff-actions-card">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex min-w-0 gap-2">
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-300/25 bg-blue-500/10 text-blue-200 sm:h-9 sm:w-9">
                                            <FileText className="h-4 w-4" />
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-white">Delivery</p>
                                            <p className="mt-0.5 text-xs leading-5 text-slate-400" data-testid="handoff-actions-helper">
                                                {handoffHelper}
                                            </p>
                                        </div>
                                    </div>
                                    <span
                                        className="shrink-0 rounded-lg border border-emerald-300/25 bg-emerald-400/10 px-2 py-1 text-[11px] font-semibold text-emerald-200"
                                        data-testid="handoff-actions-status"
                                    >
                                        PDF ready
                                    </span>
                                </div>
                                <div className="grid grid-cols-3 gap-1.5 text-xs font-semibold" data-testid="handoff-actions-summary">
                                    <div className="flex h-8 items-center justify-center rounded-lg border border-emerald-300/20 bg-emerald-400/10 px-2 text-emerald-100 sm:h-9">
                                        <p className="flex min-w-0 items-center gap-1" data-testid="handoff-pdf-status">
                                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                            <span className="truncate">Ready</span>
                                        </p>
                                    </div>
                                    <div className={`flex h-8 items-center justify-center rounded-lg border px-2 sm:h-9 ${handoffPaymentStatusClassName}`}>
                                        <p className="flex min-w-0 items-center gap-1" data-testid="handoff-payment-status">
                                            <CreditCard className="h-3.5 w-3.5 shrink-0" />
                                            <span className="truncate">{handoffPaymentStatusLabel}</span>
                                        </p>
                                    </div>
                                    <div className={`flex h-8 items-center justify-center rounded-lg border px-2 sm:h-9 ${subscription ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100" : "border-white/10 bg-slate-950/55 text-slate-300"}`}>
                                        <p className="flex min-w-0 items-center gap-1" data-testid="handoff-referral-status">
                                            <LinkIcon className="h-3.5 w-3.5 shrink-0" />
                                            <span className="truncate">{referralHandoffStatusLabel}</span>
                                        </p>
                                    </div>
                                </div>
                                {!subscription ? (
                                    <div
                                        className="flex min-h-10 items-center gap-2 rounded-lg border border-amber-300/20 bg-amber-400/10 px-2.5 py-1.5 sm:justify-between sm:py-2"
                                        data-testid="handoff-referral-signin"
                                    >
                                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-200" />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-[13px] font-semibold text-amber-100">Sign in to copy invites</p>
                                            <p className="sr-only text-[11px] leading-4 text-amber-100/75 sm:not-sr-only sm:mt-0.5 sm:truncate">
                                                    We will save this draft and bring you back after sign-in.
                                            </p>
                                        </div>
                                        <Button
                                            type="button"
                                            size="sm"
                                            className="shrink-0 rounded-lg px-3 text-xs"
                                            onClick={handleReferralSignIn}
                                            disabled={Boolean(isPreparingAuthRedirect)}
                                            data-testid="handoff-referral-signin-action"
                                        >
                                            {isPreparingAuthRedirect === "referral-invite" ? (
                                                <>
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    Saving draft
                                                </>
                                            ) : (
                                                <>
                                                <LogIn className="mr-2 h-4 w-4" />
                                                Sign in
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                ) : null}
                                <div className="grid grid-cols-2 gap-2">
                                    <Button
                                        variant="outline"
                                        className="h-10 justify-center rounded-lg border-blue-300/30 bg-blue-500/10 px-2.5 py-2 text-left text-blue-100 hover:bg-blue-500/20 hover:text-white sm:h-auto sm:min-h-[58px] sm:justify-start sm:px-3 sm:py-2.5"
                                        onClick={handleShare}
                                        disabled={isSharing}
                                        data-testid="result-share-pdf-button"
                                    >
                                        {isSharing ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Sharing...
                                            </>
                                        ) : (
                                            <>
                                                <Share2 className="mr-2 h-4 w-4 shrink-0" />
                                                <span className="min-w-0">
                                                    <span className="block truncate text-sm font-semibold">Share PDF</span>
                                                    <span className="sr-only truncate text-xs font-normal text-blue-100/70 sm:not-sr-only sm:block">
                                                        Customer-ready estimate
                                                    </span>
                                                </span>
                                            </>
                                        )}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="h-10 justify-center rounded-lg border-white/10 bg-slate-950/70 px-2.5 py-2 text-left text-slate-300 hover:bg-slate-900 hover:text-white sm:h-auto sm:min-h-[58px] sm:justify-start sm:px-3 sm:py-2.5"
                                        onClick={handleCopyReferralLink}
                                        disabled={isCopyingReferral}
                                        data-testid="result-referral-link-button"
                                    >
                                        {isCopyingReferral ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Preparing...
                                            </>
                                        ) : (
                                            <>
                                                <LinkIcon className="mr-2 h-4 w-4 shrink-0" />
                                                <span className="min-w-0">
                                                    <span className="block truncate text-sm font-semibold">Copy invite</span>
                                                    <span className="sr-only truncate text-xs font-normal text-slate-400 sm:not-sr-only sm:block">
                                                        {referralButtonHelper}
                                                    </span>
                                                </span>
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>

                            {isPreviewOpen && (
                                <PDFPreviewModal
                                    open={isPreviewOpen}
                                    onClose={() => setIsPreviewOpen(false)}
                                    createDocument={() => createEstimatePdfDocument({ includeSignature: true })}
                                    fileName={estimatePdfFileName}
                                    clientEmail={clientEmail}
                                    clientName={clientName}
                                    clientAddress={clientAddress}
                                    businessName={businessProfile?.business_name}
                                    estimateTotal={resultTotal}
                                    estimateItems={resultItems}
                                    summaryNote={estimate?.summary_note}
                                    taxRate={taxRate}
                                    paymentLink={includePaymentLink ? paymentLink : null}
                                />
                            )}

                        </div>
                    </section>

                    <Button
                        variant="ghost"
                        className="w-full"
                        onClick={() => setStep("verifying")}
                    >
                        Back to Edit
                    </Button>
                </div>
            )}

            {isEmailModalOpen && (
                <EmailModal
                    open={isEmailModalOpen}
                    onClose={() => setIsEmailModalOpen(false)}
                    estimateTotal={resultTotal}
                    clientEmail={clientEmail}
                    paymentLink={includePaymentLink ? paymentLink : null}
                    onSend={handleSendEstimateEmail}
                />
            )}

            {/* SMS Modal */}
            {isSmsModalOpen && (
                <SmsModal
                    open={isSmsModalOpen}
                    onClose={() => setIsSmsModalOpen(false)}
                    estimateTotal={resultTotal}
                    clientPhone={clientPhone}
                    paymentLink={includePaymentLink ? paymentLink : null}
                    businessName={businessProfile?.business_name}
                    onSend={async (toPhoneNumber, message) => {
                        try {
                            const draftMeta = getOrCreateDraftMeta()
                            const data = await sendEstimateSms({
                                toPhoneNumber,
                                message,
                                estimateId: draftMeta.id,
                            })
                            void trackAnalyticsEvent({
                                event: "quote_sent",
                                estimateId: draftMeta.id,
                                estimateNumber: draftMeta.estimateNumber,
                                channel: "sms",
                                metadata: {
                                    creditsRemaining: data.creditsRemaining,
                                },
                            })
                            await persistCurrentEstimateAsSent()
                            toast('SMS sent.', 'success')
                        } catch (error: unknown) {
                            const message = getErrorMessage(error, 'Failed to send. Try again.')
                            throw new Error(message)
                        }
                    }}
                />
            )}

            {/* Excel Import Modal */}
            <ExcelImportModal
                isOpen={isExcelModalOpen}
                onClose={() => setIsExcelModalOpen(false)}
                onImport={handleExcelImport}
            />

            {/* Receipt Scanner Modal */}
            {estimate && (
                <ReceiptScanner
                    isOpen={isReceiptScannerOpen}
                    onClose={() => setIsReceiptScannerOpen(false)}
                    onSuccess={handleReceiptParsed}
                />
            )}

            <ClientLoadDialog
                clients={availableClients}
                onAddClient={() => {
                    setIsClientModalOpen(false)
                    router.push('/clients')
                }}
                onOpenChange={setIsClientModalOpen}
                onSelectClient={(client) => {
                    setClientName(client.name)
                    setClientAddress(client.address || "")
                    setClientEmail(client.email || "")
                    setClientPhone(client.phone || "")
                    setClientNotes(client.notes || "")
                    setIsClientContactEditorOpen(false)
                    setIsInputClientDetailsOpen(false)
                    setIsResultContactEditorOpen(false)
                    setIsResultClientDetailsOpen(false)
                    setIsClientModalOpen(false)
                    if (step === "result") {
                        window.setTimeout(() => {
                            resultQuickActionsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
                        }, 250)
                    }
                    toast(
                        step === "result"
                            ? `Loaded ${client.name}. Delivery actions are ready.`
                            : `Loaded ${client.name}.`,
                        "success"
                    )
                }}
                open={isClientModalOpen}
            />
            {/* Signature Modal */}
            <Dialog open={isSignatureModalOpen} onOpenChange={setIsSignatureModalOpen}>
                <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-2xl overflow-hidden p-0">
                    <DialogHeader>
                        <div className="border-b border-white/10 p-4 pr-16">
                            <DialogTitle>Sign Estimate</DialogTitle>
                            <DialogDescription className="mt-1">
                                Capture customer approval before marking the estimate as sent.
                            </DialogDescription>
                        </div>
                    </DialogHeader>
                    <div className="overflow-y-auto p-4">
                        <SignaturePad
                            onSave={async (signature) => {
                                if (!estimate) return
                                const signedAt = new Date().toISOString()

                                setEstimate({
                                    ...estimate,
                                    clientSignature: signature,
                                    signedAt,
                                    status: 'sent'
                                })

                                try {
                                    await persistCurrentEstimateAsSent({ clientSignature: signature, signedAt })
                                    toast("Signature captured and estimate marked sent.", "success")
                                } catch (error) {
                                    console.error("Signature save failed:", error)
                                    toast("Signature captured, but save failed. Download the PDF before leaving.", "warning")
                                }

                                setIsSignatureModalOpen(false)
                            }}
                            onCancel={() => setIsSignatureModalOpen(false)}
                        />
                    </div>
                </DialogContent>
            </Dialog>

        </div>
    )
}

export default function NewEstimatePage() {
    return (
        <Suspense fallback={<div className="field-app min-h-screen" />}>
            <NewEstimatePageContent />
        </Suspense>
    )
}
