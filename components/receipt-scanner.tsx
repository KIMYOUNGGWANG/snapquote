"use client"

import { useState, useRef } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Failed to parse receipt"
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
            toast("Receipt parsed successfully.", "success")
            onSuccess({ items, warnings })
            handleClose()
        } catch (error) {
            console.error("Parse error:", error)
            toast(getErrorMessage(error), "error")
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
                        <Receipt className="h-5 w-5 text-blue-300" />
                        AI Material Receipt Scanner
                    </DialogTitle>
                    <DialogDescription>
                        Upload a receipt photo so SnapQuote can extract material line items.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {!file ? (
                        <>
                        <button
                            type="button"
                            className="flex min-h-44 w-full cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-white/15 bg-slate-950/60 p-8 text-center transition-colors hover:border-blue-300/40 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                            onClick={() => fileInputRef.current?.click()}
                            aria-describedby="receipt-scanner-upload-help"
                        >
                            <Upload className="mb-3 h-8 w-8 text-slate-400" />
                            <p className="text-sm font-medium">Click to upload receipt or material list</p>
                            <p id="receipt-scanner-upload-help" className="text-xs text-slate-500 mt-1">JPEG, PNG, WebP up to 10MB</p>
                        </button>
                        <input
                            type="file"
                            className="hidden"
                            ref={fileInputRef}
                            accept="image/*"
                            onChange={handleFileSelect}
                        />
                        </>
                    ) : (
                        <div className="space-y-4">
                            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-white/10 bg-slate-950">
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
                                <Label htmlFor="context" className="text-slate-200">Context (Optional)</Label>
                                <Input
                                    id="context"
                                    placeholder="e.g., Home Depot purchase for Smith bathroom"
                                    value={context}
                                    onChange={(e) => setContext(e.target.value)}
                                    className="rounded-lg border-white/10 bg-slate-950 text-white placeholder:text-slate-500"
                                />
                                <p className="text-xs text-slate-500">
                                    Adding context helps the AI understand the receipt better.
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
                        <Button variant="ghost" className="rounded-lg text-slate-300 hover:bg-white/10 hover:text-white" onClick={handleClose} disabled={isParsing}>
                            Cancel
                        </Button>
                        <Button
                            className="rounded-lg bg-blue-600 text-white hover:bg-blue-500"
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
