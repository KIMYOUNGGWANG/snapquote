"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { Camera, Upload, X, Loader2, Save, Share2, Download, Plus, Trash2, ArrowRight, Edit2, CheckCircle2, CreditCard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Image from "next/image"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { saveEstimate, generateEstimateNumber, getProfile, saveProfile, getEstimates, updateEstimate } from "@/lib/estimates-storage"
import { savePendingAudio, getUnprocessedAudio, deletePendingAudio, getPriceListForAI, getClients, type Client } from "@/lib/db"
import type { BusinessInfo } from "@/lib/estimates-storage"
import { toast } from "@/components/toast"
import { trackAnalyticsEvent } from "@/lib/analytics"
import { withAuthHeaders } from "@/lib/auth-headers"
import { copyReferralShareUrl, getReferralShareUrl } from "@/lib/referrals"
const PaymentOptionModal = dynamic(() => import("@/components/payment-option-modal").then(mod => mod.PaymentOptionModal), { ssr: false })
import { AudioRecorder } from "@/components/audio-recorder"
const PDFPreviewModal = dynamic(() => import("@/components/pdf-preview-modal").then(mod => mod.PDFPreviewModal), { ssr: false })
const EmailModal = dynamic(() => import("@/components/email-modal").then(mod => mod.EmailModal), { ssr: false })
const ExcelImportModal = dynamic(() => import("@/components/excel-import-modal").then(mod => mod.ExcelImportModal), { ssr: false })
import { Mail, FileSpreadsheet, Users, PenTool, Sparkles } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
const SignaturePad = dynamic(() => import("@/components/signature-pad").then(mod => mod.SignaturePad), { ssr: false })

// Unit and Category types for professional estimating
type EstimateUnit = 'ea' | 'LS' | 'hr' | 'day' | 'SF' | 'LF' | '%' | 'other'
type EstimateCategory = 'PARTS' | 'LABOR' | 'SERVICE' | 'OTHER'

interface EstimateItem {
    id: string
    itemNumber: number
    category: EstimateCategory
    description: string
    quantity: number
    unit: EstimateUnit
    unit_price: number
    total: number
    is_value_add?: boolean
    notes?: string
}

// Section for Division-based grouping
interface EstimateSection {
    id: string
    name: string                // e.g., "Concrete Work", "Electrical"
    divisionCode?: string       // e.g., "03", "16"
    items: EstimateItem[]
}

interface UpsellOption {
    tier: "better" | "best"
    title: string
    description: string
    addedItems: EstimateItem[]
}

interface Estimate {
    items: EstimateItem[]          // Legacy flat items (for backward compat)
    sections?: EstimateSection[]   // NEW: Division-based grouping
    summary_note: string
    clientSignature?: string // NEW
    signedAt?: string // NEW
    status?: 'draft' | 'sent' | 'paid' // NEW
    warnings?: string[]
    payment_terms?: string
    closing_note?: string
    upsellOptions?: UpsellOption[]
}

type Step = "input" | "transcribing" | "verifying" | "generating" | "result"

const ESTIMATE_CATEGORIES: EstimateCategory[] = ["PARTS", "LABOR", "SERVICE", "OTHER"]
const ESTIMATE_UNITS: EstimateUnit[] = ["ea", "LS", "hr", "day", "SF", "LF", "%", "other"]

function isRecord(value: unknown): value is Record<string, any> {
    return value !== null && typeof value === "object"
}

function toSafeNumber(value: unknown, fallback = 0): number {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string") {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) return parsed
    }
    return fallback
}

function toSafeString(value: unknown, fallback = ""): string {
    return typeof value === "string" ? value : fallback
}

function normalizeCategory(value: unknown): EstimateCategory {
    if (typeof value !== "string") return "PARTS"
    const normalized = value.trim().toUpperCase()
    return ESTIMATE_CATEGORIES.includes(normalized as EstimateCategory)
        ? (normalized as EstimateCategory)
        : "PARTS"
}

