"use client"

import { useState, useRef, useEffect } from "react"
import { Camera, Upload, X, Loader2, Save, Share2, Download, Plus, Trash2 } from "lucide-react"
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
}

import { AudioRecorder } from "@/components/audio-recorder"

interface Estimate {
    items: EstimateItem[]
    summary_note: string
}

export default function NewEstimatePage() {
    const router = useRouter()
    const [images, setImages] = useState<File[]>([])
    const [previewUrls, setPreviewUrls] = useState<string[]>([])
    const [notes, setNotes] = useState("")
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [estimate, setEstimate] = useState<Estimate | null>(null)
    const [isSaving, setIsSaving] = useState(false)
    const [isSharing, setIsSharing] = useState(false)
    const [taxRate, setTaxRate] = useState(13) // Default 13% HST
    const [clientName, setClientName] = useState("")
    const [clientAddress, setClientAddress] = useState("")
    const [businessProfile, setBusinessProfile] = useState<BusinessInfo | undefined>(undefined)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Load duplicated estimate from localStorage if available
    useEffect(() => {
        const duplicateData = localStorage.getItem('duplicate_estimate')
        if (duplicateData) {
            try {
                const data = JSON.parse(duplicateData)
                setEstimate({
                    items: data.items,
                    summary_note: data.summary_note
                })
                setClientName(data.clientName || "")
                setClientAddress(data.clientAddress || "")
                setTaxRate(data.taxRate || 13)
                // Clear the stored data
                localStorage.removeItem('duplicate_estimate')
            } catch (error) {
                console.error("Failed to load duplicate data:", error)
            }
        }
    }, [])

    // Load business profile from localStorage
    useEffect(() => {
        const profile = getProfile()
        if (profile) {
            setBusinessProfile(profile)
            // Set default tax rate from profile
            if (profile.tax_rate) {
                setTaxRate(profile.tax_rate)
            }
        }
    }, [])

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])
        if (files.length > 0) {
            setImages(prev => [...prev, ...files])
            const newUrls = files.map(file => URL.createObjectURL(file))
            setPreviewUrls(prev => [...prev, ...newUrls])
            setEstimate(null) // Reset estimate on new image
        }
    }

    const handleRemoveImage = (index: number) => {
        setImages(prev => prev.filter((_, i) => i !== index))
        setPreviewUrls(prev => {
            const newUrls = prev.filter((_, i) => i !== index)
            URL.revokeObjectURL(prev[index]) // Cleanup
            return newUrls
        })
        setEstimate(null)
        if (fileInputRef.current) {
            fileInputRef.current.value = ""
        }
    }

    const convertToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.readAsDataURL(file)
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = (error) => reject(error)
        })
    }

    const handleGenerate = async () => {
        if (images.length === 0) return
        setIsAnalyzing(true)
        try {
            const base64Images = await Promise.all(images.map(img => convertToBase64(img)))
            let base64Audio = null

            if (audioBlob) {
                base64Audio = await convertToBase64(audioBlob as File) // Blob fits File interface for FileReader
            }

            const response = await fetch("/api/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ images: base64Images, audio: base64Audio, notes }),
            })

            if (!response.ok) throw new Error("Failed to generate")

            const data = await response.json()
            setEstimate(data)
        } catch (error) {
            console.error(error)
            alert("Failed to generate estimate. Please try again.")
        } finally {
            setIsAnalyzing(false)
        }
    }

    const handleItemChange = (index: number, field: keyof EstimateItem, value: string | number) => {
        if (!estimate) return

        const newItems = [...estimate.items]
        const item = { ...newItems[index] }

        if (field === "description") {
            item.description = value as string
        } else {
            item[field] = Number(value)
            // Recalculate total for this item
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
        const newItem: EstimateItem = {
            description: "",
            quantity: 1,
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

    const handleSave = () => {
        if (!estimate) return
        setIsSaving(true)

        try {
            // Calculate totals
            const subtotal = estimate.items.reduce((sum, item) => sum + item.total, 0)
            const taxAmount = subtotal * (taxRate / 100)
            const totalAmount = subtotal + taxAmount

            // Generate estimate number
            const estimateNumber = generateEstimateNumber()

            // Save to localStorage
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

            saveEstimate(localEstimate)
            toast("✅ Estimate saved successfully!", "success")

            // Navigate after brief delay
            setTimeout(() => {
                router.push("/history")
            }, 500)

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
            // Dynamically import pdf function from react-pdf/renderer
            const { pdf } = await import("@react-pdf/renderer")

            // Generate PDF blob
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

            // Check if Web Share API is available and supports file sharing
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: "Estimate",
                    text: `Estimate Total: $${estimate.items.reduce((sum, item) => sum + item.total, 0).toFixed(2)}`,
                    files: [file],
                })
            } else {
                // Fallback: Download the file instead
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
            // User cancelled share or error occurred
        } finally {
            setIsSharing(false)
        }
    }

    return (
        <div className="max-w-md mx-auto space-y-6 pb-20">
            <CardHeader className="px-0">
                <CardTitle className="text-2xl font-bold">New Estimate</CardTitle>
            </CardHeader>

            <div className="space-y-4">
                {/* Image Upload Area */}
                {/* Image Upload Area */}
                <div className="space-y-4">
                    <div
                        className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-6 flex flex-col items-center justify-center min-h-[150px] bg-muted/50 cursor-pointer hover:bg-muted/70 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <Camera className="h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-muted-foreground text-center font-medium">
                            Tap to add photos
                        </p>
                        <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleImageSelect}
                            capture="environment"
                        />
                    </div>

                    {/* Image Previews */}
                    {previewUrls.length > 0 && (
                        <div className="grid grid-cols-2 gap-2">
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
                                        className="absolute top-1 right-1 h-6 w-6 rounded-full"
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

                {/* Notes Area */}
                <div className="space-y-2">
                    <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        Notes (Optional)
                    </label>
                    <Textarea
                        placeholder="Describe the issue (e.g., 'Leaking pipe under sink, needs copper replacement')"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="min-h-[100px] text-base"
                    />
                </div>

                {/* Audio Recorder */}
                <div className="space-y-2">
                    <label className="text-sm font-medium leading-none">
                        Voice Memo (Optional)
                    </label>
                    <AudioRecorder
                        onAudioCaptured={(blob) => setAudioBlob(blob)}
                        onAudioRemoved={() => setAudioBlob(null)}
                    />
                </div>

                {/* Action Button */}
                <Button
                    className="w-full text-lg h-12 font-semibold"
                    size="lg"
                    disabled={images.length === 0 || isAnalyzing}
                    onClick={handleGenerate}
                >
                    {isAnalyzing ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Analyzing...
                        </>
                    ) : (
                        "Generate Estimate"
                    )}
                </Button>

                {/* Estimate Result */}
                {estimate && (
                    <Card className="mt-8 animate-in fade-in slide-in-from-bottom-4">
                        <CardHeader>
                            <CardTitle>Estimate Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Client Info */}
                            <div className="grid grid-cols-1 gap-3 p-4 bg-muted/50 rounded-lg">
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground">Client Name</label>
                                    <Input
                                        value={clientName}
                                        onChange={(e) => setClientName(e.target.value)}
                                        placeholder="Enter client name"
                                        className="mt-1"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground">Client Address</label>
                                    <Input
                                        value={clientAddress}
                                        onChange={(e) => setClientAddress(e.target.value)}
                                        placeholder="Enter client address"
                                        className="mt-1"
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
                                {estimate.items.map((item, index) => (
                                    <div key={index} className="flex flex-col gap-2 py-3 border-b last:border-0">
                                        <div className="flex items-start gap-2">
                                            <Input
                                                value={item.description}
                                                onChange={(e) => handleItemChange(index, "description", e.target.value)}
                                                className="font-medium border-0 px-0 h-auto focus-visible:ring-0 flex-1"
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
                                                    className="h-8"
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <label className="text-[10px] text-muted-foreground">Price ($)</label>
                                                <Input
                                                    type="number"
                                                    value={item.unit_price}
                                                    onChange={(e) => handleItemChange(index, "unit_price", e.target.value)}
                                                    className="h-8"
                                                />
                                            </div>
                                            <div className="flex-1 text-right">
                                                <label className="text-[10px] text-muted-foreground">Total</label>
                                                <p className="font-bold py-1">${item.total.toFixed(2)}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
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

                            <div className="grid grid-cols-3 gap-2 mt-4">
                                <Button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                >
                                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                                    Save
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
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    )
}
