"use client"

import { useState, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Upload, Receipt } from "lucide-react"
import { toast } from "@/components/toast"
import { withAuthHeaders } from "@/lib/auth-headers"
import Image from "next/image"

type ParsedReceiptItem = {
    id?: string
    description?: string
    quantity?: number
    unit_price?: number
    total?: number
    confidence_score?: number
}

type ParsedReceiptResult = {
    items: ParsedReceiptItem[]
    warnings: string[]
}

interface ReceiptScannerProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: (result: ParsedReceiptResult) => void
}

export function ReceiptScanner({ isOpen, onClose, onSuccess }: ReceiptScannerProps) {
    const [file, setFile] = useState<File | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [context, setContext] = useState("")
    const [isParsing, setIsParsing] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0]
        if (selectedFile) {
            setFile(selectedFile)
            setPreviewUrl(URL.createObjectURL(selectedFile))
        }
    }

    const handleParse = async () => {
        if (!file) return

        setIsParsing(true)
        try {
            const formData = new FormData()
            formData.append("file", file)
            if (context) formData.append("context", context)

            const headers = await withAuthHeaders()

            const response = await fetch("/api/parse-receipt", {
                method: "POST",
                headers,
                body: formData,
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))

                // User-friendly mapping for known AI fallback errors
                if (response.status === 402) {
                    throw new Error("Pro or Team tier required for Receipt AI.")
                }

                throw new Error(errorData.error || "Failed to parse receipt")
            }

            const data = await response.json()
            const items = Array.isArray(data.items) ? data.items : []
            const warnings = Array.isArray(data.warnings)
                ? data.warnings.filter((warning: unknown): warning is string => typeof warning === "string")
                : []
            toast("✅ Receipt parsed successfully!", "success")
            onSuccess({ items, warnings })
            handleClose()
        } catch (error: any) {
            console.error("Parse error:", error)
            toast(`❌ ${error.message || "Failed to parse receipt"}`, "error")
        } finally {
            setIsParsing(false)
        }
    }

    const handleClose = () => {
        setFile(null)
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        setPreviewUrl(null)
        setContext("")
        onClose()
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Receipt className="w-5 h-5 text-indigo-500" />
                        AI Material Receipt Scanner
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {!file ? (
                        <div
                            className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <Upload className="w-8 h-8 text-slate-400 mb-3" />
                            <p className="text-sm font-medium">Click to upload receipt or material list</p>
                            <p className="text-xs text-slate-500 mt-1">JPEG, PNG, WebP up to 10MB</p>
                            <input
                                type="file"
                                className="hidden"
                                ref={fileInputRef}
                                accept="image/*"
                                onChange={handleFileSelect}
                            />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="relative aspect-[4/3] w-full bg-slate-100 dark:bg-slate-900 rounded-lg overflow-hidden border">
                                {previewUrl && (
                                    <Image
                                        src={previewUrl}
                                        alt="Receipt Preview"
                                        fill
                                        className="object-contain"
                                    />
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="context">Context (Optional)</Label>
                                <Input
                                    id="context"
                                    placeholder="e.g., Home Depot purchase for Smith bathroom"
                                    value={context}
                                    onChange={(e) => setContext(e.target.value)}
                                />
                                <p className="text-xs text-slate-500">
                                    Adding context helps the AI understand the receipt better.
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-2 pt-4 border-t">
                        <Button variant="ghost" onClick={handleClose} disabled={isParsing}>
                            Cancel
                        </Button>
                        <Button
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                            disabled={!file || isParsing}
                            onClick={handleParse}
                        >
                            {isParsing ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Parsing AI...
                                </>
                            ) : (
                                "Extract Materials"
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
