"use client"

import { Suspense, useState, useRef, useEffect, useCallback, useMemo } from "react"
import { AlertTriangle, ArrowRight, Camera, CheckCircle2, ClipboardList, CreditCard, Download, Eye, FileText, Link as LinkIcon, Loader2, LogIn, Mail, MapPin, MessageSquare, Mic, PenTool, Phone, RefreshCw, Save, Share2, SlidersHorizontal, Sparkles, Users, X } from "lucide-react"
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
import type { BusinessInfo, EstimateItem, EstimateSection, LocalEstimate } from "@/lib/estimates-storage"
import { normalizeCategory, normalizeEstimateItem, normalizeEstimatePayload, normalizeUnit, toSafeNumber, type EstimateDraft } from "@/lib/estimates/normalize"
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
import {
    appendCustomerPortalLink,
    createCustomerPortalLinkForEstimate,
    getCustomerPortalEstimateUpdates,
    maybeCreateCustomerPortalLinkForEstimate,
} from "@/lib/customer-portal-client"
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

type CustomerRevisionContext = {
    originalEstimateId?: string
    originalEstimateNumber?: string
    requestedAt?: string
    customerName?: string
    customerEmail?: string
    note?: string
}

type EstimateResumeIntent = "payment-link" | "referral-invite" | "approval-link"
type ApprovalLinkStatus = "included" | "signin" | "offline" | "saving"
type QuotaIssueMetric = "generate" | "transcribe" | "send_email"

type QuotaIssue = {
    metric: QuotaIssueMetric
    title: string
    message: string
    toastMessage: string
}

type GenerationIssue = {
    title: string
    message: string
    actionHref?: string
    actionLabel?: string
}

type PdfDeliveryIssue = {
    kind: "share" | "download" | "sent_status"
    title: string
    message: string
}

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

function getOptionalString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function getEffectiveCustomerPaymentLink(paymentLink: string | null, businessProfile?: BusinessInfo): string {
    return paymentLink?.trim() || businessProfile?.payment_link?.trim() || ""
}

function getQuotaIssue(metric: QuotaIssueMetric): QuotaIssue {
    if (metric === "transcribe") {
        return {
            metric,
            title: "Voice quota reached",
            message: "Your field notes are still saved here. Upgrade from Pricing to process more recordings this month, or type the scope manually and keep moving.",
            toastMessage: "Monthly voice quota reached. Your capture is still saved.",
        }
    }

    if (metric === "send_email") {
        return {
            metric,
            title: "Email quota reached",
            message: "The estimate is still available. Upgrade from Pricing to send more PDF emails this month, or download the PDF and send it manually.",
            toastMessage: "Monthly email quota reached. Download the PDF or upgrade to keep sending.",
        }
    }

    return {
        metric,
        title: "AI draft quota reached",
        message: "Your capture is still saved in the composer. Upgrade from Pricing for more AI drafts this month, or save the field capture and finish later.",
        toastMessage: "Monthly AI generation quota reached. Your capture is still saved.",
    }
}

function buildGenerationIssue(message: string): GenerationIssue {
    const normalizedMessage = message.toLowerCase()

    if (normalizedMessage.includes("network") || normalizedMessage.includes("fetch")) {
        return {
            title: "AI draft paused by connection",
            message: "Your field notes and photos are still here. Reconnect and try again, or save the capture to Drafts before leaving.",
        }
    }

    if (normalizedMessage.includes("photo estimate") || normalizedMessage.includes("pro or team")) {
        return {
            title: "Photo Estimate is not available yet",
            message: "Your photos and notes are still in the composer. Open Pricing to unlock Photo Estimate, retry with the right plan, or switch to manual line entry.",
            actionHref: "/pricing?source=photo_estimate_generation",
            actionLabel: "Open Pricing",
        }
    }

    return {
        title: "AI draft did not finish",
        message: "Your field capture is still in the composer. Retry the AI draft, save it to Drafts, or switch to manual line entry.",
    }
}

function buildPdfDeliveryIssue(kind: PdfDeliveryIssue["kind"]): PdfDeliveryIssue {
    if (kind === "sent_status") {
        return {
            kind,
            title: "PDF prepared, but status was not saved",
            message: "The customer PDF was prepared. Retry sharing to mark the estimate sent, or download the PDF and send it manually before leaving.",
        }
    }

    if (kind === "download") {
        return {
            kind,
            title: "PDF download did not finish",
            message: "The estimate is still here. Retry the PDF download, preview it, or keep editing the quote before trying again.",
        }
    }

    return {
        kind,
        title: "PDF share did not finish",
        message: "The customer PDF was built, but the share step did not complete. Retry sharing or download the PDF and send it manually.",
    }
}

function getCustomerRevisionContextFromDraft(draft: Record<string, unknown>): CustomerRevisionContext | null {
    const rawContext = draft.revisionContext
    if (!rawContext || typeof rawContext !== "object" || Array.isArray(rawContext)) return null

    const context = rawContext as Record<string, unknown>
    const revisionContext: CustomerRevisionContext = {
        originalEstimateId: getOptionalString(context.originalEstimateId),
        originalEstimateNumber: getOptionalString(context.originalEstimateNumber),
        requestedAt: getOptionalString(context.requestedAt),
        customerName: getOptionalString(context.customerName),
        customerEmail: getOptionalString(context.customerEmail),
        note: getOptionalString(context.note),
    }

    return Object.values(revisionContext).some(Boolean) ? revisionContext : null
}

function getDraftAttachments(draft: Record<string, unknown>): Record<string, unknown> | null {
    if (!draft.attachments || typeof draft.attachments !== "object" || Array.isArray(draft.attachments)) return null
    return draft.attachments as Record<string, unknown>
}

function getDraftAttachmentPhotos(draft: Record<string, unknown>): string[] {
    const attachments = getDraftAttachments(draft)
    if (!attachments || !Array.isArray(attachments.photos)) return []
    return attachments.photos.filter((photo): photo is string => typeof photo === "string" && photo.trim().length > 0)
}

function getDraftOriginalTranscript(draft: Record<string, unknown>): string {
    const attachments = getDraftAttachments(draft)
    return typeof attachments?.originalTranscript === "string" ? attachments.originalTranscript.trim() : ""
}

function getDraftScopeAssumptionsConfirmedAt(draft: Record<string, unknown>): string | null {
    const attachments = getDraftAttachments(draft)
    if (typeof attachments?.scopeAssumptionsConfirmedAt !== "string") return null

    const confirmedAt = attachments.scopeAssumptionsConfirmedAt.trim()
    return confirmedAt ? confirmedAt : null
}

function hasDraftLineItems(draft: Record<string, unknown>): boolean {
    if (Array.isArray(draft.items) && draft.items.length > 0) return true
    if (!Array.isArray(draft.sections)) return false

    return draft.sections.some((section) => {
        if (!section || typeof section !== "object" || Array.isArray(section)) return false
        const items = (section as Record<string, unknown>).items
        return Array.isArray(items) && items.length > 0
    })
}

function isCaptureOnlyDraftRecord(draft: Record<string, unknown>): boolean {
    const status = typeof draft.status === "string" ? draft.status : "draft"
    if (status !== "draft") return false
    if (hasDraftLineItems(draft)) return false
    if (toSafeNumber(draft.totalAmount) > 0) return false

    const summaryNote = typeof draft.summary_note === "string" ? draft.summary_note.trim() : ""
    return Boolean(summaryNote || getDraftOriginalTranscript(draft) || getDraftAttachmentPhotos(draft).length > 0)
}

function getCaptureResumeText(draft: Record<string, unknown>): string {
    const originalTranscript = getDraftOriginalTranscript(draft)
    if (originalTranscript) return originalTranscript

    return typeof draft.summary_note === "string" ? draft.summary_note.trim() : ""
}

function getCaptureResumePhotoContext(draft: Record<string, unknown>): string {
    if (typeof draft.summary_note !== "string") return ""

    const match = draft.summary_note.match(/(?:^|\n)Photo context:\s*([^\n]+)/i)
    return match?.[1]?.trim() || ""
}

function buildCaptureNarrative(notes: string, photoContext: string): string {
    const trimmedNotes = notes.trim()
    const trimmedPhotoContext = photoContext.trim()
    if (!trimmedPhotoContext) return trimmedNotes

    const photoContextLine = `Photo context: ${trimmedPhotoContext}`
    if (!trimmedNotes) return photoContextLine
    if (trimmedNotes.toLowerCase().includes(photoContextLine.toLowerCase())) return trimmedNotes

    return `${trimmedNotes}\n\n${photoContextLine}`
}

function dataUrlToFile(dataUrl: string, index: number): File | null {
    if (typeof File === "undefined" || typeof atob === "undefined") return null

    const [header, payload] = dataUrl.split(",")
    const mimeMatch = header?.match(/^data:([^;]+);base64$/)
    if (!mimeMatch || !payload) return null

    try {
        const mimeType = mimeMatch[1] || "image/jpeg"
        const binary = atob(payload)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i)
        }
        const extension = mimeType.split("/")[1] || "jpg"
        return new File([bytes], `saved-site-photo-${index + 1}.${extension}`, {
            type: mimeType,
            lastModified: Date.now(),
        })
    } catch {
        return null
    }
}