function normalizeUnit(value: unknown): EstimateUnit {
    if (typeof value !== "string") return "ea"
    const normalized = value.trim()
    return ESTIMATE_UNITS.includes(normalized as EstimateUnit)
        ? (normalized as EstimateUnit)
        : "ea"
}

function normalizeEstimateItem(input: unknown, index: number): EstimateItem {
    const item = isRecord(input) ? input : {}
    const quantity = Math.max(0, toSafeNumber(item.quantity, 1))
    const unitPrice = Math.max(0, toSafeNumber(item.unit_price, 0))
    const total = toSafeNumber(item.total, quantity * unitPrice)
    const id = toSafeString(item.id).trim()
    const description = toSafeString(item.description).trim()

    return {
        id: id || `item-${index + 1}`,
        itemNumber: Math.max(1, Math.floor(toSafeNumber(item.itemNumber, index + 1))),
        category: normalizeCategory(item.category),
        description,
        quantity,
        unit: normalizeUnit(item.unit),
        unit_price: unitPrice,
        total,
        is_value_add: typeof item.is_value_add === "boolean" ? item.is_value_add : undefined,
        notes: typeof item.notes === "string" ? item.notes : undefined,
    }
}

function normalizeEstimateSection(input: unknown, sectionIndex: number): EstimateSection {
    const section = isRecord(input) ? input : {}
    const rawItems = Array.isArray(section.items) ? section.items : []
    const items = rawItems
        .map((item, itemIndex) => normalizeEstimateItem(item, itemIndex))
        .filter((item) => item.description !== "")
    const id = toSafeString(section.id).trim()
    const name = toSafeString(section.name).trim()
    const divisionCode = toSafeString(section.divisionCode).trim()

    return {
        id: id || `section-${sectionIndex + 1}`,
        name: name || `Section ${sectionIndex + 1}`,
        divisionCode: divisionCode || undefined,
        items,
    }
}

function normalizeUpsellTier(value: unknown, fallback: "better" | "best"): "better" | "best" {
    if (typeof value !== "string") return fallback
    const normalized = value.trim().toLowerCase()
    if (normalized === "better" || normalized === "best") return normalized
    return fallback
}

function normalizeUpsellOption(input: unknown, optionIndex: number): UpsellOption | null {
    const option = isRecord(input) ? input : {}
    const fallbackTier = optionIndex === 0 ? "better" : "best"
    const tier = normalizeUpsellTier(option.tier, fallbackTier)
    const addedItems = (Array.isArray(option.addedItems) ? option.addedItems : [])
        .map((item, itemIndex) => normalizeEstimateItem(item, itemIndex))
        .filter((item) => item.description !== "")

    if (addedItems.length === 0) return null

    return {
        tier,
        title: toSafeString(option.title).trim() || (tier === "better" ? "Better Option" : "Best Option"),
        description: toSafeString(option.description).trim(),
        addedItems,
    }
}

function normalizeUpsellOptions(input: unknown): UpsellOption[] {
    if (!Array.isArray(input)) return []
    return input
        .map((option, optionIndex) => normalizeUpsellOption(option, optionIndex))
        .filter((option): option is UpsellOption => option !== null)
}

function normalizeEstimatePayload(input: unknown): Estimate {
    const estimate = isRecord(input) ? input : {}
    const rawItems = Array.isArray(estimate.items) ? estimate.items : []
    const rawSections = Array.isArray(estimate.sections) ? estimate.sections : []
    const rawWarnings = Array.isArray(estimate.warnings) ? estimate.warnings : []
    const rawUpsellOptions = Array.isArray(estimate.upsellOptions) ? estimate.upsellOptions : []

    const items = rawItems
        .map((item, index) => normalizeEstimateItem(item, index))
        .filter((item) => item.description !== "")

    const sections = rawSections
        .map((section, sectionIndex) => normalizeEstimateSection(section, sectionIndex))
        .filter((section) => section.items.length > 0)

    const warnings = rawWarnings
        .filter((warning): warning is string => typeof warning === "string")
        .map((warning) => warning.trim())
        .filter(Boolean)
    const upsellOptions = normalizeUpsellOptions(rawUpsellOptions)

    return {
        items,
        ...(sections.length > 0 ? { sections } : {}),
        summary_note: toSafeString(estimate.summary_note),
        payment_terms: toSafeString(estimate.payment_terms),
        closing_note: toSafeString(estimate.closing_note),
        warnings,
        ...(upsellOptions.length > 0 ? { upsellOptions } : {}),
    }
}

