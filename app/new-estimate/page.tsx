"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { ArrowRight, Camera, CheckCircle2, ChevronDown, ChevronUp, CreditCard, Download, Loader2, Mail, MessageSquare, Mic, PenTool, Save, Share2, SlidersHorizontal, Sparkles, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { saveEstimate, generateEstimateNumber, getProfile, saveProfile, getEstimates, updateEstimate } from "@/lib/estimates-storage"
import { savePendingAudio, getUnprocessedAudio, deletePendingAudio, getPriceListForAI, getClients, type Client } from "@/lib/db"
import type { BusinessInfo, EstimateItem, EstimateSection } from "@/lib/estimates-storage"
import { normalizeCategory, normalizeEstimateItem, normalizeEstimatePayload, normalizeUnit, type EstimateDraft } from "@/lib/estimates/normalize"
import { getAllItemsFromEstimate, lineTotal } from "@/lib/estimates/math"
import { toast } from "@/components/toast"
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
    getTeamEstimateDetail,
    getTeamEstimateSession,
    mutateTeamEstimateSession,
    updateTeamEstimate,
    type TeamEstimateDetailResponse,
    type TeamEstimateSessionResponse,
} from "@/lib/team"
const PaymentOptionModal = dynamic(() => import("@/components/payment-option-modal").then(mod => mod.PaymentOptionModal), { ssr: false })
import { AudioRecorder } from "@/components/audio-recorder"
const PDFPreviewModal = dynamic(() => import("@/components/pdf-preview-modal").then(mod => mod.PDFPreviewModal), { ssr: false })
const EmailModal = dynamic(() => import("@/components/email-modal").then(mod => mod.EmailModal), { ssr: false })
const SmsModal = dynamic(() => import("@/components/sms-modal").then(mod => mod.SmsModal), { ssr: false })
const ExcelImportModal = dynamic(() => import("@/components/excel-import-modal").then(mod => mod.ExcelImportModal), { ssr: false })
const ReceiptScanner = dynamic(() => import("@/components/receipt-scanner").then(mod => mod.ReceiptScanner), { ssr: false })
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
const SignaturePad = dynamic(() => import("@/components/signature-pad").then(mod => mod.SignaturePad), { ssr: false })

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

