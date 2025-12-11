"use client"

import { useState, useRef, useEffect } from "react"
import { Camera, Upload, X, Loader2, Save, Share2, Download, Plus, Trash2, ArrowRight, Edit2, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Image from "next/image"
import dynamic from "next/dynamic"
import { EstimatePDF } from "@/components/estimate-pdf"
import { useRouter } from "next/navigation"
import { saveEstimate, generateEstimateNumber, getProfile, saveProfile } from "@/lib/estimates-storage"
import type { BusinessInfo } from "@/lib/estimates-storage"
import { toast } from "@/components/toast"
import { AudioRecorder } from "@/components/audio-recorder"
import { PDFPreviewModal } from "@/components/pdf-preview-modal"

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

    const fileInputRef = useRef<HTMLInputElement>(null)

    // Load business profile
    useEffect(() => {
        const profile = getProfile()
        if (profile) {
            setBusinessProfile(profile)
            if (profile.tax_rate) setTaxRate(profile.tax_rate)
        }
    }, [])

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
            toast("Transcription failed. Please try again or type manually.", "error")
            setStep("verifying") // Go to verify anyway so user can type
        }
    }

    const handleGenerateEstimate = async () => {
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

            const response = await fetch("/api/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    images: base64Images,
                    notes: transcribedText,
                    userProfile: businessProfile ? {
                        city: businessProfile.address?.split(',')[0] || "Toronto",
                        country: "Canada",
                        taxRate: businessProfile.tax_rate || 13,
                        businessName: businessProfile.business_name || "Our Company"
                    } : undefined
                }),
            })

            if (!response.ok) throw new Error("Failed to generate")

            const data = await response.json()
            setEstimate(data)
            setStep("result")
        } catch (error) {
            console.error(error)
            alert("Failed to generate estimate. Please try again.")
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
        const newItem: EstimateItem = { description: "", quantity: 1, unit_price: 0, total: 0 }
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
                alert("Share not supported on this device. PDF downloaded instead.")
            }
        } catch (error) {
            console.error("Share failed:", error)
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
                    {/* Voice Input (Primary) */}
                    <div className="flex flex-col items-center justify-center space-y-4 py-4">
                        <AudioRecorder
                            onAudioCaptured={handleAudioCaptured}
                            onAudioRemoved={() => setAudioBlob(null)}
                        />
                        <p className="text-sm text-muted-foreground text-center">
                            Tap to record job details.<br />
                            "Replace kitchen faucet, $80 labor"
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
                                    const isFree = item.unit_price === 0
                                    return (
                                        <div key={index} className={`flex flex-col gap-2 py-3 border-b last:border-0 ${isFree ? 'bg-green-50 rounded-lg px-3 -mx-3' : ''}`}>
                                            <div className="flex items-start gap-2">
                                                {isFree && (
                                                    <span className="px-2 py-0.5 bg-green-500 text-white text-xs rounded-full shrink-0">
                                                        FREE
                                                    </span>
                                                )}
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
                                                    <p className={`font-bold py-1 ${isFree ? 'text-green-600' : ''}`}>
                                                        {isFree ? 'FREE' : `$${item.total.toFixed(2)}`}
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

                            <div className="grid grid-cols-4 gap-2 mt-4">
                                <Button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                >
                                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                                    Save
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => setIsPreviewOpen(true)}
                                >
                                    👁️ 미리보기
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
                                        />
                                    }
                                    fileName="estimate.pdf"
                                >
                                    {({ blob, url, loading, error }) => (
                                        <Button variant="outline" disabled={loading} className="w-full">
                                            <Download className="h-4 w-4 mr-1" />
                                            {loading ? "..." : "PDF"}
                                        </Button>
                                    )}
                                </PDFDownloadLink>
                                <Button
                                    variant="secondary"
                                    onClick={handleShare}
                                    disabled={isSharing}
                                >
                                    {isSharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4 mr-1" />}
                                    Share
                                </Button>
                            </div>

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
                                    />
                                }
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