function lineTotal(item: EstimateItem | null | undefined): number {
    if (!item) return 0
    const quantity = toSafeNumber(item.quantity, 0)
    const unitPrice = toSafeNumber(item.unit_price, 0)
    return toSafeNumber(item.total, quantity * unitPrice)
}

function getAllItemsFromEstimate(est: Estimate): EstimateItem[] {
    const flatItems = Array.isArray(est.items) ? est.items : []
    const sectionItems = Array.isArray(est.sections)
        ? est.sections.flatMap((section) => (Array.isArray(section?.items) ? section.items : []))
        : []

    return [...flatItems, ...sectionItems].map((item, index) => normalizeEstimateItem(item, index))
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
    const [isExcelModalOpen, setIsExcelModalOpen] = useState(false)
    const [isOffline, setIsOffline] = useState(false)
    const [pendingAudioId, setPendingAudioId] = useState<string | null>(null)
    const [projectType, setProjectType] = useState<'residential' | 'commercial'>('residential')
    const [paymentLink, setPaymentLink] = useState<string | null>(null)
    const [paymentLinkId, setPaymentLinkId] = useState<string | null>(null)
    const [paymentLinkType, setPaymentLinkType] = useState<'full' | 'deposit' | 'custom' | null>('full')
    const [isGeneratingPaymentLink, setIsGeneratingPaymentLink] = useState(false)
    const [includePaymentLink, setIncludePaymentLink] = useState(false)
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
    const [isCopyingReferral, setIsCopyingReferral] = useState(false)
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false)

    const fileInputRef = useRef<HTMLInputElement>(null)
    const draftMetaRef = useRef<{ id: string; estimateNumber: string } | null>(null)
    const handledPaymentIntentRef = useRef(false)

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

    const redirectToLoginForPaymentLink = useCallback(() => {
        const params = new URLSearchParams({
            next: "/new-estimate",
            intent: "payment-link",
        })
        router.push(`/login?${params.toString()}`)
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
        const profile = getProfile()
        if (profile) {
            setBusinessProfile(profile)
            if (profile.tax_rate) setTaxRate(profile.tax_rate)
        }

        // Check for duplicate estimate from history page
        const duplicateData = localStorage.getItem('duplicate_estimate')
        if (duplicateData) {
            try {
                const data = JSON.parse(duplicateData)
                resetDraftMeta()
                setEstimate(normalizeEstimatePayload(data))
                setClientName(data.clientName || '')
                setClientAddress(data.clientAddress || '')
                if (data.taxRate) setTaxRate(data.taxRate)
                setStep('result')
                localStorage.removeItem('duplicate_estimate')
                toast('📋 Estimate duplicated! Edit and save.', 'success')
            } catch (e) {
                console.error('Failed to load duplicate data:', e)
                localStorage.removeItem('duplicate_estimate')
            }
        }
    }, [])

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
    }, [pendingAudioId])

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

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])
        if (files.length > 0) {
            setImages(prev => [...prev, ...files])
            const newUrls = files.map(file => URL.createObjectURL(file))
            setPreviewUrls(prev => [...prev, ...newUrls])
        }
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
                    projectType,
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
                    throw new Error("Monthly AI generation quota reached. Upgrade flow will be enabled soon.")
                } else if (status === 401 || status === 403) {
                    throw new Error("API key issue. Please check your configuration.")
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
        } catch (error: any) {
            console.error("Generate error:", error)

            // Determine error type for better messaging
            const isNetworkError = error.message?.includes("fetch") || error.message?.includes("network")
            const errorMessage = isNetworkError
                ? "Network error. Check your connection and try again."
                : error.message || "Failed to generate estimate."

            toast(`❌ ${errorMessage}`, "error")
            setStep("verifying")
        }
    }

    const handleItemChange = (index: number, field: keyof EstimateItem, value: string | number | boolean) => {
        if (!estimate) return
        const newItems = [...estimate.items]
        const item = { ...newItems[index] }
        if (field === "description" || field === "notes" || field === "id") {
            (item as any)[field] = value as string
        } else if (field === "category") {
            item.category = value as EstimateCategory
        } else if (field === "unit") {
            item.unit = value as EstimateUnit
        } else if (field === "is_value_add") {
            item.is_value_add = value as boolean
        } else {
            (item as any)[field] = Number(value)
            item.total = item.quantity * item.unit_price
        }
        newItems[index] = item
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
            const item = { ...newItems[itemIndex] }
            if (!newItems[itemIndex]) return section
            if (field === "description" || field === "notes" || field === "id") {
                (item as any)[field] = value as string
            } else if (field === "category") {
                item.category = value as EstimateCategory
            } else if (field === "unit") {
                item.unit = value as EstimateUnit
            } else {
                (item as any)[field] = Number(value)
                item.total = item.quantity * item.unit_price
            }
            newItems[itemIndex] = item
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
                business={businessProfile ?? undefined}
                paymentLink={includePaymentLink && paymentLink ? paymentLink : undefined}
                signature={includeSignature ? estimate.clientSignature : undefined}
                signedAt={includeSignature ? estimate.signedAt : undefined}
                templateUrl={businessProfile?.estimate_template_url}
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
        businessProfile,
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
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sentAt: status === "sent" ? new Date().toISOString() : undefined,
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
    ])

    const persistCurrentEstimateAsSent = useCallback(async () => {
        const nextEstimate = await buildLocalEstimatePayload("sent")
        const existing = (await getEstimates()).find((entry) => entry.id === nextEstimate.id)

        if (!existing) {
            await saveEstimate(nextEstimate)
            return nextEstimate
        }

        const sentAt = existing.sentAt || nextEstimate.sentAt || new Date().toISOString()
        await updateEstimate(existing.id, {
            ...nextEstimate,
            createdAt: existing.createdAt,
            sentAt,
            status: "sent",
            synced: false,
        })

        return { ...existing, ...nextEstimate, createdAt: existing.createdAt, sentAt, status: "sent" as const }
    }, [buildLocalEstimatePayload])

    const handleSave = async () => {
        if (!estimate) return
        setIsSaving(true)
        try {
            const localEstimate = await buildLocalEstimatePayload("draft")
            const allItems = localEstimate.items || []
            await saveEstimate(localEstimate)
            void trackAnalyticsEvent({
                event: "draft_saved",
                estimateId: localEstimate.id,
                estimateNumber: localEstimate.estimateNumber,
                metadata: {
                    totalAmount: localEstimate.totalAmount,
                    itemCount: allItems.length,
                    hasAttachments: Boolean(localEstimate.attachments),
                },
            })
            toast("✅ Estimate saved successfully!", "success")
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
        <div className="max-w-md mx-auto space-y-6 pb-20">
            <CardHeader className="px-0 pb-2">
                <CardTitle className="text-2xl font-bold">
                    {step === "input" && "New Estimate"}
                    {step === "transcribing" && "Processing Audio..."}
                    {step === "verifying" && "Verify Details"}
                    {step === "generating" && "Creating Estimate..."}
                    {step === "result" && "Estimate Ready"}
                </CardTitle>
            </CardHeader>

            {/* STEP 1: INPUT */}
            {step === "input" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">

                    {/* Project Type Selector */}
                    <div className="flex p-1 bg-muted rounded-lg -mb-2">
                        <Button
                            variant={projectType === 'residential' ? 'default' : 'ghost'}
                            className="flex-1 rounded-md h-8 text-xs font-medium"
                            onClick={() => setProjectType('residential')}
                        >
                            🏠 Residential
                        </Button>
                        <Button
                            variant={projectType === 'commercial' ? 'default' : 'ghost'}
                            className="flex-1 rounded-md h-8 text-xs font-medium"
                            onClick={() => setProjectType('commercial')}
                        >
                            🏢 Commercial
                        </Button>
                    </div>

                    {/* CHEAT SHEET (Practice Mode) */}
                    {/* Only show if no logic (simplified for now: always show or manage via state if needed) */}
                    <div className="glass-card p-4 relative overflow-hidden group border-blue-500/30 shadow-[0_0_20px_-10px_rgba(59,130,246,0.5)]">
                        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 animate-pulse" />
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-blue-500/20 rounded-full shrink-0 mt-1">
                                <Sparkles className="w-4 h-4 text-blue-400" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs font-bold text-blue-300 uppercase tracking-wider">
                                    Try saying this:
                                </p>
                                <p className="text-sm font-medium text-white italic leading-relaxed">
                                    &quot;Bathroom renovation. <span className="text-blue-400">50 sqft tile</span>. Install new vanity. <span className="text-blue-400">Labor is $400</span>. Client is <span className="text-blue-400">Mike</span>.&quot;
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Voice Input (Primary) */}
                    <div className="flex flex-col items-center justify-center space-y-4 py-2">
                        <AudioRecorder
                            onAudioCaptured={handleAudioCaptured}
                            onAudioRemoved={() => setAudioBlob(null)}
                        />
                        <p className="text-sm text-muted-foreground text-center">
                            Tap to record job details.
                        </p>
                    </div>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-background px-2 text-muted-foreground">Or add photos</span>
                        </div>
                    </div>

                    {/* Photo Input (Secondary) */}
                    <div className="space-y-4">
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
                    </div>

                    {/* Manual Entry Button */}
                    <Button
                        variant="ghost"
                        className="w-full text-muted-foreground"
                        onClick={() => setStep("verifying")}
                    >
                        Skip to manual entry
                    </Button>
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
                            <span className="text-xs text-muted-foreground">Edit if needed</span>
                        </div>
                        <Textarea
                            value={transcribedText}
                            onChange={(e) => setTranscribedText(e.target.value)}
                            className="min-h-[150px] text-lg p-4 leading-relaxed"
                            placeholder="Describe the job here..."
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

                    <Button
                        size="lg"
                        className="w-full h-14 text-lg font-semibold"
                        onClick={handleGenerateEstimate}
                        disabled={!transcribedText.trim() && images.length === 0}
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
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-xl font-bold">Estimate Draft</CardTitle>
                            <div className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                AI Generated
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
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
                            {estimate.upsellOptions && estimate.upsellOptions.length > 0 && (
                                <div className="space-y-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                                    <p className="text-sm font-semibold text-primary">
                                        ✨ Auto-Upsell Packages
                                    </p>
                                    <div className="space-y-3">
                                        {estimate.upsellOptions.map((option, index) => {
                                            const addedTotal = option.addedItems.reduce((sum, item) => sum + lineTotal(item), 0)
                                            return (
                                                <div key={`${option.tier}-${index}`} className="rounded-md border bg-background p-3 space-y-2">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div>
                                                            <p className="text-sm font-semibold">
                                                                {option.tier === "better" ? "Better" : "Best"}: {option.title}
                                                            </p>
                                                            {option.description && (
                                                                <p className="text-xs text-muted-foreground mt-1">{option.description}</p>
                                                            )}
                                                        </div>
                                                        <p className="text-sm font-bold text-primary">+${addedTotal.toFixed(2)}</p>
                                                    </div>
                                                    <ul className="space-y-1">
                                                        {option.addedItems.map((item, itemIndex) => (
                                                            <li
                                                                key={`${item.id}-${itemIndex}`}
                                                                className="text-xs text-muted-foreground flex justify-between gap-2"
                                                            >
                                                                <span>{item.description}</span>
                                                                <span className="font-medium text-foreground">+${lineTotal(item).toFixed(2)}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="w-full"
                                                        onClick={() => handleApplyUpsellOption(option.tier)}
                                                    >
                                                        <Plus className="h-3 w-3 mr-2" />
                                                        Add {option.tier === "better" ? "Better" : "Best"} Package
                                                    </Button>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}
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

                            <div className="space-y-4">
                                {(estimate.items || []).map((item, index) => {
                                    // Use the new category field directly (with fallback for old data)
                                    const currentCategory = item.category || 'PARTS'
                                    const currentUnit = item.unit || 'ea'

                                    return (
                                        <div key={item.id || index} className="flex flex-col gap-2 py-3 border-b last:border-0">
                                            {/* Row 1: Item #, Category, Description, Delete */}
                                            <div className="flex items-start gap-2">
                                                {/* Item Number */}
                                                <span className="w-6 h-9 flex items-center justify-center text-xs font-mono text-muted-foreground">
                                                    #{item.itemNumber || index + 1}
                                                </span>
                                                {/* Category Dropdown */}
                                                <select
                                                    value={currentCategory}
                                                    onChange={(e) => handleItemChange(index, "category", e.target.value)}
                                                    className="h-9 px-2 rounded-md border bg-white text-xs font-medium text-gray-700 shrink-0"
                                                >
                                                    <option value="PARTS">🔧 Parts</option>
                                                    <option value="LABOR">👷 Labor</option>
                                                    <option value="SERVICE">📋 Service</option>
                                                    <option value="OTHER">📦 Other</option>
                                                </select>
                                                <Input
                                                    value={item.description}
                                                    onChange={(e) => handleItemChange(index, "description", e.target.value)}
                                                    className="font-medium border px-2 h-auto focus-visible:ring-1 flex-1 bg-white text-gray-900"
                                                    placeholder="Item Description"
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 text-destructive hover:text-destructive"
                                                    onClick={() => handleDeleteItem(index)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                            {/* Row 2: Qty, Unit, Unit Price, Total */}
                                            <div className="flex gap-2 items-center ml-8">
                                                <div className="w-16">
                                                    <label className="text-[10px] text-muted-foreground">Qty</label>
                                                    <Input
                                                        type="number"
                                                        value={item.quantity}
                                                        onChange={(e) => handleItemChange(index, "quantity", e.target.value)}
                                                        className="h-8 text-gray-900 bg-white border"
                                                    />
                                                </div>
                                                <div className="w-20">
                                                    <label className="text-[10px] text-muted-foreground">Unit</label>
                                                    <select
                                                        value={currentUnit}
                                                        onChange={(e) => handleItemChange(index, "unit", e.target.value)}
                                                        className="w-full h-8 px-2 rounded-md border bg-white text-xs text-gray-700"
                                                    >
                                                        <option value="ea">ea</option>
                                                        <option value="LS">LS</option>
                                                        <option value="hr">hr</option>
                                                        <option value="day">day</option>
                                                        <option value="SF">SF</option>
                                                        <option value="LF">LF</option>
                                                        <option value="%">%</option>
                                                        <option value="other">other</option>
                                                    </select>
                                                </div>
                                                <div className="flex-1">
                                                    <label className="text-[10px] text-muted-foreground">Unit $ ({currentUnit})</label>
                                                    <Input
                                                        type="number"
                                                        value={item.unit_price}
                                                        onChange={(e) => handleItemChange(index, "unit_price", e.target.value)}
                                                        className="h-8 text-gray-900 bg-white border"
                                                    />
                                                </div>
                                                <div className="w-24 text-right">
                                                    <label className="text-[10px] text-muted-foreground">Total</label>
                                                    <p className="font-bold py-1">
                                                        ${lineTotal(item).toFixed(2)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Action Buttons: Add Item / Add Section / Upload CSV */}
                            <div className="flex gap-2 flex-wrap">
                                <Button
                                    variant="outline"
                                    className="flex-1"
                                    onClick={handleAddItem}
                                >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Item
                                </Button>
                                <Button
                                    variant="outline"
                                    className="flex-1"
                                    onClick={handleAddSection}
                                >
                                    <Plus className="h-4 w-4 mr-2" />
                                    📁 Section
                                </Button>
                                <Button
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => setIsExcelModalOpen(true)}
                                >
                                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                                    📊 CSV
                                </Button>
                            </div>

                            {/* ========== Sections (Division Groups) ========== */}
                            {estimate.sections && estimate.sections.length > 0 && (
                                <div className="space-y-4 mt-4">
                                    {estimate.sections.map((section) => {
                                        const sectionItems = section.items || []
                                        const sectionSubtotal = sectionItems.reduce((sum, item) => sum + lineTotal(item), 0)
                                        return (
                                            <div key={section.id} className="border-2 border-primary/30 rounded-lg p-3 bg-primary/5">
                                                {/* Section Header */}
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-lg">📁</span>
                                                        <Input
                                                            value={section.name}
                                                            onChange={(e) => handleEditSectionName(section.id, e.target.value)}
                                                            className="font-semibold text-primary bg-transparent border-0 border-b focus-visible:ring-0 px-0 h-7"
                                                            placeholder="Section Name"
                                                        />
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-destructive hover:text-destructive h-7 px-2"
                                                        onClick={() => handleDeleteSection(section.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>

                                                {/* Section Items */}
                                                <div className="space-y-2">
                                                    {sectionItems.map((item, itemIdx) => {
                                                        const currentCategory = item.category || 'PARTS'
                                                        const currentUnit = item.unit || 'ea'
                                                        return (
                                                            <div key={item.id || itemIdx} className="flex flex-col gap-1 py-2 border-b border-primary/20 last:border-0">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="w-5 text-xs font-mono text-muted-foreground">#{item.itemNumber || itemIdx + 1}</span>
                                                                    <select
                                                                        value={currentCategory}
                                                                        onChange={(e) => handleSectionItemChange(section.id, itemIdx, "category", e.target.value)}
                                                                        className="h-8 px-2 rounded-md border bg-white text-xs font-medium text-gray-700"
                                                                    >
                                                                        <option value="PARTS">🔧</option>
                                                                        <option value="LABOR">👷</option>
                                                                        <option value="SERVICE">📋</option>
                                                                        <option value="OTHER">📦</option>
                                                                    </select>
                                                                    <Input
                                                                        value={item.description}
                                                                        onChange={(e) => handleSectionItemChange(section.id, itemIdx, "description", e.target.value)}
                                                                        className="flex-1 h-8 text-sm bg-white"
                                                                        placeholder="Description"
                                                                    />
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-6 w-6 text-destructive"
                                                                        onClick={() => handleDeleteSectionItem(section.id, itemIdx)}
                                                                    >
                                                                        <Trash2 className="h-3 w-3" />
                                                                    </Button>
                                                                </div>
                                                                <div className="flex gap-2 ml-5">
                                                                    <Input
                                                                        type="number"
                                                                        value={item.quantity}
                                                                        onChange={(e) => handleSectionItemChange(section.id, itemIdx, "quantity", e.target.value)}
                                                                        className="w-16 h-7 text-xs bg-white"
                                                                        placeholder="Qty"
                                                                    />
                                                                    <select
                                                                        value={currentUnit}
                                                                        onChange={(e) => handleSectionItemChange(section.id, itemIdx, "unit", e.target.value)}
                                                                        className="w-16 h-7 px-1 rounded-md border bg-white text-xs"
                                                                    >
                                                                        <option value="ea">ea</option>
                                                                        <option value="LS">LS</option>
                                                                        <option value="hr">hr</option>
                                                                        <option value="day">day</option>
                                                                        <option value="SF">SF</option>
                                                                        <option value="LF">LF</option>
                                                                    </select>
                                                                    <Input
                                                                        type="number"
                                                                        value={item.unit_price}
                                                                        onChange={(e) => handleSectionItemChange(section.id, itemIdx, "unit_price", e.target.value)}
                                                                        className="w-20 h-7 text-xs bg-white"
                                                                        placeholder="$"
                                                                    />
                                                                    <span className="text-sm font-semibold w-20 text-right">
                                                                        ${lineTotal(item).toFixed(2)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>

                                                {/* Add Item to Section + Subtotal */}
                                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-primary/20">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-primary h-7"
                                                        onClick={() => handleAddItemToSection(section.id)}
                                                    >
                                                        <Plus className="h-3 w-3 mr-1" />
                                                        Add Item
                                                    </Button>
                                                    <div className="text-sm font-semibold text-primary">
                                                        Subtotal: ${sectionSubtotal.toFixed(2)}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            {/* Totals Calculation */}
                            <div className="space-y-2 pt-4 border-t">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">Subtotal</span>
                                    <span>${getAllItemsFromEstimate(estimate).reduce((sum, item) => sum + lineTotal(item), 0).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground">Tax</span>
                                        <Input
                                            type="number"
                                            value={taxRate}
                                            onChange={(e) => setTaxRate(Number(e.target.value))}
                                            className="w-16 h-6 text-xs text-center"
                                        />
                                        <span className="text-muted-foreground text-xs">%</span>
                                    </div>
                                    <span>${(resultSubtotal * taxRate / 100).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center pt-2 border-t">
                                    <p className="font-bold text-lg">Total</p>
                                    <p className="font-bold text-xl text-primary">
                                        ${resultTotal.toFixed(2)}
                                    </p>
                                </div>
                            </div>

                            {/* Action Buttons - 2x2 Grid */}
                            <div className="grid grid-cols-2 gap-3 mt-4">
                                <Button
                                    size="lg"
                                    className="h-12 font-semibold"
                                    onClick={handleSave}
                                    disabled={isSaving}
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
                            >
                                <Mail className="h-4 w-4 mr-2" />
                                📧 Send to Customer
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

                            <PDFPreviewModal
                                open={isPreviewOpen}
                                onClose={() => setIsPreviewOpen(false)}
                                createDocument={() => createEstimatePdfDocument({ includeSignature: true })}
                            />

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
                                    } catch (error: any) {
                                        console.error('Email send error:', error)
                                        toast(`❌ ${error.message || 'Failed to send. Try again.'}`, 'error')
                                        throw error
                                    }
                                }}
                            />
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

            {/* Excel Import Modal */}
            <ExcelImportModal
                isOpen={isExcelModalOpen}
                onClose={() => setIsExcelModalOpen(false)}
                onImport={handleExcelImport}
            />

            {/* Client Load Modal */}
            <Dialog open={isClientModalOpen} onOpenChange={setIsClientModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Select Client</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                        {availableClients.length === 0 ? (
                            <p className="text-center text-muted-foreground py-4">No clients found.</p>
                        ) : (
                            availableClients.map(client => (
                                <div
                                    key={client.id}
                                    className="p-3 border rounded-lg hover:bg-muted cursor-pointer transition-colors"
                                    onClick={() => {
                                        setClientName(client.name)
                                        if (client.address) setClientAddress(client.address)
                                        setIsClientModalOpen(false)
                                        toast(`✅ Loaded ${client.name}`, "success")
                                    }}
                                >
                                    <p className="font-bold">{client.name}</p>
                                    {client.address && <p className="text-xs text-muted-foreground">{client.address}</p>}
                                </div>
                            ))
                        )}
                        <Button
                            variant="outline"
                            className="w-full mt-2"
                            onClick={() => {
                                setIsClientModalOpen(false)
                                router.push('/clients')
                            }}
                        >
                            <Plus className="h-4 w-4 mr-2" /> Add New Client
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
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