function formatRevisionRequestDate(value?: string): string {
    if (!value) return ""

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ""

    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

type Step = "input" | "transcribing" | "verifying" | "generating" | "result"
type SourceLanguage = "auto" | "en" | "es" | "ko"
type GenerateWorkflow = "standard" | "photo_estimate"
type CaptureIntent = "voice" | "photos" | "type"
type ProjectType = "residential" | "commercial"
type ScopeGuidancePrompt = {
    id: "work" | "cost" | "site"
    label: string
    title: string
    helper: string
    template: string
}

type UnsentCaptureDraft = {
    version: 1
    updatedAt: string
    captureIntent: CaptureIntent
    transcribedText: string
    photoContext: string
    generateWorkflow: GenerateWorkflow
    sourceLanguage: SourceLanguage
    projectType: ProjectType
    clientName: string
    clientAddress: string
    clientEmail: string
    clientPhone: string
    clientNotes: string
    clientDetailsOpen: boolean
}

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
const UNSENT_CAPTURE_DRAFT_KEY = "snapquote_unsent_capture_draft"
const UNSENT_CAPTURE_DRAFT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 3
const SCOPE_ACTION_PATTERN = /\b(replace|install|repair|fix|remove|add|test|inspect|service|clean|paint|wire|plumb|frame|patch|seal|mount|connect|diagnos(?:e|is))\b/i
const SCOPE_MATERIAL_PATTERN = /\b(material|part|labor|hour|hr|valve|pipe|wire|fixture|panel|paint|drywall|tile|cartridge|assembly|permit|cleanup|haul|disposal|trim|shutoff|drain|breaker|outlet)\b/i
const SCOPE_CONDITION_PATTERN = /\b(leak\w*|damage|access|under|behind|ceiling|crawl|attic|pressure|height|old|existing|photo|condition|customer|request|around|area|before|after)\b/i
const SCOPE_GUIDANCE_PROMPTS: Record<ScopeGuidancePrompt["id"], ScopeGuidancePrompt> = {
    work: {
        id: "work",
        label: "Add work",
        title: "Work to perform",
        helper: "Name the repair, install, test, or cleanup.",
        template: "Work to perform: ",
    },
    cost: {
        id: "cost",
        label: "Add cost drivers",
        title: "Materials or labor",
        helper: "List parts, labor hours, finish level, or owner-supplied items.",
        template: "Materials/labor: ",
    },
    site: {
        id: "site",
        label: "Add site context",
        title: "Site conditions",
        helper: "Add access, location, measurements, damage, or hidden conditions.",
        template: "Site/context: ",
    },
}
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

function parseSourceLanguage(value: unknown): SourceLanguage {
    if (value === "auto" || value === "en" || value === "es" || value === "ko") return value
    return "auto"
}

function parseGenerateWorkflow(value: unknown): GenerateWorkflow {
    return value === "photo_estimate" ? "photo_estimate" : "standard"
}

function parseProjectType(value: unknown): ProjectType {
    return value === "commercial" ? "commercial" : "residential"
}

function getRecordString(record: Record<string, unknown>, key: string): string {
    const value = record[key]
    return typeof value === "string" ? value : ""
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
    const [scopeAssumptionsConfirmedAt, setScopeAssumptionsConfirmedAt] = useState<string | null>(null)
    const [isPreparingAuthRedirect, setIsPreparingAuthRedirect] = useState<EstimateResumeIntent | null>(null)
    const [authenticatedResumeIntent, setAuthenticatedResumeIntent] = useState<{
        intent: EstimateResumeIntent
        expectsDraft: boolean
    } | null>(null)
    const [taxRate, setTaxRate] = useState(13)
    const [clientName, setClientName] = useState("")
    const [clientAddress, setClientAddress] = useState("")
    const [clientEmail, setClientEmail] = useState("")
    const [clientPhone, setClientPhone] = useState("")
    const [clientNotes, setClientNotes] = useState("")
    const [revisionContext, setRevisionContext] = useState<CustomerRevisionContext | null>(null)
    const [isClientContactEditorOpen, setIsClientContactEditorOpen] = useState(false)
    const [isInputClientDetailsOpen, setIsInputClientDetailsOpen] = useState(false)
    const [isResultContactEditorOpen, setIsResultContactEditorOpen] = useState(false)
    const [isResultClientDetailsOpen, setIsResultClientDetailsOpen] = useState(false)
    const [businessProfile, setBusinessProfile] = useState<BusinessInfo | undefined>(undefined)
    const [canCreateCustomerPortalLinks, setCanCreateCustomerPortalLinks] = useState(false)
    const [isPreviewOpen, setIsPreviewOpen] = useState(false)
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false)
    const [isSmsModalOpen, setIsSmsModalOpen] = useState(false)
    const [isExcelModalOpen, setIsExcelModalOpen] = useState(false)
    const [isOffline, setIsOffline] = useState(false)
    const [pendingAudioId, setPendingAudioId] = useState<string | null>(null)
    const [projectType, setProjectType] = useState<ProjectType>('residential')
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
    const [quotaIssue, setQuotaIssue] = useState<QuotaIssue | null>(null)
    const [generationIssue, setGenerationIssue] = useState<GenerationIssue | null>(null)
    const [pdfDeliveryIssue, setPdfDeliveryIssue] = useState<PdfDeliveryIssue | null>(null)
    const [teamEstimateContext, setTeamEstimateContext] = useState<TeamEstimateDetailResponse["estimate"] | null>(null)
    const [teamEstimateSession, setTeamEstimateSession] = useState<TeamEstimateSessionResponse["session"] | null>(null)
    const [teamEstimateLoading, setTeamEstimateLoading] = useState(false)
    const [teamSessionMutating, setTeamSessionMutating] = useState(false)
    const [savedCaptureDraftFingerprint, setSavedCaptureDraftFingerprint] = useState("")

    const fileInputRef = useRef<HTMLInputElement>(null)
    const notesTextareaRef = useRef<HTMLTextAreaElement>(null)
    const draftMetaRef = useRef<{ id: string; estimateNumber: string; createdAt?: string } | null>(null)
    const handledPaymentIntentRef = useRef(false)
    const handledReferralIntentRef = useRef(false)
    const handledApprovalLinkIntentRef = useRef(false)
    const suppressPostAuthDraftToastRef = useRef(false)
    const handledClientPrefillRef = useRef(false)
    const handledReceiptPrefillRef = useRef(false)
    const handledTimeEntryPrefillRef = useRef(false)
    const hasHandledUnsentCaptureRestoreRef = useRef(false)
    const canPersistUnsentCaptureDraftRef = useRef(false)
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
    const trimmedScopeText = transcribedText.trim()
    const trimmedPhotoContext = photoContext.trim()
    const captureNarrative = buildCaptureNarrative(transcribedText, photoContext)
    const combinedScopeText = [trimmedScopeText, trimmedPhotoContext].filter(Boolean).join(" ")
    const scopeWordCount = combinedScopeText ? combinedScopeText.split(/\s+/).filter(Boolean).length : 0
    const scopeTextLength = combinedScopeText.length
    const hasPhotoScope = images.length > 0
    const hasScopeWorkAction = SCOPE_ACTION_PATTERN.test(combinedScopeText) || scopeTextLength >= 40
    const hasScopeMaterialOrLabor = SCOPE_MATERIAL_PATTERN.test(combinedScopeText) || scopeWordCount >= 12 || hasPhotoScope
    const hasScopeSiteContext = SCOPE_CONDITION_PATTERN.test(combinedScopeText) || scopeWordCount >= 18 || hasPhotoScope
    const scopeDetailScore = [hasScopeWorkAction, hasScopeMaterialOrLabor, hasScopeSiteContext].filter(Boolean).length
    const scopeDetailStatusLabel = !canGenerateEstimate
        ? "Needs scope"
        : scopeDetailScore >= 3
            ? "Quote-ready scope"
            : scopeDetailScore >= 2
                ? "Good start"
                : "Thin scope"
    const scopeDetailStatusClassName = !canGenerateEstimate
        ? "text-amber-200"
        : scopeDetailScore >= 3
            ? "text-emerald-200"
            : scopeDetailScore >= 2
                ? "text-blue-200"
                : "text-amber-200"
    const missingScopeDetailLabel = !canGenerateEstimate
        ? activeCaptureIntent === "photos" ? "Add photos or rough notes" : "Start with the work requested"
        : !hasScopeWorkAction
            ? "work to perform"
            : !hasScopeMaterialOrLabor
                ? "materials or labor"
                : !hasScopeSiteContext
                    ? "site context"
                    : "Ready for AI draft"
    const scopeDetailHelper = !canGenerateEstimate
        ? missingScopeDetailLabel
        : scopeDetailScore >= 3
            ? "Scope has work, cost drivers, and site context."
            : `Add ${missingScopeDetailLabel} for a cleaner draft.`
    const scopeDetailMessage = scopeDetailScore >= 3 ? "Ready for AI draft." : scopeDetailHelper
    const scopeDetailQuickHelper = !canGenerateEstimate
        ? "Type notes."
        : scopeDetailScore >= 3
            ? "Ready."
            : !hasScopeWorkAction
                ? "Add work."
                : !hasScopeMaterialOrLabor
                    ? "Add cost."
                    : "Add site."
    const scopeReadinessLabel = canGenerateEstimate
        ? "Scope ready"
        : activeCaptureIntent === "photos"
            ? "Add photos or notes"
            : activeCaptureIntent === "type"
                ? "Add rough scope"
                : "Record or type scope"
    const scopeGuidancePrompts = useMemo(() => {
        if (!canGenerateEstimate || scopeDetailScore >= 3) return []

        const prompts: ScopeGuidancePrompt[] = []
        if (!hasScopeWorkAction) prompts.push(SCOPE_GUIDANCE_PROMPTS.work)
        if (!hasScopeMaterialOrLabor) prompts.push(SCOPE_GUIDANCE_PROMPTS.cost)
        if (!hasScopeSiteContext) prompts.push(SCOPE_GUIDANCE_PROMPTS.site)

        return prompts.slice(0, 2)
    }, [
        canGenerateEstimate,
        hasScopeMaterialOrLabor,
        hasScopeSiteContext,
        hasScopeWorkAction,
        scopeDetailScore,
    ])
    const clientReadinessLabel = hasClientContext ? trimmedClientName : "Client later"
    const deliveryReadinessLabel = hasDeliveryContact ? "Delivery ready" : "Before sending"
    const hasInputCaptureDraftContent = Boolean(
        transcribedText.trim()
        || photoContext.trim()
        || images.length > 0
        || clientName.trim()
        || clientAddress.trim()
        || clientEmail.trim()
        || clientPhone.trim()
        || clientNotes.trim()
    )
    const inputCaptureDraftFingerprint = useMemo(() => JSON.stringify({
        captureIntent: activeCaptureIntent,
        transcribedText,
        photoContext,
        generateWorkflow,
        sourceLanguage,
        projectType,
        clientName,
        clientAddress,
        clientEmail,
        clientPhone,
        clientNotes,
        clientDetailsOpen: isInputClientDetailsOpen,
        images: images.map((image) => `${image.name}:${image.size}:${image.lastModified}`),
    }), [
        activeCaptureIntent,
        clientAddress,
        clientEmail,
        clientName,
        clientNotes,
        clientPhone,
        generateWorkflow,
        images,
        isInputClientDetailsOpen,
        photoContext,
        projectType,
        sourceLanguage,
        transcribedText,
    ])
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

    const handleAddScopeGuidancePrompt = useCallback((prompt: ScopeGuidancePrompt) => {
        setTranscribedText((currentText) => {
            const trimmedText = currentText.trimEnd()
            return trimmedText ? `${trimmedText}\n${prompt.template}` : prompt.template
        })

        window.requestAnimationFrame(() => {
            notesTextareaRef.current?.focus()
        })
    }, [])

    const openManualEntry = useCallback(() => {
        setCaptureIntent("type")
        setStep("verifying")
        replaceComposerUrl("/new-estimate?mode=manual")
    }, [replaceComposerUrl])

    const clearUnsentCaptureDraft = useCallback(() => {
        if (typeof window === "undefined") return
        window.localStorage.removeItem(UNSENT_CAPTURE_DRAFT_KEY)
    }, [])

    const restoreUnsentCaptureDraft = useCallback((options: { requestedCaptureIntent?: CaptureIntent | null } = {}) => {
        if (typeof window === "undefined") return false

        const rawValue = window.localStorage.getItem(UNSENT_CAPTURE_DRAFT_KEY)
        if (!rawValue) return false

        try {
            const parsedValue: unknown = JSON.parse(rawValue)
            if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) {
                clearUnsentCaptureDraft()
                return false
            }

            const record = parsedValue as Record<string, unknown>
            if (record.version !== 1) {
                clearUnsentCaptureDraft()
                return false
            }

            const updatedAt = getRecordString(record, "updatedAt")
            const updatedAtTime = Date.parse(updatedAt)
            if (!updatedAt || Number.isNaN(updatedAtTime) || Date.now() - updatedAtTime > UNSENT_CAPTURE_DRAFT_MAX_AGE_MS) {
                clearUnsentCaptureDraft()
                return false
            }

            const restoredTranscribedText = getRecordString(record, "transcribedText")
            const restoredPhotoContext = getRecordString(record, "photoContext")
            const restoredClientName = getRecordString(record, "clientName")
            const restoredClientAddress = getRecordString(record, "clientAddress")
            const restoredClientEmail = getRecordString(record, "clientEmail")
            const restoredClientPhone = getRecordString(record, "clientPhone")
            const restoredClientNotes = getRecordString(record, "clientNotes")
            const hasRestorableDraft = Boolean(
                restoredTranscribedText.trim()
                || restoredPhotoContext.trim()
                || restoredClientName.trim()
                || restoredClientAddress.trim()
                || restoredClientEmail.trim()
                || restoredClientPhone.trim()
                || restoredClientNotes.trim()
            )

            if (!hasRestorableDraft) {
                clearUnsentCaptureDraft()
                return false
            }

            const restoredCaptureIntent = parseCaptureIntent(getRecordString(record, "captureIntent")) ?? "type"
            if (options.requestedCaptureIntent && restoredCaptureIntent !== options.requestedCaptureIntent) {
                return false
            }

            const restoredGenerateWorkflow = parseGenerateWorkflow(record.generateWorkflow)
            const restoredClientDetailsOpen = record.clientDetailsOpen === true || Boolean(
                restoredClientAddress.trim()
                || restoredClientEmail.trim()
                || restoredClientPhone.trim()
                || restoredClientNotes.trim()
            )

            setCaptureIntent(restoredCaptureIntent)
            setTranscribedText(restoredTranscribedText)
            setPhotoContext(restoredPhotoContext)
            setGenerateWorkflow(restoredGenerateWorkflow)
            setSourceLanguage(parseSourceLanguage(record.sourceLanguage))
            setProjectType(parseProjectType(record.projectType))
            setClientName(restoredClientName)
            setClientAddress(restoredClientAddress)
            setClientEmail(restoredClientEmail)
            setClientPhone(restoredClientPhone)
            setClientNotes(restoredClientNotes)
            setIsInputClientDetailsOpen(restoredClientDetailsOpen)
            setStep("input")
            toast("Recovered unsent field notes from this device.", "info")
            return true
        } catch (error) {
            console.error("Failed to restore unsent capture draft:", error)
            clearUnsentCaptureDraft()
            return false
        }
    }, [clearUnsentCaptureDraft])

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
        clearUnsentCaptureDraft()
        resetPaymentLinkState()
        const draftClientName = typeof draft.clientName === "string" ? draft.clientName : ""
        const draftClientAddress = typeof draft.clientAddress === "string" ? draft.clientAddress : ""
        const draftClientEmail = typeof draft.clientEmail === "string" ? draft.clientEmail : ""
        const draftClientPhone = typeof draft.clientPhone === "string" ? draft.clientPhone : ""
        const draftClientNotes = typeof draft.clientNotes === "string" ? draft.clientNotes : ""
        const draftTaxRate = typeof draft.taxRate === "number" ? draft.taxRate : 13

        if (isCaptureOnlyDraftRecord(draft)) {
            const attachmentPhotos = getDraftAttachmentPhotos(draft)
            const photoEntries = attachmentPhotos
                .map((url, index) => ({ file: dataUrlToFile(url, index), url }))
                .filter((entry): entry is { file: File; url: string } => Boolean(entry.file))
            const resumedPhotos = photoEntries.map((entry) => entry.file)
            const resumedPreviewUrls = photoEntries.map((entry) => entry.url)
            const resumedTranscript = getCaptureResumeText(draft)

            setEstimate(null)
            setClientName(draftClientName)
            setClientAddress(draftClientAddress)
            setClientEmail(draftClientEmail)
            setClientPhone(draftClientPhone)
            setClientNotes(draftClientNotes)
            setRevisionContext(null)
            setIsClientContactEditorOpen(false)
            setIsInputClientDetailsOpen(Boolean(draftClientName || draftClientAddress || draftClientEmail || draftClientPhone || draftClientNotes))
            setIsResultContactEditorOpen(false)
            setIsResultClientDetailsOpen(false)
            setTaxRate(draftTaxRate)
            setAudioBlob(null)
            setImages(resumedPhotos)
            setPreviewUrls(resumedPreviewUrls)
            setTranscribedText(resumedTranscript)
            setGenerateWorkflow(resumedPhotos.length > 0 ? "photo_estimate" : "standard")
            setPhotoContext(getCaptureResumePhotoContext(draft))
            setCaptureIntent(resumedPhotos.length > 0 && !resumedTranscript.trim() ? "photos" : "type")
            setSourceLanguage("auto")
            setProjectType("residential")
            setScopeAssumptionsConfirmedAt(null)
            setStep("input")
            setShowDemoTutorial(false)

            toast("Field capture loaded. Generate when ready.", "success")
            return
        }

        const draftOriginalTranscript = getDraftOriginalTranscript(draft)

        setEstimate(normalizeEstimatePayload(draft))
        setClientName(draftClientName)
        setClientAddress(draftClientAddress)
        setClientEmail(draftClientEmail)
        setClientPhone(draftClientPhone)
        setClientNotes(draftClientNotes)
        setRevisionContext(getCustomerRevisionContextFromDraft(draft))
        setIsClientContactEditorOpen(false)
        setIsInputClientDetailsOpen(false)
        setIsResultContactEditorOpen(false)
        setIsResultClientDetailsOpen(false)
        setTaxRate(draftTaxRate)
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
        setTranscribedText(draftOriginalTranscript)
        setGenerateWorkflow("standard")
        setPhotoContext(getCaptureResumePhotoContext(draft))
        setScopeAssumptionsConfirmedAt(getDraftScopeAssumptionsConfirmedAt(draft))
        setStep("result")
        setShowDemoTutorial(Boolean(options?.tutorial))

        if (options?.toastMessage) {
            toast(options.toastMessage, "success")
        }
    }, [clearUnsentCaptureDraft, resetDraftMeta, resetPaymentLinkState])

    const applyTeamEstimateToComposer = useCallback((detail: TeamEstimateDetailResponse["estimate"]) => {
        draftMetaRef.current = {
            id: detail.estimateId,
            estimateNumber: detail.estimateNumber,
        }
        clearUnsentCaptureDraft()
        resetPaymentLinkState()
        setTeamEstimateContext(detail)
        setRevisionContext(null)
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
        setScopeAssumptionsConfirmedAt(null)
        setShowDemoTutorial(false)
        setStep("result")
    }, [clearUnsentCaptureDraft, resetPaymentLinkState])

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
        clearUnsentCaptureDraft()
        resetPaymentLinkState()
        setEstimate(null)
        setClientName("")
        setClientAddress("")
        setClientEmail("")
        setClientPhone("")
        setClientNotes("")
        setRevisionContext(null)
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
    }, [businessProfile?.tax_rate, clearUnsentCaptureDraft, replaceComposerUrl, resetDraftMeta, resetPaymentLinkState])

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
        const markUnsentCaptureRestoreHandled = (canPersist = true) => {
            hasHandledUnsentCaptureRestoreRef.current = true
            canPersistUnsentCaptureDraftRef.current = canPersist
        }
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
            markUnsentCaptureRestoreHandled()
            return
        }

        if (tutorialMode) {
            loadDraftIntoComposer(createDemoEstimateDraft(), {
                tutorial: true,
            })
            markUnsentCaptureRestoreHandled()
            return
        }

        if (draftId) {
            markUnsentCaptureRestoreHandled(false)
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
            }).finally(() => {
                canPersistUnsentCaptureDraftRef.current = true
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

            markUnsentCaptureRestoreHandled()
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

            markUnsentCaptureRestoreHandled()
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

            markUnsentCaptureRestoreHandled()
            return
        }

        if (manualMode) {
            setStep("verifying")
            markUnsentCaptureRestoreHandled()
            return
        }

        if (teamEstimateId) {
            markUnsentCaptureRestoreHandled(false)
            void loadTeamEstimate(teamEstimateId).finally(() => {
                canPersistUnsentCaptureDraftRef.current = true
            })
            return
        }

        if (!hasHandledUnsentCaptureRestoreRef.current) {
            restoreUnsentCaptureDraft({ requestedCaptureIntent })
            hasHandledUnsentCaptureRestoreRef.current = true
        }
        canPersistUnsentCaptureDraftRef.current = true
    }, [loadDraftIntoComposer, loadTeamEstimate, replaceComposerUrl, restoreUnsentCaptureDraft, searchParams])

    useEffect(() => {
        if (!canPersistUnsentCaptureDraftRef.current) return
        if (estimate || (step !== "input" && step !== "verifying")) return

        const draftPayload: UnsentCaptureDraft = {
            version: 1,
            updatedAt: new Date().toISOString(),
            captureIntent: activeCaptureIntent,
            transcribedText,
            photoContext,
            generateWorkflow,
            sourceLanguage,
            projectType,
            clientName,
            clientAddress,
            clientEmail,
            clientPhone,
            clientNotes,
            clientDetailsOpen: isInputClientDetailsOpen,
        }
        const hasDraftContent = Boolean(
            transcribedText.trim()
            || photoContext.trim()
            || clientName.trim()
            || clientAddress.trim()
            || clientEmail.trim()
            || clientPhone.trim()
            || clientNotes.trim()
        )

        const saveTimer = window.setTimeout(() => {
            try {
                if (!hasDraftContent || inputCaptureDraftFingerprint === savedCaptureDraftFingerprint) {
                    clearUnsentCaptureDraft()
                    return
                }

                window.localStorage.setItem(UNSENT_CAPTURE_DRAFT_KEY, JSON.stringify(draftPayload))
            } catch (error) {
                console.error("Failed to save unsent capture draft:", error)
            }
        }, 250)

        return () => window.clearTimeout(saveTimer)
    }, [
        activeCaptureIntent,
        clearUnsentCaptureDraft,
        clientAddress,
        clientEmail,
        clientName,
        clientNotes,
        clientPhone,
        estimate,
        generateWorkflow,
        inputCaptureDraftFingerprint,
        isInputClientDetailsOpen,
        photoContext,
        projectType,
        savedCaptureDraftFingerprint,
        sourceLanguage,
        step,
        transcribedText,
    ])

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
                                const issue = getQuotaIssue("transcribe")
                                setQuotaIssue(issue)
                                toast(issue.toastMessage, "warning")
                                continue
                            }

                            if (response.ok) {
                                const data = await response.json()
                                setQuotaIssue(null)
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
        if (handledApprovalLinkIntentRef.current) return
        if (typeof window === "undefined") return
        const params = new URLSearchParams(window.location.search)
        const intent = params.get("intent")
        if (intent !== "approval-link") return
        handledApprovalLinkIntentRef.current = true
        const expectsDraft = Boolean(params.get("draftId"))

        void (async () => {
            const headers = await withAuthHeaders()
            if (!headers.authorization) {
                toast("Sign in to include customer approval links.", "warning")
                return
            }

            setCanCreateCustomerPortalLinks(true)
            setAuthenticatedResumeIntent({ intent: "approval-link", expectsDraft })
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
            const resumeMessage = authenticatedResumeIntent.intent === "payment-link"
                ? "Login confirmed. Add job details to continue payment setup."
                : authenticatedResumeIntent.intent === "referral-invite"
                    ? "Login confirmed. Add job details to create referral invites."
                    : "Login confirmed. Add job details to include approval links."
            toast(
                resumeMessage,
                "success"
            )
            setAuthenticatedResumeIntent(null)
            return
        }

        if (authenticatedResumeIntent.intent === "payment-link") {
            toast("Login confirmed. Continue payment link setup.", "success")
            setIsPaymentModalOpen(true)
        } else if (authenticatedResumeIntent.intent === "referral-invite") {
            toast("Login confirmed. Referral invites are ready to copy.", "success")
            window.setTimeout(() => {
                document
                    .querySelector('[data-testid="handoff-actions-card"]')
                    ?.scrollIntoView({ behavior: "smooth", block: "center" })
            }, 0)
        } else {
            setCanCreateCustomerPortalLinks(true)
            toast("Login confirmed. Approval links will be included when you send.", "success")
            window.setTimeout(() => {
                document
                    .querySelector('[data-testid="result-primary-actions"]')
                    ?.scrollIntoView({ behavior: "smooth", block: "center" })
            }, 0)
        }

        setAuthenticatedResumeIntent(null)
    }, [authenticatedResumeIntent, estimate, step])

    useEffect(() => {
        let active = true

        const refreshCustomerPortalAuth = async () => {
            const headers = await withAuthHeaders()
            if (active) {
                setCanCreateCustomerPortalLinks(Boolean(headers.authorization))
            }
        }

        void refreshCustomerPortalAuth()

        return () => {
            active = false
        }
    }, [])

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
        setQuotaIssue(null)

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
                const issue = getQuotaIssue("transcribe")
                setQuotaIssue(issue)
                throw new Error(issue.toastMessage)
            }

            if (!response.ok) throw new Error("Transcription failed")

            const data = await response.json()
            setQuotaIssue(null)
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
            setGenerationIssue(buildGenerationIssue("network"))
            toast("No internet connection. Please connect and try again.", "warning")
            return
        }

        if (generateWorkflow === "photo_estimate" && images.length === 0) {
            toast("Add at least one jobsite photo to run Photo Estimate.", "warning")
            return
        }

        setScopeAssumptionsConfirmedAt(null)
        setQuotaIssue(null)
        setGenerationIssue(null)
        setStep("generating")
        let generatedQuotaIssue: QuotaIssue | null = null
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
                    notes: captureNarrative,
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
                    if (generateWorkflow === "photo_estimate") {
                        throw new Error("Photo Estimate requires a Pro or Team plan.")
                    }

                    const issue = getQuotaIssue("generate")
                    generatedQuotaIssue = issue
                    setQuotaIssue(issue)
                    throw new Error(issue.toastMessage)
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
            clearUnsentCaptureDraft()
            setQuotaIssue(null)
            setGenerationIssue(null)
            setPdfDeliveryIssue(null)
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

            if (generatedQuotaIssue) {
                setGenerationIssue(null)
            } else {
                setGenerationIssue(buildGenerationIssue(errorMessage))
            }
            toast(errorMessage, "error")
            setStep("verifying")
        }
    }

    async function handleSaveCaptureDraft() {
        if (!hasInputCaptureDraftContent) {
            toast("Add field notes, photos, or client details before saving.", "warning")
            return
        }

        setIsSaving(true)
        try {
            const nowIso = new Date().toISOString()
            const draftMeta = getOrCreateDraftMeta()
            const attachmentPhotos = await Promise.all(images.map(fileToDataUrl))
            const summaryParts = [
                transcribedText.trim(),
                photoContext.trim()
                    ? `Photo context: ${photoContext.trim()}`
                    : "",
                !transcribedText.trim() && images.length > 0
                    ? `${images.length} jobsite photo${images.length === 1 ? "" : "s"} captured before AI draft.`
                    : "",
            ].filter(Boolean)
            const summaryNote = summaryParts.length > 0
                ? summaryParts.join("\n\n")
                : "Field notes captured before AI draft."
            const captureDraft: LocalEstimate = {
                id: draftMeta.id,
                estimateNumber: draftMeta.estimateNumber,
                type: "estimate",
                items: [],
                summary_note: summaryNote,
                clientName: clientName.trim(),
                clientEmail: trimmedClientEmail || undefined,
                clientPhone: trimmedClientPhone || undefined,
                clientAddress: clientAddress.trim(),
                clientNotes: trimmedClientNotes || undefined,
                taxRate,
                taxAmount: 0,
                totalAmount: 0,
                createdAt: draftMeta.createdAt || nowIso,
                status: "draft",
                attachments: (attachmentPhotos.length > 0 || captureNarrative)
                    ? {
                        photos: attachmentPhotos,
                        originalTranscript: captureNarrative || undefined,
                    }
                    : undefined,
                updatedAt: nowIso,
                synced: false,
            }

            await saveEstimate(captureDraft)
            setSavedCaptureDraftFingerprint(inputCaptureDraftFingerprint)
            clearUnsentCaptureDraft()
            void trackAnalyticsEvent({
                event: "draft_saved",
                estimateId: captureDraft.id,
                estimateNumber: captureDraft.estimateNumber,
                metadata: {
                    captureOnly: true,
                    hasClient: Boolean(captureDraft.clientName),
                    hasAttachments: Boolean(captureDraft.attachments),
                    scopeDetailScore,
                },
            })
            toast("Field capture saved to Drafts.", "success")
        } catch (error) {
            console.error("Failed to save field capture draft:", error)
            toast("Failed to save. Storage might be full.", "error")
        } finally {
            setIsSaving(false)
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
    const hasClientDetails = Boolean(clientName.trim())
    const lineReviewMetrics = useMemo(() => {
        const missingDescriptionCount = resultItems.filter((item) => item.description.trim().length === 0).length
        const missingPriceCount = resultItems.filter((item) => toSafeNumber(item.unit_price, 0) <= 0 || lineTotal(item) <= 0).length
        const missingQuantityCount = resultItems.filter((item) => toSafeNumber(item.quantity, 0) <= 0).length
        const emptyEstimateCount = resultItems.length === 0 ? 1 : 0
        const issueCount = missingDescriptionCount + missingPriceCount + missingQuantityCount + emptyEstimateCount

        return {
            emptyEstimateCount,
            issueCount,
            missingDescriptionCount,
            missingPriceCount,
            missingQuantityCount,
        }
    }, [resultItems])
    const hasLineReviewIssues = lineReviewMetrics.issueCount > 0
    const resultLineReadinessLabel = hasLineReviewIssues
        ? `${lineReviewMetrics.issueCount} line ${lineReviewMetrics.issueCount === 1 ? "fix" : "fixes"}`
        : `${resultItems.length} ${resultItems.length === 1 ? "line" : "lines"} ready`
    const resultLineReviewButtonLabel = lineReviewMetrics.emptyEstimateCount > 0
        ? "Add line items"
        : hasLineReviewIssues
            ? `Fix ${lineReviewMetrics.issueCount} line ${lineReviewMetrics.issueCount === 1 ? "issue" : "issues"}`
            : `Review ${resultItems.length} ${resultItems.length === 1 ? "line" : "lines"}`
    const resultLineReviewButtonShortLabel = lineReviewMetrics.emptyEstimateCount > 0
        ? "Lines"
        : hasLineReviewIssues
            ? "Fix lines"
            : "Lines"
    const shouldShowResultScopeConfidenceCard = Boolean(estimate) && canGenerateEstimate && scopeDetailScore < 3
    const confirmedScopeAssumptions = Boolean(scopeAssumptionsConfirmedAt)
    const hasConfirmedScopeAssumptions = shouldShowResultScopeConfidenceCard && confirmedScopeAssumptions
    const hasUnconfirmedResultScopeAssumptions = shouldShowResultScopeConfidenceCard && !confirmedScopeAssumptions
    const resultScopeConfidenceLabel = hasConfirmedScopeAssumptions
        ? "Confirmed"
        : scopeDetailScore >= 2
            ? "Medium confidence"
            : "Low confidence"
    const resultScopeConfidenceClassName = hasConfirmedScopeAssumptions
        ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
        : scopeDetailScore >= 2
            ? "border-blue-300/25 bg-blue-500/10 text-blue-100"
            : "border-amber-300/25 bg-amber-400/10 text-amber-100"
    const resultScopeConfidenceCardClassName = hasConfirmedScopeAssumptions
        ? "rounded-lg border border-emerald-300/25 bg-emerald-500/10 p-3"
        : "rounded-lg border border-amber-300/25 bg-amber-500/10 p-3"
    const resultScopeConfidenceIconClassName = hasConfirmedScopeAssumptions
        ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
        : "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-300/25 bg-amber-300/10 text-amber-100"
    const resultScopeAssumptionActionLabel = hasConfirmedScopeAssumptions ? "Reviewed" : "Confirm"
    const resultScopeConfidenceHelper = hasConfirmedScopeAssumptions
        ? "Scope assumptions reviewed for customer delivery."
        : scopeDetailScore >= 2
            ? "AI had a usable scope, but one field detail is still worth confirming before sending."
            : "AI had limited field detail. Treat line items and pricing as assumptions until reviewed."
    const handleConfirmScopeAssumptions = useCallback(() => {
        dismissToasts()
        setScopeAssumptionsConfirmedAt(new Date().toISOString())
        toast("Scope assumptions confirmed for customer delivery.", "success")
    }, [])
    const requestScopeAssumptionsConfirmation = useCallback((message: string) => {
        if (!hasUnconfirmedResultScopeAssumptions) return false

        dismissToasts()
        toast(message, "warning")
        scrollElementIntoBottomSafeView(
            document.querySelector('[data-testid="result-scope-confidence-card"]'),
            { block: "center" },
        )
        return true
    }, [hasUnconfirmedResultScopeAssumptions])
    const handleOpenEmailModal = useCallback(() => {
        if (requestScopeAssumptionsConfirmation("Confirm scope assumptions before emailing this estimate.")) return

        setIsEmailModalOpen(true)
    }, [requestScopeAssumptionsConfirmation])
    const handleOpenSmsModal = useCallback(() => {
        if (requestScopeAssumptionsConfirmation("Confirm scope assumptions before texting this estimate.")) return

        setIsSmsModalOpen(true)
    }, [requestScopeAssumptionsConfirmation])
    const handleReviewSourceNotes = useCallback(() => {
        dismissToasts()
        setScopeAssumptionsConfirmedAt(null)
        setStep("input")
        window.requestAnimationFrame(() => {
            notesTextareaRef.current?.focus()
        })
    }, [])
    const sendReadinessIssues = useMemo(() => {
        const issues: string[] = []

        if (!hasClientDetails) {
            issues.push("customer")
        }

        if (!hasDeliveryContact) {
            issues.push("delivery contact")
        } else if (hasInvalidDeliveryContactValue) {
            issues.push("valid contact")
        }

        if (hasLineReviewIssues) {
            issues.push("line item review")
        }

        return issues
    }, [hasClientDetails, hasDeliveryContact, hasInvalidDeliveryContactValue, hasLineReviewIssues])
    const sendReadinessStatusLabel = sendReadinessIssues.length === 0
        ? "Ready to send"
        : `${sendReadinessIssues.length} ${sendReadinessIssues.length === 1 ? "fix" : "fixes"} before send`
    const sendReadinessHelper = sendReadinessIssues.length === 0
        ? "Customer, delivery contact, and line items are ready for the customer copy."
        : `Next: ${sendReadinessIssues[0]}.`
    const sendReadinessStatusClassName = sendReadinessIssues.length === 0
        ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
        : "border-amber-300/25 bg-amber-400/10 text-amber-100"
    const handleReviewLineItems = useCallback((options: { focusGate?: boolean } = {}) => {
        dismissToasts()
        const lineEditingBlock = document.querySelector('[data-testid="line-items-editing-block"]')
        const flatLineItems = document.querySelector('[data-testid="flat-line-items-list"]')
        const firstLineItem = document.querySelector('[data-testid="line-item-row-0"]')
        const reviewSummary = document.querySelector('[data-testid="line-items-review-summary"]')
        const target = options.focusGate
            ? reviewSummary ?? lineEditingBlock ?? flatLineItems ?? firstLineItem
            : lineEditingBlock ?? flatLineItems ?? firstLineItem ?? reviewSummary
        scrollElementIntoBottomSafeView(target, { block: "center" })
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
    const attachedPaymentLink = hasAttachedPaymentLink ? paymentLink : null
    const effectiveCustomerPaymentLink = useMemo(
        () => getEffectiveCustomerPaymentLink(attachedPaymentLink, businessProfile),
        [attachedPaymentLink, businessProfile],
    )
    const hasApprovalPaymentFallback = Boolean(effectiveCustomerPaymentLink) && !hasAttachedPaymentLink
    const customerApprovalLinkStatus: ApprovalLinkStatus = isPreparingAuthRedirect === "approval-link"
        ? "saving"
        : isOffline
            ? "offline"
            : canCreateCustomerPortalLinks
                ? "included"
                : "signin"
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
    const paymentQuickActionShortLabel = isPreparingAuthRedirect === "payment-link"
        ? "Saving"
        : hasAttachedPaymentLink
            ? "Attached"
            : paymentLinkIssue
                ? "Fix"
                : isOffline
                    ? "Offline"
                    : isGeneratingPaymentLink
                        ? "Creating"
                        : "Payment"
    const shouldShowResultClientDetailsEditor = hasClientDetails || isResultClientDetailsOpen
    const resultClientStatusClassName = hasClientDetails
        ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200"
        : "border-amber-300/25 bg-amber-400/10 text-amber-200"
    const resultDeliveryStatusClassName = hasDeliveryContact
        ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200"
        : "border-amber-300/25 bg-amber-400/10 text-amber-200"
    const resultEmailActionLabel = trimmedClientEmail && !hasEmailDeliveryContact ? "Fix email" : "Add email"
    const resultEmailActionShortLabel = trimmedClientEmail && !hasEmailDeliveryContact ? "Fix" : "Email"
    const resultPaymentStatusClassName = hasAttachedPaymentLink
        ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200"
        : paymentLinkIssue || isOffline
            ? "border-amber-300/25 bg-amber-400/10 text-amber-200"
            : "border-white/10 bg-slate-950/60 text-slate-400"
    const hasHandoffScopeAssumptions = hasUnconfirmedResultScopeAssumptions
    const handoffHelper = pdfDeliveryIssue
        ? pdfDeliveryIssue.message
        : hasHandoffScopeAssumptions
        ? "Confirm scope assumptions before sharing."
        : hasAttachedPaymentLink
            ? "PDF includes payment and final line items."
            : "PDF is ready; payment and referral are optional."
    const handoffStatusLabel = pdfDeliveryIssue
        ? "Retry PDF"
        : hasHandoffScopeAssumptions ? "Scope check" : "PDF ready"
    const handoffStatusClassName = pdfDeliveryIssue || hasHandoffScopeAssumptions
        ? "border-amber-300/25 bg-amber-400/10 text-amber-100"
        : "border-emerald-300/25 bg-emerald-400/10 text-emerald-200"
    const sharePdfHelper = hasHandoffScopeAssumptions ? "Review assumptions first" : "Customer-ready estimate"
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
    const revisionRequestedLabel = formatRevisionRequestDate(revisionContext?.requestedAt)
    const revisionOriginalLabel = revisionContext?.originalEstimateNumber
        ? `Original #${revisionContext.originalEstimateNumber}`
        : "Customer revision"
    const revisionCustomerLabel = revisionContext?.customerName || clientName || "Customer"

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
        overrides: {
            clientSignature?: string
            signedAt?: string
            customerPortalUrl?: string
            customerPortalStatus?: "shared" | "viewed" | "approved" | "change_requested"
            customerViewedAt?: string
            customerApprovedAt?: string
            customerChangeRequestedAt?: string
            customerPortalName?: string
            customerPortalEmail?: string
            customerPortalNote?: string
        } = {}
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
        const scopeAssumptionsConfirmedAtForPayload = hasConfirmedScopeAssumptions
            ? scopeAssumptionsConfirmedAt || new Date().toISOString()
            : undefined

        const attachments = {
            photos: attachmentPhotos,
            originalTranscript: captureNarrative || undefined,
            scopeAssumptionsConfirmedAt: scopeAssumptionsConfirmedAtForPayload,
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
            paymentCompletedAt: teamEstimateContext?.paymentCompletedAt,
            paymentLink: includePaymentLink && paymentLink ? paymentLink : undefined,
            paymentLinkId: includePaymentLink && paymentLinkId ? paymentLinkId : undefined,
            paymentLinkType: includePaymentLink && paymentLinkType ? paymentLinkType : undefined,
            customerPortalUrl: overrides.customerPortalUrl,
            customerPortalStatus: overrides.customerPortalStatus,
            customerViewedAt: overrides.customerViewedAt,
            customerApprovedAt: overrides.customerApprovedAt,
            customerChangeRequestedAt: overrides.customerChangeRequestedAt,
            customerPortalName: overrides.customerPortalName,
            customerPortalEmail: overrides.customerPortalEmail,
            customerPortalNote: overrides.customerPortalNote,
            revisionOfEstimateId: revisionContext?.originalEstimateId,
            revisionOfEstimateNumber: revisionContext?.originalEstimateNumber,
            revisionRequestedAt: revisionContext?.requestedAt,
            clientSignature: overrides.clientSignature ?? estimate.clientSignature,
            signedAt: overrides.signedAt ?? estimate.signedAt,
            attachments: (attachmentPhotos.length > 0 || captureNarrative || scopeAssumptionsConfirmedAtForPayload) ? attachments : undefined,
            synced: false,
        }
    }, [
        estimate,
        taxRate,
        images,
        captureNarrative,
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
        teamEstimateContext?.paymentCompletedAt,
        revisionContext,
        hasConfirmedScopeAssumptions,
        scopeAssumptionsConfirmedAt,
    ])

    const prepareCustomerPortalLinkForDelivery = useCallback(async (pendingSentEstimate: LocalEstimate) => {
        const portalOptions = {
            resetCustomerDecision: true,
            paymentLinkOverride: effectiveCustomerPaymentLink,
            paymentLinkTypeOverride: attachedPaymentLink?.trim() ? (paymentLinkType || "custom") : "custom",
        } as const

        if (canCreateCustomerPortalLinks) {
            return createCustomerPortalLinkForEstimate(pendingSentEstimate, portalOptions)
        }

        return maybeCreateCustomerPortalLinkForEstimate(pendingSentEstimate, portalOptions)
    }, [
        attachedPaymentLink,
        canCreateCustomerPortalLinks,
        effectiveCustomerPaymentLink,
        paymentLinkType,
    ])

    const buildLoginNextPathWithDraft = useCallback(async () => {
        if (!estimate) return "/new-estimate"

        const localEstimate = await buildLocalEstimatePayload("draft")
        await saveEstimate(localEstimate)
        return `/new-estimate?draftId=${encodeURIComponent(localEstimate.id)}`
    }, [buildLocalEstimatePayload, estimate])

    const redirectToLoginForEstimateIntent = useCallback(async (intent: EstimateResumeIntent) => {
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

    const handleApprovalLinkSetup = useCallback(async () => {
        if (!navigator.onLine) {
            toast("Customer approval links require internet connection.", "warning")
            return
        }

        const headers = await withAuthHeaders()
        if (headers.authorization) {
            setCanCreateCustomerPortalLinks(true)
            toast("Approval links will be included when you send.", "success")
            return
        }

        setIsEmailModalOpen(false)
        setIsSmsModalOpen(false)
        await redirectToLoginForEstimateIntent("approval-link")
    }, [redirectToLoginForEstimateIntent])

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
            paymentCompletedAt: result.estimate.paymentCompletedAt || localEstimate.paymentCompletedAt,
            synced: true,
        }
    }, [teamEstimateContext])

    const persistCurrentEstimateAsSent = useCallback(async (
        overrides: Parameters<typeof buildLocalEstimatePayload>[1] = {}
    ) => {
        if (isTeamEstimateMode && !canEditTeamEstimate) {
            throw new Error("Claim the Team editing session before sending.")
        }

        const nextEstimate = await buildLocalEstimatePayload("sent", overrides)
        const persistedEstimate = await persistTeamEstimateToCloud(nextEstimate)
        const existing = (await getEstimates()).find((entry) => entry.id === nextEstimate.id)

        if (!existing) {
            await saveEstimate(persistedEstimate)
            if (revisionContext?.originalEstimateId && revisionContext.originalEstimateId !== persistedEstimate.id) {
                await updateEstimate(revisionContext.originalEstimateId, {
                    supersededByEstimateId: persistedEstimate.id,
                    supersededAt: new Date().toISOString(),
                    synced: false,
                })
            }
            return persistedEstimate
        }

        const sentAt = existing.sentAt || persistedEstimate.sentAt || new Date().toISOString()
        const nextPersistedEstimate = {
            ...persistedEstimate,
            createdAt: existing.createdAt,
            sentAt,
            status: "sent",
            synced: isTeamEstimateMode ? true : false,
        } as const
        await updateEstimate(existing.id, nextPersistedEstimate)

        if (revisionContext?.originalEstimateId && revisionContext.originalEstimateId !== existing.id) {
            await updateEstimate(revisionContext.originalEstimateId, {
                supersededByEstimateId: existing.id,
                supersededAt: new Date().toISOString(),
                synced: false,
            })
        }

        return { ...existing, ...nextPersistedEstimate }
    }, [buildLocalEstimatePayload, canEditTeamEstimate, isTeamEstimateMode, persistTeamEstimateToCloud, revisionContext])

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
        if (requestScopeAssumptionsConfirmation("Confirm scope assumptions before sharing this PDF.")) return

        setIsSharing(true)
        setPdfDeliveryIssue(null)
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
            const pendingSentEstimate = await buildLocalEstimatePayload("sent")
            const portalResult = await maybeCreateCustomerPortalLinkForEstimate(pendingSentEstimate, {
                resetCustomerDecision: true,
                paymentLinkOverride: effectiveCustomerPaymentLink,
                paymentLinkTypeOverride: attachedPaymentLink?.trim() ? (paymentLinkType || "custom") : "custom",
            })
            const portalUpdates = portalResult ? getCustomerPortalEstimateUpdates(portalResult) : {}
            const shareText = appendCustomerPortalLink(
                `Estimate Total: $${total.toFixed(2)}`,
                portalResult?.shareUrl,
                "email",
            )
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: `Estimate ${draftMeta.estimateNumber}`,
                    text: shareText,
                    files: [file],
                })
                deliveredPdf = true
                await persistCurrentEstimateAsSent(portalUpdates)
                void trackAnalyticsEvent({
                    event: "quote_sent",
                    estimateId: draftMeta.id,
                    estimateNumber: draftMeta.estimateNumber,
                    channel: "share_pdf",
                    metadata: {
                        fileName,
                        nativeShare: true,
                        hasPaymentLink: Boolean(effectiveCustomerPaymentLink),
                        hasCustomerPortalLink: Boolean(portalResult?.shareUrl),
                    },
                })
                if (portalResult) {
                    void trackAnalyticsEvent({
                        event: "customer_portal_link_created",
                        estimateId: draftMeta.id,
                        estimateNumber: draftMeta.estimateNumber,
                        channel: "share_pdf",
                        metadata: {
                            portalStatus: portalUpdates.customerPortalStatus,
                        },
                    })
                }
                toast(
                    portalResult
                        ? "PDF shared with approval link. Estimate marked sent."
                        : "PDF shared. Estimate marked sent.",
                    "success"
                )
                setPdfDeliveryIssue(null)
            } else {
                downloadBlobAsFile(blob, fileName)
                deliveredPdf = true
                if (portalResult?.shareUrl && navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(portalResult.shareUrl).catch(() => undefined)
                }
                await persistCurrentEstimateAsSent(portalUpdates)
                void trackAnalyticsEvent({
                    event: "quote_sent",
                    estimateId: draftMeta.id,
                    estimateNumber: draftMeta.estimateNumber,
                    channel: "share_pdf_download",
                    metadata: {
                        fileName,
                        nativeShare: false,
                        hasPaymentLink: Boolean(effectiveCustomerPaymentLink),
                        hasCustomerPortalLink: Boolean(portalResult?.shareUrl),
                    },
                })
                if (portalResult) {
                    void trackAnalyticsEvent({
                        event: "customer_portal_link_created",
                        estimateId: draftMeta.id,
                        estimateNumber: draftMeta.estimateNumber,
                        channel: "share_pdf_download",
                        metadata: {
                            portalStatus: portalUpdates.customerPortalStatus,
                        },
                    })
                }
                toast(
                    portalResult
                        ? "PDF downloaded. Approval link copied and estimate marked sent."
                        : "PDF downloaded for sharing. Estimate marked sent.",
                    "success"
                )
                setPdfDeliveryIssue(null)
            }
        } catch (error) {
            if (isShareCanceledError(error)) {
                toast("Share canceled.", "info")
                return
            }
            console.error("Share failed:", error)
            setPdfDeliveryIssue(buildPdfDeliveryIssue(deliveredPdf ? "sent_status" : "share"))
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
        if (requestScopeAssumptionsConfirmation("Confirm scope assumptions before creating the customer PDF.")) return
        setIsDownloadingPdf(true)
        setPdfDeliveryIssue(null)
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
            setPdfDeliveryIssue(null)
            toast(`PDF downloaded as ${fileName}.`, "success")
        } catch (error) {
            console.error("Download PDF failed:", error)
            setPdfDeliveryIssue(buildPdfDeliveryIssue("download"))
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
        setQuotaIssue(null)
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
            const pendingSentEstimate = await buildLocalEstimatePayload("sent")
            const portalResult = await prepareCustomerPortalLinkForDelivery(pendingSentEstimate)
            const messageWithApprovalLink = appendCustomerPortalLink(message, portalResult?.shareUrl, "email")
            const headers = await withAuthHeaders({ "Content-Type": "application/json" })

            const response = await fetch("/api/send-email", {
                method: "POST",
                headers,
                body: JSON.stringify({
                    email,
                    subject: `Estimate from ${businessProfile?.business_name || "SnapQuote"}`,
                    message: messageWithApprovalLink,
                    pdfBase64,
                    businessName: businessProfile?.business_name,
                    referralUrl: referralUrl || undefined,
                })
            })

            if (!response.ok) {
                const errorData = await response.json().catch((): { error?: unknown } => ({}))
                if (response.status === 402) {
                    const issue = getQuotaIssue("send_email")
                    setQuotaIssue(issue)
                    throw new Error(issue.toastMessage)
                }
                throw new Error(typeof errorData.error === "string" ? errorData.error : "Failed to send email")
            }

            const data = await response.json()

            if (data.method === "mailto") {
                window.open(data.mailtoUrl, "_blank")
                toast("Email client opened. Please attach the PDF.", "warning")
            } else {
                const draftMeta = getOrCreateDraftMeta()
                const portalUpdates = portalResult ? getCustomerPortalEstimateUpdates(portalResult) : {}
                void trackAnalyticsEvent({
                    event: "quote_sent",
                    estimateId: draftMeta.id,
                    estimateNumber: draftMeta.estimateNumber,
                    channel: "email",
                    metadata: {
                        recipient: email,
                        hasPaymentLink: Boolean(effectiveCustomerPaymentLink),
                        hasCustomerPortalLink: Boolean(portalResult?.shareUrl),
                    },
                })
                if (portalResult) {
                    void trackAnalyticsEvent({
                        event: "customer_portal_link_created",
                        estimateId: draftMeta.id,
                        estimateNumber: draftMeta.estimateNumber,
                        channel: "estimate_email",
                        metadata: {
                            portalStatus: portalUpdates.customerPortalStatus,
                        },
                    })
                }
                await persistCurrentEstimateAsSent(portalUpdates)
                setQuotaIssue(null)
                toast("Email sent with PDF attached.", "success")
            }
        } catch (error: unknown) {
            const message = getErrorMessage(error, "Failed to send. Try again.")
            throw new Error(message)
        }
    }, [
        businessProfile,
        buildLocalEstimatePayload,
        createEstimatePdfDocument,
        effectiveCustomerPaymentLink,
        getOrCreateDraftMeta,
        persistCurrentEstimateAsSent,
        prepareCustomerPortalLinkForDelivery,
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

            {quotaIssue ? (
                <section
                    className="rounded-lg border border-amber-300/25 bg-amber-400/10 p-4 text-amber-50"
                    data-testid="quota-upgrade-prompt"
                >
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-300/30 bg-amber-300/10">
                            <AlertTriangle className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="font-semibold" data-testid="quota-upgrade-title">{quotaIssue.title}</p>
                            <p className="mt-1 text-sm leading-6 text-amber-50/80" data-testid="quota-upgrade-message">
                                {quotaIssue.message}
                            </p>
                            <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
                                <Button asChild size="sm" className="h-10 rounded-lg" data-testid="quota-upgrade-pricing-link">
                                    <NextLink href={`/pricing?source=${quotaIssue.metric}_quota`}>
                                        Open Pricing
                                    </NextLink>
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-10 rounded-lg border-amber-200/25 bg-slate-950/50 text-amber-50 hover:bg-slate-900 hover:text-white"
                                    onClick={() => setQuotaIssue(null)}
                                    data-testid="quota-upgrade-dismiss"
                                >
                                    Keep editing
                                </Button>
                            </div>
                        </div>
                    </div>
                </section>
            ) : null}

            {generationIssue ? (
                <section
                    className="rounded-lg border border-blue-300/25 bg-blue-500/10 p-4 text-blue-50"
                    data-testid="generation-recovery-prompt"
                    role="alert"
                >
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-blue-300/30 bg-blue-300/10">
                            <AlertTriangle className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="font-semibold" data-testid="generation-recovery-title">{generationIssue.title}</p>
                            <p className="mt-1 text-sm leading-6 text-blue-50/80" data-testid="generation-recovery-message">
                                {generationIssue.message}
                            </p>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                {generationIssue.actionHref && generationIssue.actionLabel ? (
                                    <Button asChild size="sm" className="h-11 rounded-lg" data-testid="generation-recovery-primary-link">
                                        <NextLink href={generationIssue.actionHref}>
                                            <Sparkles className="mr-2 h-4 w-4" />
                                            {generationIssue.actionLabel}
                                        </NextLink>
                                    </Button>
                                ) : null}
                                <Button
                                    type="button"
                                    size="sm"
                                    className="h-11 rounded-lg"
                                    onClick={() => void handleGenerateEstimate()}
                                    disabled={!canGenerateEstimate}
                                    data-testid="generation-recovery-retry-action"
                                >
                                    <Sparkles className="mr-2 h-4 w-4" />
                                    Try again
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-11 rounded-lg border-blue-200/25 bg-slate-950/50 text-blue-50 hover:bg-slate-900 hover:text-white"
                                    onClick={() => void handleSaveCaptureDraft()}
                                    disabled={!hasInputCaptureDraftContent || isSaving}
                                    data-testid="generation-recovery-save-action"
                                >
                                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    Save capture
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-11 rounded-lg border-blue-200/25 bg-slate-950/50 text-blue-50 hover:bg-slate-900 hover:text-white"
                                    onClick={openManualEntry}
                                    data-testid="generation-recovery-manual-action"
                                >
                                    <FileText className="mr-2 h-4 w-4" />
                                    Manual line entry
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-11 rounded-lg text-blue-50 hover:bg-blue-400/10 hover:text-white"
                                    onClick={() => setGenerationIssue(null)}
                                    data-testid="generation-recovery-dismiss-action"
                                >
                                    <X className="mr-2 h-4 w-4" />
                                    Keep editing
                                </Button>
                            </div>
                        </div>
                    </div>
                </section>
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
                                                <p className="truncate text-[11px] text-slate-400" data-testid="quick-generate-scope-helper">{scopeDetailQuickHelper}</p>
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
                                {scopeGuidancePrompts.length > 0 ? (
                                    <div className="rounded-lg border border-amber-300/20 bg-amber-500/10 p-3" data-testid="scope-guidance-card">
                                        <div className="flex items-start gap-2">
                                            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-100" />
                                            <div className="min-w-0">
                                                <p className="text-xs font-semibold text-amber-50">Sharpen AI draft</p>
                                                <p className="mt-1 text-[11px] leading-4 text-slate-300" data-testid="scope-guidance-summary">
                                                    Add the missing detail now while you are still looking at the job.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="mt-2 grid gap-2">
                                            {scopeGuidancePrompts.map((prompt) => (
                                                <button
                                                    key={prompt.id}
                                                    type="button"
                                                    className="min-h-11 rounded-lg border border-white/10 bg-slate-950/55 px-3 py-2 text-left transition hover:border-amber-200/30 hover:bg-amber-400/10"
                                                    onClick={() => handleAddScopeGuidancePrompt(prompt)}
                                                    data-testid={`scope-guidance-prompt-${prompt.id}`}
                                                >
                                                    <span className="flex items-center justify-between gap-3">
                                                        <span className="min-w-0">
                                                            <span className="block text-xs font-semibold text-white">{prompt.title}</span>
                                                            <span className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-slate-400">{prompt.helper}</span>
                                                        </span>
                                                        <span className="shrink-0 rounded-md bg-amber-300/10 px-2 py-1 text-[10px] font-semibold text-amber-100">
                                                            {prompt.label}
                                                        </span>
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
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
                                                if (!revisionContext) setClientNotes("")
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
                                        <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-blue-200" />
                                        Details
                                    </span>
                                    <span className={cn("truncate", scopeDetailStatusClassName)} data-testid="input-scope-detail-status">
                                        {scopeDetailStatusLabel}
                                    </span>
                                </div>
                                <p className="rounded-lg border border-blue-300/15 bg-slate-950/45 px-2.5 py-2 text-xs leading-5 text-slate-300" data-testid="input-scope-next-detail">
                                    {scopeDetailMessage}
                                </p>
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
                                    data-testid="photo-context-input"
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

	                        <Button
	                            type="button"
	                            variant="outline"
	                            className="mt-3 h-11 w-full justify-between rounded-lg border-white/10 bg-slate-950/55 px-3 text-sm font-semibold text-slate-200 hover:border-blue-300/25 hover:bg-blue-500/10 hover:text-white"
	                            onClick={handleSaveCaptureDraft}
	                            disabled={!hasInputCaptureDraftContent || isSaving}
	                            data-testid="input-save-capture-draft-button"
	                        >
	                            <span className="inline-flex min-w-0 items-center gap-2">
	                                {isSaving ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Save className="h-4 w-4 shrink-0" />}
	                                <span className="truncate">{isSaving ? "Saving capture" : "Save capture"}</span>
	                            </span>
	                            <ArrowRight className="h-4 w-4 shrink-0 text-blue-200" />
	                        </Button>

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
                            ref={notesTextareaRef}
                            value={transcribedText}
                            onChange={(e) => setTranscribedText(e.target.value)}
                            className="min-h-[150px] text-lg p-4 leading-relaxed"
                            placeholder="Describe the job here..."
                            data-testid="job-description-input"
                        />
                    </div>

                    <div className="rounded-lg border border-blue-300/20 bg-blue-500/10 p-3" data-testid="verify-scope-readiness-card">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-100/80">Scope quality</p>
                                <p className="mt-1 text-sm font-semibold leading-5 text-white">
                                    {scopeDetailScore >= 3 ? "Ready to draft." : "Add one more detail before generating."}
                                </p>
                            </div>
                            <span
                                className={cn(
                                    "shrink-0 rounded-lg border border-white/10 bg-slate-950/55 px-2 py-1 text-[11px] font-semibold",
                                    scopeDetailStatusClassName
                                )}
                                data-testid="verify-scope-detail-status"
                            >
                                {scopeDetailStatusLabel}
                            </span>
                        </div>
                        <p className="mt-3 rounded-lg border border-blue-300/15 bg-slate-950/45 px-2.5 py-2 text-xs leading-5 text-slate-300" data-testid="verify-scope-next-detail">
                            {scopeDetailMessage}
                        </p>
                        {scopeGuidancePrompts.length > 0 ? (
                            <div className="mt-3 grid gap-2" data-testid="verify-scope-guidance-card">
                                {scopeGuidancePrompts.map((prompt) => (
                                    <button
                                        key={prompt.id}
                                        type="button"
                                        className="min-h-11 rounded-lg border border-white/10 bg-slate-950/55 px-3 py-2 text-left transition hover:border-blue-300/25 hover:bg-blue-500/10"
                                        onClick={() => handleAddScopeGuidancePrompt(prompt)}
                                        data-testid={`verify-scope-guidance-prompt-${prompt.id}`}
                                    >
                                        <span className="flex items-center justify-between gap-3">
                                            <span className="min-w-0">
                                                <span className="block text-xs font-semibold text-white">{prompt.title}</span>
                                                <span className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-slate-400">{prompt.helper}</span>
                                            </span>
                                            <span className="shrink-0 rounded-md bg-blue-300/10 px-2 py-1 text-[10px] font-semibold text-blue-100">
                                                {prompt.label}
                                            </span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        ) : null}
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
                                    data-testid="photo-context-input"
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
                    {revisionContext ? (
                        <section
                            className="field-card border-amber-300/25 bg-amber-500/10 p-3 sm:p-4"
                            data-testid="customer-revision-context"
                        >
                            <div className="flex gap-3">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-300/25 bg-amber-300/10 text-amber-100">
                                    <MessageSquare className="h-4.5 w-4.5" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-100/75">
                                                Revision request
                                            </p>
                                            <p className="mt-1 truncate text-sm font-semibold text-white" data-testid="customer-revision-customer">
                                                {revisionCustomerLabel}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                                            <span className="rounded-md border border-amber-300/20 bg-slate-950/40 px-2 py-1 text-[10px] font-semibold text-amber-100">
                                                {revisionOriginalLabel}
                                            </span>
                                            {revisionRequestedLabel ? (
                                                <span className="rounded-md border border-amber-300/20 bg-slate-950/40 px-2 py-1 text-[10px] font-semibold text-amber-100">
                                                    {revisionRequestedLabel}
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>
                                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-300" data-testid="customer-revision-note">
                                        {revisionContext.note || "Customer asked for changes. Review the copied scope before sending this version."}
                                    </p>
                                </div>
                            </div>
                        </section>
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
                                                ? sendReadinessIssues.length === 0
                                                    ? "Review the essentials, then send the customer copy."
                                                    : "Clear the remaining send checks before delivery."
                                                : "Add customer details, then send the quote."}
                                        </p>
                                        <div
                                            className={cn(
                                                "mt-2 inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-semibold",
                                                sendReadinessStatusClassName
                                            )}
                                            data-testid="result-send-readiness-status"
                                        >
                                            {sendReadinessIssues.length === 0 ? (
                                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                            ) : (
                                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                            )}
                                            <span className="min-w-0 truncate">{sendReadinessStatusLabel}</span>
                                        </div>
                                        <p className="mt-1 hidden truncate text-xs text-slate-400 sm:block" data-testid="result-send-readiness-helper">
                                            {sendReadinessHelper}
                                        </p>
                                    </div>
                                    <div className="sr-only flex-wrap gap-1 text-[10px] font-semibold sm:not-sr-only sm:flex" data-testid="result-readiness-strip">
                                        <span className={cn("rounded-md border px-1.5 py-0.5", resultClientStatusClassName)}>
                                            {hasClientDetails ? "Client ready" : "Client needed"}
                                        </span>
                                        <span className={cn(
                                            "rounded-md border px-1.5 py-0.5",
                                            hasLineReviewIssues
                                                ? "border-amber-300/25 bg-amber-400/10 text-amber-200"
                                                : "border-blue-300/25 bg-blue-500/10 text-blue-200"
                                        )}>
                                            {resultLineReadinessLabel}
                                        </span>
                                        <span className={cn("rounded-md border px-1.5 py-0.5", resultDeliveryStatusClassName)}>
                                            {hasDeliveryContact ? "Contact ready" : "Contact needed"}
                                        </span>
                                        <span className={cn("rounded-md border px-1.5 py-0.5", resultPaymentStatusClassName)}>
                                            {hasAttachedPaymentLink ? "Payment ready" : "Payment optional"}
                                        </span>
                                        <span className={cn(
                                            "rounded-md border px-1.5 py-0.5",
                                            scopeDetailScore >= 3
                                                ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
                                                : "border-amber-300/25 bg-amber-400/10 text-amber-100"
                                        )}>
                                            {scopeDetailScore >= 3 ? "Scope checked" : "Scope check"}
                                        </span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2" data-testid="result-readiness-actions">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-11 justify-center rounded-lg border-blue-300/30 bg-blue-500/10 px-2 text-xs font-semibold text-blue-100 hover:bg-blue-500/20 hover:text-white sm:justify-start sm:px-3"
                                        onClick={() => handleReviewLineItems()}
                                        data-testid="result-review-lines-button"
                                    >
                                        <FileText className="mr-2 h-4 w-4" />
                                        <span className="min-w-0 truncate sm:hidden">{resultLineReviewButtonShortLabel}</span>
                                        <span className="hidden min-w-0 truncate sm:inline">{resultLineReviewButtonLabel}</span>
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
                                        <span className="min-w-0 truncate sm:hidden">{paymentQuickActionShortLabel}</span>
                                        <span className="hidden min-w-0 truncate sm:inline">{paymentQuickActionLabel}</span>
                                    </Button>
                                </div>
                                <div className="grid grid-cols-2 gap-2" data-testid="result-primary-actions">
                                    {hasClientDetails && hasEmailDeliveryContact ? (
                                        <>
                                            {hasLineReviewIssues ? (
                                                <Button
                                                    size="sm"
                                                    className="h-10 min-w-0 justify-center overflow-hidden rounded-lg px-2 text-sm font-semibold sm:h-11 sm:justify-start"
                                                    onClick={() => handleReviewLineItems({ focusGate: true })}
                                                    disabled={isTeamEstimateMode && !canEditTeamEstimate}
                                                    aria-label="Fix line items before sending"
                                                    data-testid="result-fix-lines-before-send-button"
                                                >
                                                    <FileText className="mr-2 h-4 w-4 shrink-0" />
                                                    <span className="min-w-0 truncate">Fix lines</span>
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    className="h-10 min-w-0 justify-center overflow-hidden rounded-lg px-2 text-sm font-semibold sm:h-11 sm:justify-start"
                                                    onClick={handleOpenEmailModal}
                                                    disabled={isTeamEstimateMode && !canEditTeamEstimate}
                                                    aria-label="Send to Customer"
                                                    data-testid="result-quick-send-button"
                                                >
                                                    <Mail className="mr-2 h-4 w-4 shrink-0" />
                                                    <span className="min-w-0 truncate sm:hidden">Email</span>
                                                    <span className="hidden min-w-0 truncate sm:inline">Send to Customer</span>
                                                </Button>
                                            )}
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
                                                        <span className="min-w-0 truncate sm:hidden" data-testid="result-quick-save-label">Save</span>
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
                                                <span className="min-w-0 truncate sm:hidden">{resultEmailActionShortLabel}</span>
                                                <span className="hidden min-w-0 truncate sm:inline">{resultEmailActionLabel}</span>
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
                                                        <span className="min-w-0 truncate sm:hidden" data-testid="result-quick-save-label">Save</span>
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
                                                        <span className="min-w-0 truncate sm:hidden" data-testid="result-quick-save-label">Save</span>
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
                                        onClick={handleOpenSmsModal}
                                        disabled={isTeamEstimateMode && !canEditTeamEstimate}
                                        aria-label="Send via SMS"
                                        title="Send via SMS"
                                        data-testid="result-quick-sms-button"
                                    >
                                        <MessageSquare className="mr-2 h-4 w-4 shrink-0" />
                                        <span className="min-w-0 truncate sm:hidden" data-testid="result-quick-sms-label">Text</span>
                                        <span className="hidden min-w-0 truncate sm:inline">Text quote</span>
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
                                        <span className="min-w-0 truncate sm:hidden" data-testid="result-quick-preview-label">View</span>
                                        <span className="hidden min-w-0 truncate sm:inline">Preview</span>
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
                                                <span className="min-w-0 truncate" data-testid="result-quick-pdf-label">PDF</span>
                                            </>
                                        ) : (
                                            <>
                                                <Download className="mr-2 h-4 w-4 shrink-0" />
                                                <span className="min-w-0 truncate sm:hidden" data-testid="result-quick-pdf-label">PDF</span>
                                                <span className="hidden min-w-0 truncate sm:inline">Download</span>
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

                            {shouldShowResultScopeConfidenceCard ? (
                                <div
                                    className={resultScopeConfidenceCardClassName}
                                    data-testid="result-scope-confidence-card"
                                >
                                    <div className="flex items-start gap-3">
                                        <span className={resultScopeConfidenceIconClassName}>
                                            {hasConfirmedScopeAssumptions ? (
                                                <CheckCircle2 className="h-4 w-4" />
                                            ) : (
                                                <AlertTriangle className="h-4 w-4" />
                                            )}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className={cn(
                                                        "text-xs font-semibold uppercase tracking-[0.16em]",
                                                        hasConfirmedScopeAssumptions ? "text-emerald-100/75" : "text-amber-100/75"
                                                    )}>
                                                        Estimate assumptions
                                                    </p>
                                                    <p className="mt-1 text-sm font-semibold text-white">
                                                        Verify before sending
                                                    </p>
                                                </div>
                                                <span
                                                    className={cn(
                                                        "shrink-0 rounded-lg border px-2 py-1 text-[11px] font-semibold",
                                                        resultScopeConfidenceClassName
                                                    )}
                                                    data-testid="result-scope-confidence-status"
                                                >
                                                    {resultScopeConfidenceLabel}
                                                </span>
                                            </div>
                                            <p className="mt-2 text-xs leading-5 text-slate-300" data-testid="result-scope-confidence-helper">
                                                {resultScopeConfidenceHelper}
                                            </p>
                                            <div className="mt-2 grid gap-1.5" data-testid="result-scope-assumption-list">
                                                {scopeGuidancePrompts.map((prompt) => (
                                                    <div
                                                        key={prompt.id}
                                                        className="flex min-h-8 items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/45 px-2.5 py-1.5 text-xs"
                                                    >
                                                        <span className="min-w-0 truncate text-slate-300">{prompt.title}</span>
                                                        <span className={cn(
                                                            "shrink-0 font-semibold",
                                                            hasConfirmedScopeAssumptions ? "text-emerald-100" : "text-amber-100"
                                                        )}>
                                                            {resultScopeAssumptionActionLabel}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
                                                <Button
                                                    type="button"
                                                    variant={hasConfirmedScopeAssumptions ? "default" : "outline"}
                                                    size="sm"
                                                    className={cn(
                                                        "h-10 w-full rounded-lg sm:w-auto",
                                                        hasConfirmedScopeAssumptions
                                                            ? "border-emerald-300/25 bg-emerald-500/20 text-emerald-50 hover:bg-emerald-500/25"
                                                            : "border-amber-300/25 bg-amber-400/10 text-amber-100 hover:bg-amber-400/15 hover:text-white"
                                                    )}
                                                    onClick={handleConfirmScopeAssumptions}
                                                    disabled={hasConfirmedScopeAssumptions}
                                                    data-testid="result-confirm-scope-assumptions-button"
                                                >
                                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                                    {hasConfirmedScopeAssumptions ? "Scope reviewed" : "Confirm scope"}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-10 w-full rounded-lg border-white/10 bg-slate-950/55 text-slate-100 hover:bg-slate-900 hover:text-white sm:w-auto"
                                                    onClick={handleReviewSourceNotes}
                                                    data-testid="result-edit-source-notes-button"
                                                >
                                                    <ClipboardList className="mr-2 h-4 w-4" />
                                                    Edit source notes
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : null}

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
                                                    if (!revisionContext) setClientNotes("")
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
                                        className={cn("shrink-0 rounded-lg border px-2 py-1 text-[11px] font-semibold", handoffStatusClassName)}
                                        data-testid="handoff-actions-status"
                                    >
                                        {hasHandoffScopeAssumptions ? (
                                            <span data-testid="handoff-scope-assumptions-status">{handoffStatusLabel}</span>
                                        ) : handoffStatusLabel}
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
                                {pdfDeliveryIssue ? (
                                    <div
                                        className="rounded-lg border border-amber-300/25 bg-amber-400/10 p-3 text-amber-50"
                                        data-testid="pdf-delivery-issue"
                                        role="alert"
                                    >
                                        <div className="flex items-start gap-2">
                                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-100" />
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold" data-testid="pdf-delivery-issue-title">{pdfDeliveryIssue.title}</p>
                                                <p className="mt-1 text-xs leading-5 text-amber-50/80" data-testid="pdf-delivery-issue-message">
                                                    {pdfDeliveryIssue.message}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                            <Button
                                                type="button"
                                                size="sm"
                                                className="h-11 rounded-lg"
                                                onClick={() => void handleShare()}
                                                disabled={isSharing}
                                                data-testid="pdf-delivery-retry-share-action"
                                            >
                                                {isSharing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                                Retry share
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-11 rounded-lg border-amber-200/25 bg-slate-950/50 text-amber-50 hover:bg-slate-900 hover:text-white"
                                                onClick={() => void handleDownloadPdf()}
                                                disabled={isDownloadingPdf}
                                                data-testid="pdf-delivery-download-action"
                                            >
                                                {isDownloadingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                                Download PDF
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-11 rounded-lg border-amber-200/25 bg-slate-950/50 text-amber-50 hover:bg-slate-900 hover:text-white"
                                                onClick={handleOpenPreview}
                                                data-testid="pdf-delivery-preview-action"
                                            >
                                                <Eye className="mr-2 h-4 w-4" />
                                                Preview PDF
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-11 rounded-lg text-amber-50 hover:bg-amber-400/10 hover:text-white"
                                                onClick={() => setPdfDeliveryIssue(null)}
                                                data-testid="pdf-delivery-dismiss-action"
                                            >
                                                <X className="mr-2 h-4 w-4" />
                                                Keep editing
                                            </Button>
                                        </div>
                                    </div>
                                ) : null}
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
                                                        {sharePdfHelper}
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
                    approvalPaymentAvailable={hasApprovalPaymentFallback}
                    approvalLinkStatus={customerApprovalLinkStatus}
                    onPrepareApprovalLink={handleApprovalLinkSetup}
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
                    approvalPaymentAvailable={hasApprovalPaymentFallback}
                    approvalLinkStatus={customerApprovalLinkStatus}
                    onPrepareApprovalLink={handleApprovalLinkSetup}
                    onSend={async (toPhoneNumber, message) => {
                        try {
                            const draftMeta = getOrCreateDraftMeta()
                            const pendingSentEstimate = await buildLocalEstimatePayload("sent")
                            const portalResult = await prepareCustomerPortalLinkForDelivery(pendingSentEstimate)
                            const messageWithApprovalLink = appendCustomerPortalLink(message, portalResult?.shareUrl, "sms")
                            const data = await sendEstimateSms({
                                toPhoneNumber,
                                message: messageWithApprovalLink,
                                estimateId: draftMeta.id,
                            })
                            const portalUpdates = portalResult ? getCustomerPortalEstimateUpdates(portalResult) : {}
                            void trackAnalyticsEvent({
                                event: "quote_sent",
                                estimateId: draftMeta.id,
                                estimateNumber: draftMeta.estimateNumber,
                                channel: "sms",
                                metadata: {
                                    creditsRemaining: data.creditsRemaining,
                                    hasPaymentLink: Boolean(effectiveCustomerPaymentLink),
                                    hasCustomerPortalLink: Boolean(portalResult?.shareUrl),
                                },
                            })
                            if (portalResult) {
                                void trackAnalyticsEvent({
                                    event: "customer_portal_link_created",
                                    estimateId: draftMeta.id,
                                    estimateNumber: draftMeta.estimateNumber,
                                    channel: "estimate_sms",
                                    metadata: {
                                        portalStatus: portalUpdates.customerPortalStatus,
                                    },
                                })
                            }
                            await persistCurrentEstimateAsSent(portalUpdates)
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
                    onManualEntry={openManualEntry}
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