export default function NewEstimatePage() {
    const router = useRouter()
    const [step, setStep] = useState<Step>("input")

    // Data States
    const [images, setImages] = useState<File[]>([])
    const [previewUrls, setPreviewUrls] = useState<string[]>([])
    const [transcribedText, setTranscribedText] = useState("")
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
    const [estimate, setEstimate] = useState<Estimate | null>(null)

    // Client Load State
    const [isClientModalOpen, setIsClientModalOpen] = useState(false)
    const [availableClients, setAvailableClients] = useState<Client[]>([])

    // Signature State
    const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false)

    // UI States
    const [isSaving, setIsSaving] = useState(false)
    const [isSharing, setIsSharing] = useState(false)
    const [taxRate, setTaxRate] = useState(13)
    const [clientName, setClientName] = useState("")
    const [clientAddress, setClientAddress] = useState("")
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
    const [showInputOptions, setShowInputOptions] = useState(false)
    const [photoContext, setPhotoContext] = useState("")
    const [paymentLink, setPaymentLink] = useState<string | null>(null)
    const [paymentLinkId, setPaymentLinkId] = useState<string | null>(null)
    const [paymentLinkType, setPaymentLinkType] = useState<'full' | 'deposit' | 'custom' | null>('full')
    const [isGeneratingPaymentLink, setIsGeneratingPaymentLink] = useState(false)
    const [includePaymentLink, setIncludePaymentLink] = useState(false)
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
    const [isCopyingReferral, setIsCopyingReferral] = useState(false)
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false)
    const [isReceiptScannerOpen, setIsReceiptScannerOpen] = useState(false)
    const [showDemoTutorial, setShowDemoTutorial] = useState(false)
    const [billingUsageSnapshot, setBillingUsageSnapshot] = useState<BillingUsageSnapshot | null>(null)
    const [subscription, setSubscription] = useState<BillingSubscriptionStatusResponse | null>(null)
    const [teamEstimateContext, setTeamEstimateContext] = useState<TeamEstimateDetailResponse["estimate"] | null>(null)
    const [teamEstimateSession, setTeamEstimateSession] = useState<TeamEstimateSessionResponse["session"] | null>(null)
    const [teamEstimateLoading, setTeamEstimateLoading] = useState(false)
    const [teamSessionMutating, setTeamSessionMutating] = useState(false)

    const fileInputRef = useRef<HTMLInputElement>(null)
    const draftMetaRef = useRef<{ id: string; estimateNumber: string } | null>(null)
    const handledPaymentIntentRef = useRef(false)
    const hasPhotoEstimateAccess = subscription ? PHOTO_ESTIMATE_PRO_TIERS.has(subscription.planTier) : false
    const isTeamEstimateMode = Boolean(teamEstimateContext)
    const canEditTeamEstimate = !isTeamEstimateMode || Boolean(teamEstimateSession?.canEdit)
    const shouldShowInputOptions =
        showInputOptions || previewUrls.length > 0 || generateWorkflow === "photo_estimate" || photoContext.trim().length > 0
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

    const getOrCreateDraftMeta = () => {
        if (!draftMetaRef.current) {
            draftMetaRef.current = {
                id: crypto.randomUUID(),
                estimateNumber: generateEstimateNumber(),
            }
        }
        return draftMetaRef.current
    }

    const resetDraftMeta = () => {
        draftMetaRef.current = null
    }

    const resetPaymentLinkState = useCallback(() => {
        setIncludePaymentLink(false)
        setPaymentLink(null)
        setPaymentLinkId(null)
        setPaymentLinkType(null)
    }, [])

    const redirectToLoginForTeamEstimate = useCallback((estimateId: string) => {
        const params = new URLSearchParams({
            next: `/new-estimate?teamEstimateId=${estimateId}`,
            intent: "team-edit",
        })
        router.push(`/login?${params.toString()}`)
    }, [router])

    const loadDraftIntoComposer = useCallback((draft: Record<string, any>, options?: { tutorial?: boolean; toastMessage?: string }) => {
        resetDraftMeta()
        resetPaymentLinkState()
        setEstimate(normalizeEstimatePayload(draft))
        setClientName(draft.clientName || "")
        setClientAddress(draft.clientAddress || "")
        setTaxRate(typeof draft.taxRate === "number" ? draft.taxRate : 13)
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
    }, [resetPaymentLinkState])

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
            toast(`❌ ${errorMessage}`, "error")
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
                toast("✅ You now hold the Team editing session.", "success")
            } else if (action === "takeover") {
                toast("⚠️ Team editing session taken over.", "warning")
            } else if (action === "release") {
                toast("ℹ️ Team editing session released.", "info")
            }
        } catch (error: unknown) {
            toast(`❌ ${getErrorMessage(error, "Failed to update Team editing session.")}`, "error")
        } finally {
            setTeamSessionMutating(false)
        }
    }, [teamEstimateContext])

    const redirectToLoginForPaymentLink = useCallback(() => {
        const params = new URLSearchParams({
            next: "/new-estimate",
            intent: "payment-link",
        })
        router.push(`/login?${params.toString()}`)
    }, [router])

    const handleLoadDemoQuote = useCallback(() => {
        loadDraftIntoComposer(createDemoEstimateDraft(), {
            tutorial: true,
            toastMessage: "Demo quote loaded. Edit it before sending.",
        })
        router.replace("/new-estimate?tutorial=1")
    }, [loadDraftIntoComposer, router])

    const handleExitDemoTutorial = useCallback(() => {
        resetDraftMeta()
        resetPaymentLinkState()
        setEstimate(null)
        setClientName("")
        setClientAddress("")
        setImages([])
        setPreviewUrls([])
        setTranscribedText("")
        setAudioBlob(null)
        setShowDemoTutorial(false)
        setStep("input")
        setTaxRate(businessProfile?.tax_rate || 13)
        router.replace("/new-estimate")
    }, [businessProfile?.tax_rate, resetPaymentLinkState, router])

    const handleDismissDemoTutorial = useCallback(() => {
        setShowDemoTutorial(false)
        router.replace("/new-estimate")
    }, [router])

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
        const searchParams = new URLSearchParams(window.location.search)
        const tutorialMode = searchParams.get("tutorial") === "1"
        const teamEstimateId = searchParams.get("teamEstimateId")?.trim() || ""
        setShowDemoTutorial(tutorialMode)

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
                    toastMessage: tutorialMode ? "Demo quote loaded. Edit it before sending." : "Estimate duplicated! Edit and save.",
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
                toastMessage: "Demo quote loaded. Edit it before sending.",
            })
            return
        }

        if (teamEstimateId) {
            void loadTeamEstimate(teamEstimateId)
        }
    }, [loadDraftIntoComposer, loadTeamEstimate])

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
                                toast("⚠️ Monthly voice quota reached. Upgrade flow will be enabled soon.", "warning")
                                continue
                            }

                            if (response.ok) {
                                const data = await response.json()
                                // If this page has the matching pending audio, update state
                                if (audio.id === pendingAudioId) {
                                    setTranscribedText(data.text)
                                    toast("✅ Your recording was transcribed!", "success")
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
        const intent = new URLSearchParams(window.location.search).get("intent")
        if (intent !== "payment-link") return
        handledPaymentIntentRef.current = true

        void (async () => {
            const headers = await withAuthHeaders()
            if (!headers.authorization) {
                toast("🔐 Sign in to continue with payment link setup.", "warning")
                return
            }

            toast("✅ Login confirmed. Continue payment link setup.", "success")
            setIsPaymentModalOpen(true)
        })()

        router.replace("/new-estimate")
    }, [router])

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
            setImages(prev => [...prev, ...files])
            const newUrls = files.map(file => URL.createObjectURL(file))
            setPreviewUrls(prev => [...prev, ...newUrls])
        }
    }

    const handleSelectGenerateWorkflow = (nextWorkflow: GenerateWorkflow) => {
        if (nextWorkflow === "photo_estimate" && !hasPhotoEstimateAccess) {
            toast("📸 Photo Estimate is available on Pro or Team.", "info")
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
                toast("📴 Offline: Audio saved. Will process when online.", "info")
                setStep("verifying") // Let user type manually
            } catch (error) {
                console.error("Failed to save audio offline:", error)
                toast("❌ Failed to save audio. Please try again.", "error")
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
            toast(`❌ ${message}`, "error")
            setStep("verifying") // Go to verify anyway so user can type
        }
    }

    const handleGenerateEstimate = async () => {
        // Check network first
        if (!navigator.onLine) {
            toast("📴 No internet connection. Please connect and try again.", "warning")
            return
        }

        if (generateWorkflow === "photo_estimate" && images.length === 0) {
            toast("📸 Add at least one jobsite photo to run Photo Estimate.", "warning")
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
            toast("✅ Estimate generated successfully!", "success")
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

            toast(`❌ ${errorMessage}`, "error")
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
            toast(`⚠️ Review ${normalizedWarnings.length} receipt warning${normalizedWarnings.length === 1 ? "" : "s"} before sending.`, "info")
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
            `✅ ${selectedOption.tier === "better" ? "Better" : "Best"} package added (+$${addedItems
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

    const buildLocalEstimatePayload = useCallback(async (status: 'draft' | 'sent') => {
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
            taxRate,
            taxAmount,
            totalAmount,
            createdAt: teamEstimateContext?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sentAt: status === "sent" ? (teamEstimateContext?.sentAt || new Date().toISOString()) : undefined,
            status,
            paymentLink: includePaymentLink && paymentLink ? paymentLink : undefined,
            paymentLinkId: includePaymentLink && paymentLinkId ? paymentLinkId : undefined,
            paymentLinkType: includePaymentLink && paymentLinkType ? paymentLinkType : undefined,
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
        includePaymentLink,
        paymentLink,
        paymentLinkId,
        paymentLinkType,
        teamEstimateContext?.createdAt,
        teamEstimateContext?.sentAt,
    ])

    const persistTeamEstimateToCloud = useCallback(async (localEstimate: Awaited<ReturnType<typeof buildLocalEstimatePayload>>) => {
        if (!teamEstimateContext) {
            return localEstimate
        }

        const result = await updateTeamEstimate(teamEstimateContext.estimateId, {
            clientName: localEstimate.clientName,
            clientAddress: localEstimate.clientAddress,
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

    const persistCurrentEstimateAsSent = useCallback(async () => {
        if (isTeamEstimateMode && !canEditTeamEstimate) {
            throw new Error("Claim the Team editing session before sending.")
        }

        const nextEstimate = await buildLocalEstimatePayload("sent")
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
            toast(isTeamEstimateMode ? "✅ Team estimate saved to shared workspace." : "✅ Estimate saved successfully!", "success")
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
        setIsSharing(true)
        try {
            const allItems = getAllItemsFromEstimate(estimate)
            const subtotal = allItems.reduce((sum, item) => sum + lineTotal(item), 0)
            const total = subtotal * (1 + taxRate / 100)
            const { pdf } = await import("@react-pdf/renderer")
            const pdfDoc = await createEstimatePdfDocument({ includePhotos: true, includeSignature: true })
            const blob = await pdf(pdfDoc).toBlob()
            const file = new File([blob], "estimate.pdf", { type: "application/pdf" })
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: "Estimate",
                    text: `Estimate Total: $${total.toFixed(2)}`,
                    files: [file],
                })
            } else {
                const url = URL.createObjectURL(blob)
                const a = document.createElement("a")
                a.href = url
                a.download = "estimate.pdf"
                a.click()
                URL.revokeObjectURL(url)
                toast("📥 Share not supported. PDF downloaded instead.", "info")
            }
        } catch (error) {
            console.error("Share failed:", error)
            toast("❌ Failed to generate PDF. Please try again.", "error")
        } finally {
            setIsSharing(false)
        }
    }

    const handleDownloadPdf = async () => {
        if (!estimate) return
        setIsDownloadingPdf(true)
        try {
            const { pdf } = await import("@react-pdf/renderer")
            const pdfDoc = await createEstimatePdfDocument({ includeSignature: true })

            const blob = await pdf(pdfDoc).toBlob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = "estimate.pdf"
            a.click()
            URL.revokeObjectURL(url)
            toast("📥 PDF downloaded", "success")
        } catch (error) {
            console.error("Download PDF failed:", error)
            toast("❌ Failed to create PDF.", "error")
        } finally {
            setIsDownloadingPdf(false)
        }
    }

    const handleCopyReferralLink = async () => {
        setIsCopyingReferral(true)
        try {
            const shareUrl = await copyReferralShareUrl({ source: "estimate_result" })
            if (!shareUrl) {
                toast("🔐 Log in first to generate your referral link.", "info")
                return
            }

            const draftMeta = getOrCreateDraftMeta()
            void trackAnalyticsEvent({
                event: "referral_link_copied",
                estimateId: draftMeta.id,
                estimateNumber: draftMeta.estimateNumber,
                channel: "new_estimate_result",
            })
            toast("🔗 Referral link copied!", "success")
        } catch (error) {
            console.error("Failed to copy referral link:", error)
            toast("❌ Failed to copy referral link.", "error")
        } finally {
            setIsCopyingReferral(false)
        }
    }

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
        toast(`✅ Imported ${normalizedImportedItems.length} items from CSV`, "success")
    }, [estimate, setEstimate, setStep])

    return (
        <div className="max-w-2xl mx-auto space-y-6 px-4 pb-20">
            <CardHeader className="px-0 pb-2">
                <CardTitle className="text-2xl font-bold">
                    {step === "input" && "New Estimate"}
                    {step === "transcribing" && "Processing Audio..."}
                    {step === "verifying" && "Verify Details"}
                    {step === "generating" && "Creating Estimate..."}
                    {step === "result" && "Estimate Ready"}
                </CardTitle>
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
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                    <Card className="border-primary/[0.15] bg-gradient-to-b from-primary/10 via-background to-background shadow-lg">
                        <CardHeader className="space-y-3">
                            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                                <Mic className="h-3.5 w-3.5" />
                                Record Scope
                            </div>
                            <div className="space-y-2">
                                <CardTitle className="text-2xl leading-tight">Capture the job now. Refine the quote after.</CardTitle>
                                <p className="text-sm leading-6 text-muted-foreground">
                                    Speak naturally on site and let SnapQuote turn rough field language into a clean English draft before you leave the driveway.
                                </p>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
                                <AudioRecorder
                                    onAudioCaptured={handleAudioCaptured}
                                    onAudioRemoved={() => setAudioBlob(null)}
                                />
                                <p className="mt-4 text-sm text-center text-muted-foreground">
                                    Tap to record in Spanish, Korean, English, or mixed site language.
                                </p>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <Button
                                    variant="outline"
                                    className="h-11 justify-center"
                                    data-testid="skip-to-manual-entry"
                                    onClick={() => setStep("verifying")}
                                >
                                    Skip to manual entry
                                </Button>
                                <Button
                                    variant="outline"
                                    className="h-11 justify-center border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/[0.15]"
                                    onClick={handleLoadDemoQuote}
                                    data-testid="load-demo-quote-button"
                                >
                                    <Sparkles className="mr-2 h-4 w-4" />
                                    Load Demo Quote
                                </Button>
                            </div>

                            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4">
                                <div className="flex items-start gap-3">
                                    <div className="rounded-full bg-blue-500/[0.15] p-2 text-blue-500">
                                        <Sparkles className="h-4 w-4" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-500">Try saying this</p>
                                        <p className="text-sm font-medium leading-relaxed text-foreground italic">
                                            {SOURCE_LANGUAGE_EXAMPLES[sourceLanguage]}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Output stays in professional English even if you record in Spanish or Korean.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="rounded-2xl border border-border/60 bg-muted/20">
                        <button
                            type="button"
                            onClick={() => setShowInputOptions((current) => !current)}
                            className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
                            aria-expanded={shouldShowInputOptions}
                        >
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 text-sm font-semibold">
                                    <SlidersHorizontal className="h-4 w-4 text-primary" />
                                    Refine input options
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Set project type, voice language, add jobsite photos, or switch to Photo Estimate mode.
                                </p>
                            </div>
                            {shouldShowInputOptions ? (
                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                        </button>

                        {shouldShowInputOptions ? (
                            <div className="space-y-5 border-t border-border/60 px-4 py-4">
                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Project type</p>
                                        <p className="text-sm text-muted-foreground">Choose the quoting context before the draft is generated.</p>
                                    </div>
                                    <div className="flex p-1 bg-muted rounded-lg">
                                        <Button
                                            variant={projectType === 'residential' ? 'default' : 'ghost'}
                                            className="flex-1 rounded-md h-9 text-xs font-medium"
                                            onClick={() => setProjectType('residential')}
                                        >
                                            Residential
                                        </Button>
                                        <Button
                                            variant={projectType === 'commercial' ? 'default' : 'ghost'}
                                            className="flex-1 rounded-md h-9 text-xs font-medium"
                                            onClick={() => setProjectType('commercial')}
                                        >
                                            Commercial
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-3 rounded-2xl border border-border/60 bg-background/70 p-4">
                                    <div className="space-y-1">
                                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Voice language</p>
                                        <p className="text-sm text-muted-foreground">
                                            Pick the language you speak on site. Spanish beta pushes harder on trade-term cleanup before the English quote is generated.
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {SOURCE_LANGUAGE_OPTIONS.map((option) => (
                                            <Button
                                                key={option.value}
                                                type="button"
                                                variant={sourceLanguage === option.value ? "default" : "outline"}
                                                className="h-auto min-h-14 flex-col items-start gap-1 px-3 py-3 text-left"
                                                onClick={() => setSourceLanguage(option.value)}
                                            >
                                                <span className="text-sm font-semibold">{option.label}</span>
                                                <span className="text-[11px] leading-4 text-current/80">{option.hint}</span>
                                            </Button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="relative">
                                        <div className="absolute inset-0 flex items-center">
                                            <span className="w-full border-t" />
                                        </div>
                                        <div className="relative flex justify-center text-xs uppercase">
                                            <span className="bg-background px-2 text-muted-foreground">Add photos</span>
                                        </div>
                                    </div>

                                    <div
                                        className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-4 flex flex-col items-center justify-center bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        <Camera className="h-6 w-6 text-muted-foreground mb-2" />
                                        <p className="text-sm text-muted-foreground font-medium">Add Photos</p>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            className="hidden"
                                            ref={fileInputRef}
                                            onChange={handleImageSelect}
                                        />
                                    </div>

                                    {previewUrls.length > 0 && (
                                        <div className="grid grid-cols-3 gap-2">
                                            {previewUrls.map((url, index) => (
                                                <div key={index} className="relative aspect-square">
                                                    <Image
                                                        src={url}
                                                        alt={`Site photo ${index + 1}`}
                                                        fill
                                                        className="object-cover rounded-lg"
                                                    />
                                                    <Button
                                                        variant="destructive"
                                                        size="icon"
                                                        className="absolute top-1 right-1 h-5 w-5 rounded-full"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            handleRemoveImage(index)
                                                        }}
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="grid gap-3 md:grid-cols-2">
                                        <button
                                            type="button"
                                            onClick={() => handleSelectGenerateWorkflow("standard")}
                                            className={`rounded-2xl border p-4 text-left transition-colors ${
                                                generateWorkflow === "standard"
                                                    ? "border-primary bg-primary/5"
                                                    : "border-border/70 bg-background hover:bg-muted/40"
                                            }`}
                                        >
                                            <p className="text-sm font-semibold">Standard AI Draft</p>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                Mix notes, photos, and voice to get a clean estimate draft fast.
                                            </p>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleSelectGenerateWorkflow("photo_estimate")}
                                            className={`rounded-2xl border p-4 text-left transition-colors ${
                                                generateWorkflow === "photo_estimate"
                                                    ? "border-primary bg-primary/10"
                                                    : "border-border/70 bg-background hover:bg-muted/40"
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-sm font-semibold">Pro Photo Estimate</p>
                                                <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                                                    Pro
                                                </span>
                                            </div>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                Turn jobsite photos into scope suggestions, material takeoff hints, and pricing confidence.
                                            </p>
                                        </button>
                                    </div>

                                    {generateWorkflow === "photo_estimate" ? (
                                        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                                            <div className="space-y-1">
                                                <p className="text-sm font-semibold">Photo Estimate mode</p>
                                                <p className="text-xs text-muted-foreground">
                                                    The AI will prioritize visible site conditions, suggest likely materials, and flag assumptions you still need to verify on site.
                                                </p>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-medium text-muted-foreground">Jobsite context (optional)</label>
                                                <Textarea
                                                    value={photoContext}
                                                    onChange={(e) => setPhotoContext(e.target.value)}
                                                    className="min-h-[92px]"
                                                    placeholder="Example: water damage around upstairs bath vanity, customer wants finish-grade repair and repaint"
                                                />
                                            </div>
                                        </div>
                                    ) : null}

                                    {!hasPhotoEstimateAccess ? (
                                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                                            <p className="text-sm font-semibold text-amber-900">Photo Estimate is a Pro feature</p>
                                            <p className="mt-1 text-xs text-amber-800">
                                                Unlock jobsite photo analysis, material suggestions, and pricing confidence on Pro or Team.
                                            </p>
                                            <Button
                                                variant="outline"
                                                className="mt-3 border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                                                onClick={() => router.push("/pricing?plan=pro")}
                                            >
                                                View Pro plans
                                            </Button>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            )}

            {/* STEP 2: TRANSCRIBING */}
            {step === "transcribing" && (
                <div className="flex flex-col items-center justify-center py-12 space-y-4 animate-in fade-in">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <p className="text-lg font-medium">Transcribing your voice...</p>
                </div>
            )}

            {/* STEP 3: VERIFYING */}
            {step === "verifying" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium">Job Description</label>
                            <span className="text-xs text-muted-foreground">
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
                        <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                            <div className="space-y-1">
                                <p className="text-sm font-semibold">Photo Estimate review</p>
                                <p className="text-xs text-muted-foreground">
                                    AI will return visible observations, suggested scope bullets, and likely materials. Hidden conditions should still be verified before sending.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-muted-foreground">Extra context for the photos</label>
                                <Textarea
                                    value={photoContext}
                                    onChange={(e) => setPhotoContext(e.target.value)}
                                    className="min-h-[88px]"
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

            {/* STEP 4: GENERATING */}
            {step === "generating" && (
                <div className="flex flex-col items-center justify-center py-12 space-y-4 animate-in fade-in">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <p className="text-lg font-medium">AI is drafting your estimate...</p>
                    <p className="text-sm text-muted-foreground">Applying professional terminology</p>
                </div>
            )}

            {/* STEP 5: RESULT */}
            {step === "result" && estimate && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                    {showDemoTutorial ? (
                        <DemoTutorialBanner
                            onDismiss={handleDismissDemoTutorial}
                            onStartBlank={handleExitDemoTutorial}
                        />
                    ) : null}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-xl font-bold" data-testid="estimate-draft-title">Estimate Draft</CardTitle>
                            <div className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                AI Generated
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {estimate.photoAnalysis ? (
                                <PhotoEstimateAnalysisCard analysis={estimate.photoAnalysis} />
                            ) : null}
                            {/* Warnings */}
                            {estimate.warnings && estimate.warnings.length > 0 && (
                                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <p className="text-yellow-800 text-sm font-medium flex items-center gap-2">
                                        ⚠️ Warnings
                                    </p>
                                    <ul className="mt-1 text-yellow-700 text-sm list-disc list-inside">
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
                            <div className="grid grid-cols-2 gap-4 bg-muted p-4 rounded-lg">
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="text-xs font-medium text-muted-foreground">Client Name</label>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-5 text-[10px] px-1 text-primary"
                                            onClick={async () => {
                                                const clients = await getClients()
                                                setAvailableClients(clients)
                                                setIsClientModalOpen(true)
                                            }}
                                        >
                                            <Users className="h-3 w-3 mr-1" /> Load
                                        </Button>
                                    </div>
                                    <Input
                                        value={clientName}
                                        onChange={(e) => setClientName(e.target.value)}
                                        placeholder="Enter client name"
                                        className="mt-1 bg-background"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground">Client Address</label>
                                    <Input
                                        value={clientAddress}
                                        onChange={(e) => setClientAddress(e.target.value)}
                                        placeholder="Enter client address"
                                        className="mt-1 bg-background"
                                    />
                                </div>
                            </div>

                            <div className="bg-muted p-4 rounded-lg">
                                <label className="text-xs font-medium text-muted-foreground mb-1 block">Summary Note</label>
                                <Textarea
                                    value={estimate.summary_note}
                                    onChange={(e) => handleSummaryChange(e.target.value)}
                                    className="bg-transparent border-0 p-0 text-sm italic focus-visible:ring-0 resize-none"
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

                            {/* Action Buttons - 2x2 Grid */}
                            <div className="grid grid-cols-2 gap-3 mt-4">
                                <Button
                                    size="lg"
                                    className="h-12 font-semibold"
                                    onClick={handleSave}
                                    disabled={isSaving || teamEstimateLoading || teamSessionMutating || !canEditTeamEstimate}
                                >
                                    {isSaving ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <Save className="h-4 w-4 mr-2" />
                                            Save Estimate
                                        </>
                                    )}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="lg"
                                    className="h-12"
                                    onClick={() => setIsPreviewOpen(true)}
                                >
                                    👁️ Preview
                                </Button>
                                <Button
                                    variant="outline"
                                    size="lg"
                                    className="w-full h-12"
                                    onClick={handleDownloadPdf}
                                    disabled={isDownloadingPdf}
                                >
                                    {isDownloadingPdf ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Creating...
                                        </>
                                    ) : (
                                        <>
                                            <Download className="h-4 w-4 mr-2" />
                                            Download PDF
                                        </>
                                    )}
                                </Button>
                                <Button
                                    variant={estimate.clientSignature ? "default" : "secondary"}
                                    size="lg"
                                    className="h-12 border border-primary/20"
                                    onClick={() => setIsSignatureModalOpen(true)}
                                >
                                    <PenTool className="h-4 w-4 mr-2" />
                                    {estimate.clientSignature ? "Signature Added" : "Sign & Accept"}
                                </Button>

                                <Button
                                    variant="secondary"
                                    size="lg"
                                    className="h-12"
                                    onClick={handleShare}
                                    disabled={isSharing}
                                >
                                    {isSharing ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Sharing...
                                        </>
                                    ) : (
                                        <>
                                            <Share2 className="h-4 w-4 mr-2" />
                                            Share
                                        </>
                                    )}
                                </Button>
                            </div>

                            {/* Payment Link Toggle */}
                            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg mt-4">
                                <div className="flex items-center gap-2">
                                    <CreditCard className="h-4 w-4 text-primary" />
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium">Include Payment Link</span>
                                        {includePaymentLink && paymentLink && (
                                            <span className="text-xs text-muted-foreground">
                                                {paymentLinkType === 'deposit' && '50% Deposit'}
                                                {paymentLinkType === 'custom' && 'Custom Amount'}
                                                {paymentLinkType === 'full' && 'Full Payment'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={includePaymentLink}
                                    onClick={async () => {
                                        if (!includePaymentLink) {
                                            if (!navigator.onLine) {
                                                toast('📴 Payment links require internet connection.', 'warning')
                                                return
                                            }

                                            const headers = await withAuthHeaders()
                                            if (!headers.authorization) {
                                                toast("🔐 Sign in first to generate a card payment link.", "warning")
                                                redirectToLoginForPaymentLink()
                                                return
                                            }
                                            setIsPaymentModalOpen(true)
                                        } else {
                                            resetPaymentLinkState()
                                        }
                                    }}
                                    disabled={isGeneratingPaymentLink || isOffline}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${includePaymentLink ? 'bg-primary' : 'bg-muted-foreground/30'
                                        } ${isGeneratingPaymentLink || isOffline ? 'opacity-50' : ''}`}
                                >
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${includePaymentLink ? 'translate-x-6' : 'translate-x-1'
                                            }`}
                                    />
                                </button>
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
                                            const data = await response.json().catch(() => ({}))

                                            if (!response.ok) {
                                                const errorMessage =
                                                    typeof data?.error === "string"
                                                        ? data.error
                                                        : typeof data?.error?.message === "string"
                                                            ? data.error.message
                                                            : "Failed to create link"

                                                if (response.status === 401) {
                                                    toast("🔐 Session expired. Please sign in again.", "warning")
                                                    resetPaymentLinkState()
                                                    redirectToLoginForPaymentLink()
                                                    return
                                                }

                                                if (response.status === 403) {
                                                    throw new Error(errorMessage)
                                                }

                                                throw new Error(errorMessage)
                                            }

                                            setPaymentLink(data.url)
                                            setPaymentLinkId(data.id)
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
                                            toast("✅ Payment link generated", "success")
                                        } catch (error) {
                                            console.error(error)
                                            const message = error instanceof Error ? error.message : "Failed to generate payment link"
                                            toast(`❌ ${message}`, "error")
                                            resetPaymentLinkState()
                                        } finally {
                                            setIsGeneratingPaymentLink(false)
                                        }
                                    }}
                                />
                            )}
                            {isOffline && (
                                <p className="text-xs text-yellow-600 text-center mt-1">
                                    📴 Offline - Payment links unavailable
                                </p>
                            )}
                            {isGeneratingPaymentLink && (
                                <p className="text-xs text-muted-foreground text-center mt-1 flex items-center justify-center gap-1">
                                    <Loader2 className="h-3 w-3 animate-spin" /> Generating payment link...
                                </p>
                            )}
                            {paymentLink && includePaymentLink && (
                                <p className="text-xs text-green-600 text-center mt-1">
                                    ✓ Payment link will be included in PDF
                                </p>
                            )}

                            {/* Email Button */}
                            <Button
                                variant="outline"
                                className="w-full mt-2"
                                onClick={() => setIsEmailModalOpen(true)}
                                disabled={isTeamEstimateMode && !canEditTeamEstimate}
                            >
                                <Mail className="h-4 w-4 mr-2" />
                                📧 Send to Customer
                            </Button>

                            {/* SMS Button */}
                            <Button
                                variant="outline"
                                className="w-full mt-2"
                                onClick={() => setIsSmsModalOpen(true)}
                                disabled={isTeamEstimateMode && !canEditTeamEstimate}
                            >
                                <MessageSquare className="h-4 w-4 mr-2" />
                                💬 Send via SMS
                            </Button>
                            <Button
                                variant="ghost"
                                className="w-full"
                                onClick={handleCopyReferralLink}
                                disabled={isCopyingReferral}
                            >
                                {isCopyingReferral ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Preparing link...
                                    </>
                                ) : (
                                    <>🔗 Copy Referral Link</>
                                )}
                            </Button>

                            {isPreviewOpen && (
                                <PDFPreviewModal
                                    open={isPreviewOpen}
                                    onClose={() => setIsPreviewOpen(false)}
                                    createDocument={() => createEstimatePdfDocument({ includeSignature: true })}
                                />
                            )}

                            {isEmailModalOpen && (
                                <EmailModal
                                    open={isEmailModalOpen}
                                    onClose={() => setIsEmailModalOpen(false)}
                                    estimateTotal={resultTotal}
                                    onSend={async (email, message) => {
                                        try {
                                            // Generate PDF as base64
                                            const { pdf } = await import("@react-pdf/renderer")
                                            const pdfDoc = await createEstimatePdfDocument({ includeSignature: true })
                                            const blob = await pdf(pdfDoc).toBlob()

                                            // Convert blob to base64
                                            const reader = new FileReader()
                                            const pdfBase64 = await new Promise<string>((resolve, reject) => {
                                                reader.onload = () => {
                                                    const result = reader.result as string
                                                    // Remove data URL prefix to get pure base64
                                                    const base64 = result.split(',')[1]
                                                    resolve(base64)
                                                }
                                                reader.onerror = reject
                                                reader.readAsDataURL(blob)
                                            })
                                            const referralUrl = await getReferralShareUrl({ source: "estimate_email" })
                                            const headers = await withAuthHeaders({ "Content-Type": "application/json" })

                                            // Send via API with PDF attachment
                                            const response = await fetch('/api/send-email', {
                                                method: 'POST',
                                                headers,
                                                body: JSON.stringify({
                                                    email,
                                                    subject: `Estimate from ${businessProfile?.business_name || 'SnapQuote'}`,
                                                    message,
                                                    pdfBase64,
                                                    businessName: businessProfile?.business_name,
                                                    referralUrl: referralUrl || undefined,
                                                })
                                            })

                                            if (!response.ok) {
                                                const errorData = await response.json()
                                                if (response.status === 402) {
                                                    throw new Error("Monthly email quota reached. Upgrade flow will be enabled soon.")
                                                }
                                                throw new Error(errorData.error || 'Failed to send email')
                                            }

                                            const data = await response.json()

                                            if (data.method === 'mailto') {
                                                // Open mailto if no email service configured
                                                window.open(data.mailtoUrl, '_blank')
                                                toast('📧 Email client opened. Please attach the PDF.', 'warning')
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
                                                toast('✅ Email sent with PDF attached!', 'success')
                                            }
                                        } catch (error: unknown) {
                                            console.error('Email send error:', error)
                                            toast(`❌ ${getErrorMessage(error, 'Failed to send. Try again.')}`, 'error')
                                            throw error
                                        }
                                    }}
                                />
                            )}
                        </CardContent>
                    </Card>

                    <Button
                        variant="ghost"
                        className="w-full"
                        onClick={() => setStep("verifying")}
                    >
                        Back to Edit
                    </Button>
                </div>
            )}

            {/* SMS Modal */}
            {isSmsModalOpen && (
                <SmsModal
                    open={isSmsModalOpen}
                    onClose={() => setIsSmsModalOpen(false)}
                    estimateTotal={resultTotal}
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
                            toast('✅ SMS sent!', 'success')
                        } catch (error: unknown) {
                            console.error('SMS send error:', error)
                            toast(`❌ ${getErrorMessage(error, 'Failed to send. Try again.')}`, 'error')
                            throw error
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
                    if (client.address) setClientAddress(client.address)
                    setIsClientModalOpen(false)
                    toast(`✅ Loaded ${client.name}`, "success")
                }}
                open={isClientModalOpen}
            />
            {/* Signature Modal */}
            <Dialog open={isSignatureModalOpen} onOpenChange={setIsSignatureModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Sign Estimate</DialogTitle>
                    </DialogHeader>
                    <SignaturePad
                        onSave={(signature) => {
                            if (estimate) {
                                setEstimate({
                                    ...estimate,
                                    clientSignature: signature,
                                    signedAt: new Date().toISOString(),
                                    status: 'sent' // Auto-approve/send
                                })
                                toast("✅ Signature captured!", "success")
                                setIsSignatureModalOpen(false)
                            }
                        }}
                        onCancel={() => setIsSignatureModalOpen(false)}
                    />
                </DialogContent>
            </Dialog>

        </div>
    )
}
