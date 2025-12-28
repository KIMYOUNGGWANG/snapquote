"use client"

import { useState, useRef, useEffect } from "react"
import { Camera, Upload, X, Loader2, Save, Share2, Download, Plus, Trash2, ArrowRight, Edit2, CheckCircle2, CreditCard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Image from "next/image"
import dynamic from "next/dynamic"
import { EstimatePDF } from "@/components/estimate-pdf"
import { useRouter } from "next/navigation"
import { saveEstimate, generateEstimateNumber, getProfile, saveProfile } from "@/lib/estimates-storage"
import { savePendingAudio, getUnprocessedAudio, deletePendingAudio, getPriceListForAI } from "@/lib/db"
import type { BusinessInfo } from "@/lib/estimates-storage"
import { toast } from "@/components/toast"
import { AudioRecorder } from "@/components/audio-recorder"
import { PDFPreviewModal } from "@/components/pdf-preview-modal"
import { EmailModal } from "@/components/email-modal"
import { Mail } from "lucide-react"

const PDFDownloadLink = dynamic(
    () => import("@react-pdf/renderer").then((mod) => mod.PDFDownloadLink),
    {
        ssr: false,
        loading: () => <Button variant="outline" disabled>Loading PDF...</Button>,
    }
)

interface EstimateItem {
    description: string
    quantity: number
    unit_price: number
    total: number
    is_value_add?: boolean
    notes?: string
}

interface Estimate {
    items: EstimateItem[]
    summary_note: string
    warnings?: string[]
    payment_terms?: string
    closing_note?: string
}

type Step = "input" | "transcribing" | "verifying" | "generating" | "result"

export default function NewEstimatePage() {
    const router = useRouter()
    const [step, setStep] = useState<Step>("input")

    // Data States
    const [images, setImages] = useState<File[]>([])
    const [previewUrls, setPreviewUrls] = useState<string[]>([])
    const [transcribedText, setTranscribedText] = useState("")
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
    const [estimate, setEstimate] = useState<Estimate | null>(null)

    // UI States
    const [isSaving, setIsSaving] = useState(false)
    const [isSharing, setIsSharing] = useState(false)
    const [taxRate, setTaxRate] = useState(13)
    const [clientName, setClientName] = useState("")
    const [clientAddress, setClientAddress] = useState("")
    const [businessProfile, setBusinessProfile] = useState<BusinessInfo | undefined>(undefined)
    const [isPreviewOpen, setIsPreviewOpen] = useState(false)
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false)
    const [isOffline, setIsOffline] = useState(false)
    const [pendingAudioId, setPendingAudioId] = useState<string | null>(null)
    const [projectType, setProjectType] = useState<'residential' | 'commercial'>('residential')
    const [paymentLink, setPaymentLink] = useState<string | null>(null)
    const [isGeneratingPaymentLink, setIsGeneratingPaymentLink] = useState(false)
    const [includePaymentLink, setIncludePaymentLink] = useState(false)

    const fileInputRef = useRef<HTMLInputElement>(null)

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
                setEstimate({
                    items: data.items || [],
                    summary_note: data.summary_note || '',
                    warnings: [],
                    payment_terms: '',
                    closing_note: ''
                })
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
                    toast(`🔄 Processing ${pending.length} saved recording(s)...`, "info")

                    for (const audio of pending) {
                        try {
                            const formData = new FormData()
                            formData.append("file", audio.blob, "recording.webm")

                            const response = await fetch("/api/transcribe", {
                                method: "POST",
                                body: formData,
                            })

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

            const response = await fetch("/api/transcribe", {
                method: "POST",
                body: formData,
            })

            if (!response.ok) throw new Error("Transcription failed")

            const data = await response.json()
            setTranscribedText(data.text)
            setStep("verifying")
        } catch (error) {
            console.error(error)
            toast("❌ Transcription failed. Please try again or type manually.", "error")
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
            const convertToBase64 = (file: File): Promise<string> => {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader()
                    reader.readAsDataURL(file)
                    reader.onload = () => resolve(reader.result as string)
                    reader.onerror = (error) => reject(error)
                })
            }

            const base64Images = await Promise.all(images.map(img => convertToBase64(img)))

            // Load price list for AI
            const priceListForAI = await getPriceListForAI()

            const response = await fetch("/api/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
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
                } else if (status === 401 || status === 403) {
                    throw new Error("API key issue. Please check your configuration.")
                } else if (status >= 500) {
                    throw new Error("Server error. Please try again in a few moments.")
                } else {
                    throw new Error(errorData.error || "Failed to generate estimate.")
                }
            }

            const data = await response.json()
            setEstimate(data)
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
        if (field === "description" || field === "notes") {
            (item as any)[field] = value as string
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
        const newItem: EstimateItem = { description: "[PARTS] ", quantity: 1, unit_price: 0, total: 0 }
        setEstimate({ ...estimate, items: [...estimate.items, newItem] })
    }

    const handleDeleteItem = (index: number) => {
        if (!estimate) return
        const newItems = estimate.items.filter((_, i) => i !== index)
        setEstimate({ ...estimate, items: newItems })
    }

    const handleSave = async () => {
        if (!estimate) return
        setIsSaving(true)
        try {
            const subtotal = estimate.items.reduce((sum, item) => sum + item.total, 0)
            const taxAmount = subtotal * (taxRate / 100)
            const totalAmount = subtotal + taxAmount
            const estimateNumber = generateEstimateNumber()
            const localEstimate = {
                id: crypto.randomUUID(),
                estimateNumber,
                items: estimate.items,
                summary_note: estimate.summary_note,
                clientName: clientName || "Walk-in Client",
                clientAddress: clientAddress || "N/A",
                taxRate,
                taxAmount,
                totalAmount,
                createdAt: new Date().toISOString()
            }
            await saveEstimate(localEstimate)
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
            const { pdf } = await import("@react-pdf/renderer")
            const pdfDoc = (
                <EstimatePDF
                    items={estimate.items}
                    total={estimate.items.reduce((sum, item) => sum + item.total, 0)}
                    summary={estimate.summary_note}
                    taxRate={taxRate}
                    client={{ name: clientName, address: clientAddress }}
                    business={businessProfile ?? undefined}
                />
            )
            const blob = await pdf(pdfDoc).toBlob()
            const file = new File([blob], "estimate.pdf", { type: "application/pdf" })
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: "Estimate",
                    text: `Estimate Total: $${estimate.items.reduce((sum, item) => sum + item.total, 0).toFixed(2)}`,
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

                    {/* Voice Input (Primary) */}
                    <div className="flex flex-col items-center justify-center space-y-4 py-4">
                        <AudioRecorder
                            onAudioCaptured={handleAudioCaptured}
                            onAudioRemoved={() => setAudioBlob(null)}
                        />
                        <p className="text-sm text-muted-foreground text-center">
                            Tap to record job details.<br />
                            &quot;Replace kitchen faucet, $80 labor&quot;
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
                            {/* Client Info */}
                            <div className="grid grid-cols-1 gap-3 p-4 bg-muted/50 rounded-lg">
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground">Client Name</label>
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
                                {estimate.items.map((item, index) => {
                                    // Extract category from description if present
                                    const categoryMatch = item.description.match(/^\[(PARTS|LABOR|SERVICE)\]\s*/i)
                                    const currentCategory = categoryMatch ? categoryMatch[1].toUpperCase() : 'PARTS'
                                    const descriptionWithoutCategory = item.description.replace(/^\[(PARTS|LABOR|SERVICE)\]\s*/i, '')

                                    return (
                                        <div key={index} className="flex flex-col gap-2 py-3 border-b last:border-0">
                                            <div className="flex items-start gap-2">
                                                {/* Category Dropdown */}
                                                <select
                                                    value={currentCategory}
                                                    onChange={(e) => {
                                                        const newCategory = e.target.value
                                                        const newDescription = `[${newCategory}] ${descriptionWithoutCategory}`
                                                        handleItemChange(index, "description", newDescription)
                                                    }}
                                                    className="h-9 px-2 rounded-md border bg-white text-xs font-medium text-gray-700 shrink-0"
                                                >
                                                    <option value="PARTS">🔧 Parts</option>
                                                    <option value="LABOR">👷 Labor</option>
                                                    <option value="SERVICE">📋 Service</option>
                                                </select>
                                                <Input
                                                    value={descriptionWithoutCategory}
                                                    onChange={(e) => {
                                                        const newDescription = `[${currentCategory}] ${e.target.value}`
                                                        handleItemChange(index, "description", newDescription)
                                                    }}
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
                                            <div className="flex gap-2 items-center">
                                                <div className="flex-1">
                                                    <label className="text-[10px] text-muted-foreground">Qty</label>
                                                    <Input
                                                        type="number"
                                                        value={item.quantity}
                                                        onChange={(e) => handleItemChange(index, "quantity", e.target.value)}
                                                        className="h-8 text-gray-900 bg-white border"
                                                    />
                                                </div>
                                                <div className="flex-1">
                                                    <label className="text-[10px] text-muted-foreground">Price ($)</label>
                                                    <Input
                                                        type="number"
                                                        value={item.unit_price}
                                                        onChange={(e) => handleItemChange(index, "unit_price", e.target.value)}
                                                        className="h-8 text-gray-900 bg-white border"
                                                    />
                                                </div>
                                                <div className="flex-1 text-right">
                                                    <label className="text-[10px] text-muted-foreground">Total</label>
                                                    <p className="font-bold py-1">
                                                        ${item.total.toFixed(2)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            <Button
                                variant="outline"
                                className="w-full"
                                onClick={handleAddItem}
                            >
                                <Plus className="h-4 w-4 mr-2" />
                                Add Item
                            </Button>

                            {/* Totals Calculation */}
                            <div className="space-y-2 pt-4 border-t">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">Subtotal</span>
                                    <span>${estimate.items.reduce((sum, item) => sum + item.total, 0).toFixed(2)}</span>
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
                                    <span>${(estimate.items.reduce((sum, item) => sum + item.total, 0) * taxRate / 100).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center pt-2 border-t">
                                    <p className="font-bold text-lg">Total</p>
                                    <p className="font-bold text-xl text-primary">
                                        ${(estimate.items.reduce((sum, item) => sum + item.total, 0) * (1 + taxRate / 100)).toFixed(2)}
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
                                <PDFDownloadLink
                                    document={
                                        <EstimatePDF
                                            items={estimate.items}
                                            total={estimate.items.reduce((sum, item) => sum + item.total, 0)}
                                            summary={estimate.summary_note}
                                            taxRate={taxRate}
                                            client={{ name: clientName, address: clientAddress }}
                                            business={businessProfile ?? undefined}
                                            paymentLink={includePaymentLink && paymentLink ? paymentLink : undefined}
                                        />
                                    }
                                    fileName="estimate.pdf"
                                >
                                    {({ loading }) => (
                                        <Button variant="outline" disabled={loading} size="lg" className="w-full h-12">
                                            {loading ? (
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
                                    )}
                                </PDFDownloadLink>
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

                            {/* Payment Link Toggle - Temporarily Disabled
                            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg mt-4">
                                <div className="flex items-center gap-2">
                                    <CreditCard className="h-4 w-4 text-primary" />
                                    <span className="text-sm font-medium">Include Payment Link</span>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={includePaymentLink}
                                    onClick={async () => {
                                        const newValue = !includePaymentLink
                                        setIncludePaymentLink(newValue)

                                        if (newValue && !paymentLink && !isGeneratingPaymentLink) {
                                            // Auto-generate payment link when toggled ON
                                            setIsGeneratingPaymentLink(true)
                                            try {
                                                const grandTotal = estimate.items.reduce((sum, item) => sum + item.total, 0) * (1 + taxRate / 100)
                                                const response = await fetch('/api/create-payment-link', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({
                                                        amount: grandTotal,
                                                        customerName: clientName || 'Customer',
                                                    })
                                                })

                                                if (!response.ok) {
                                                    const error = await response.json()
                                                    throw new Error(error.error || 'Failed to create payment link')
                                                }

                                                const data = await response.json()
                                                setPaymentLink(data.url)
                                                toast('💳 Payment link ready!', 'success')
                                            } catch (error: any) {
                                                console.error('Payment link error:', error)
                                                toast(`❌ ${error.message}`, 'error')
                                                setIncludePaymentLink(false) // Revert toggle on error
                                            } finally {
                                                setIsGeneratingPaymentLink(false)
                                            }
                                        }
                                    }}
                                    disabled={isGeneratingPaymentLink}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${includePaymentLink ? 'bg-primary' : 'bg-gray-300'
                                        } ${isGeneratingPaymentLink ? 'opacity-50' : ''}`}
                                >
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${includePaymentLink ? 'translate-x-6' : 'translate-x-1'
                                            }`}
                                    />
                                </button>
                            </div>
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
                            */}

                            {/* Email Button */}
                            <Button
                                variant="outline"
                                className="w-full mt-2"
                                onClick={() => setIsEmailModalOpen(true)}
                            >
                                <Mail className="h-4 w-4 mr-2" />
                                📧 Send to Customer
                            </Button>

                            <PDFPreviewModal
                                open={isPreviewOpen}
                                onClose={() => setIsPreviewOpen(false)}
                                document={
                                    <EstimatePDF
                                        items={estimate.items}
                                        total={estimate.items.reduce((sum, item) => sum + item.total, 0)}
                                        summary={estimate.summary_note}
                                        taxRate={taxRate}
                                        client={{ name: clientName, address: clientAddress }}
                                        business={businessProfile ?? undefined}
                                        paymentLink={includePaymentLink && paymentLink ? paymentLink : undefined}
                                    />
                                }
                            />

                            <EmailModal
                                open={isEmailModalOpen}
                                onClose={() => setIsEmailModalOpen(false)}
                                estimateTotal={estimate.items.reduce((sum, item) => sum + item.total, 0) * (1 + taxRate / 100)}
                                onSend={async (email, message) => {
                                    try {
                                        // Generate PDF as base64
                                        const { pdf } = await import("@react-pdf/renderer")
                                        const pdfDoc = (
                                            <EstimatePDF
                                                items={estimate.items}
                                                total={estimate.items.reduce((sum, item) => sum + item.total, 0)}
                                                summary={estimate.summary_note}
                                                taxRate={taxRate}
                                                client={{ name: clientName, address: clientAddress }}
                                                business={businessProfile ?? undefined}
                                                paymentLink={includePaymentLink && paymentLink ? paymentLink : undefined}
                                            />
                                        )
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

                                        // Send via API with PDF attachment
                                        const response = await fetch('/api/send-email', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                email,
                                                subject: `Estimate from ${businessProfile?.business_name || 'SnapQuote'}`,
                                                message,
                                                pdfBase64,
                                                businessName: businessProfile?.business_name
                                            })
                                        })

                                        if (!response.ok) {
                                            const errorData = await response.json()
                                            throw new Error(errorData.error || 'Failed to send email')
                                        }

                                        const data = await response.json()

                                        if (data.method === 'mailto') {
                                            // Open mailto if no email service configured
                                            window.open(data.mailtoUrl, '_blank')
                                            toast('📧 Email client opened. Please attach the PDF.', 'warning')
                                        } else {
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
        </div>
    )
}
