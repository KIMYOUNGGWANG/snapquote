"use client"

import { useState, useRef } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertTriangle, FileText, Loader2, Receipt, RefreshCw, Sparkles, Upload, X } from "lucide-react"
import { toast } from "@/components/toast"
import { withAuthHeaders } from "@/lib/auth-headers"
import NextLink from "next/link"
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

type ReceiptParseIssue = {
    title: string
    message: string
    actionHref?: string
    actionLabel?: string
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Failed to parse receipt"
}

function getReceiptErrorPayload(value: unknown): { message: string } {
    if (value && typeof value === "object" && "error" in value) {
        const errorValue = (value as { error?: unknown }).error
        if (typeof errorValue === "string" && errorValue.trim()) {
            return { message: errorValue.trim() }
        }
        if (errorValue && typeof errorValue === "object" && "message" in errorValue) {
            const message = (errorValue as { message?: unknown }).message
            if (typeof message === "string" && message.trim()) {
                return { message: message.trim() }
            }
        }
    }

    return { message: "Failed to parse receipt" }
}

function buildReceiptParseIssue(message: string): ReceiptParseIssue {
    const normalizedMessage = message.toLowerCase()

    if (normalizedMessage.includes("pro") || normalizedMessage.includes("team")) {
        return {
            title: "Receipt AI needs Pro or Team",
            message: "The receipt photo is still selected. Open Pricing to unlock receipt parsing, or switch to manual line entry and type the material cost now.",
            actionHref: "/pricing?source=receipt_ai",
            actionLabel: "Open Pricing",
        }
    }

    if (normalizedMessage.includes("network") || normalizedMessage.includes("fetch")) {
        return {
            title: "Receipt scan paused by connection",
            message: "The upload is still selected. Reconnect and retry, or enter the material line manually before you leave the jobsite.",
        }
    }

    if (normalizedMessage.includes("no parsable") || normalizedMessage.includes("invalid")) {
        return {
            title: "Receipt could not be read",
            message: "Keep the photo selected, add vendor or job context, then retry. If the receipt is blurry, switch to manual line entry.",
        }
    }

    return {
        title: "Receipt scan did not finish",
        message: "Your receipt photo is still selected. Retry the scan, add more context, or switch to manual line entry.",
    }
}

interface ReceiptScannerProps {
    isOpen: boolean
    onClose: () => void
    onManualEntry?: () => void
    onSuccess: (result: ParsedReceiptResult) => void
}

export function ReceiptScanner({ isOpen, onClose, onManualEntry, onSuccess }: ReceiptScannerProps) {
    const [file, setFile] = useState<File | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [context, setContext] = useState("")
    const [isParsing, setIsParsing] = useState(false)
    const [parseIssue, setParseIssue] = useState<ReceiptParseIssue | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0]
        if (selectedFile) {
            if (previewUrl) URL.revokeObjectURL(previewUrl)
            setFile(selectedFile)
            setPreviewUrl(URL.createObjectURL(selectedFile))
            setParseIssue(null)
        }
    }

    const handleParse = async () => {
        if (!file) return

        setIsParsing(true)
        setParseIssue(null)
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
                const { message } = getReceiptErrorPayload(errorData)

                // User-friendly mapping for known AI fallback errors
                if (response.status === 402) {
                    throw new Error("Pro or Team tier required for Receipt AI.")
                }

                throw new Error(message)
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
            const message = getErrorMessage(error)
            setParseIssue(buildReceiptParseIssue(message))
            toast(message, "error")
        } finally {
            setIsParsing(false)
        }
    }

    const handleClose = () => {
        setFile(null)
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        setPreviewUrl(null)
        setContext("")
        setParseIssue(null)
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
                            data-testid="receipt-scanner-file-input"
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
                                    onChange={(e) => {
                                        setContext(e.target.value)
                                        if (parseIssue) setParseIssue(null)
                                    }}
                                    className="rounded-lg border-white/10 bg-slate-950 text-white placeholder:text-slate-500"
                                    data-testid="receipt-scanner-context-input"
                                />
                                <p className="text-xs text-slate-500">
                                    Adding context helps the AI understand the receipt better.
                                </p>
                            </div>
                        </div>
                    )}

                    {parseIssue ? (
                        <div
                            className="rounded-lg border border-amber-300/25 bg-amber-400/10 p-3 text-amber-50"
                            data-testid="receipt-scanner-parse-issue"
                            role="alert"
                        >
                            <div className="flex items-start gap-2">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-100" />
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold" data-testid="receipt-scanner-parse-title">{parseIssue.title}</p>
                                    <p className="mt-1 text-xs leading-5 text-amber-50/80" data-testid="receipt-scanner-parse-message">
                                        {parseIssue.message}
                                    </p>
                                </div>
                            </div>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                {parseIssue.actionHref && parseIssue.actionLabel ? (
                                    <Button asChild size="sm" className="h-11 rounded-lg" data-testid="receipt-scanner-pricing-action">
                                        <NextLink href={parseIssue.actionHref}>
                                            <Sparkles className="mr-2 h-4 w-4" />
                                            {parseIssue.actionLabel}
                                        </NextLink>
                                    </Button>
                                ) : null}
                                <Button
                                    type="button"
                                    size="sm"
                                    className="h-11 rounded-lg"
                                    onClick={() => void handleParse()}
                                    disabled={!file || isParsing}
                                    data-testid="receipt-scanner-retry-action"
                                >
                                    {isParsing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                    Retry scan
                                </Button>
                                {onManualEntry ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-11 rounded-lg border-amber-200/25 bg-slate-950/50 text-amber-50 hover:bg-slate-900 hover:text-white"
                                        onClick={() => {
                                            onManualEntry()
                                            handleClose()
                                        }}
                                        data-testid="receipt-scanner-manual-action"
                                    >
                                        <FileText className="mr-2 h-4 w-4" />
                                        Manual line entry
                                    </Button>
                                ) : null}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-11 rounded-lg text-amber-50 hover:bg-amber-400/10 hover:text-white"
                                    onClick={() => setParseIssue(null)}
                                    data-testid="receipt-scanner-keep-editing-action"
                                >
                                    <X className="mr-2 h-4 w-4" />
                                    Keep editing
                                </Button>
                            </div>
                        </div>
                    ) : null}

                    <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
                        <Button
                            variant="ghost"
                            className="rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
                            onClick={handleClose}
                            disabled={isParsing}
                            data-testid="receipt-scanner-cancel-action"
                        >
                            Cancel
                        </Button>
                        <Button
                            className="rounded-lg bg-blue-600 text-white hover:bg-blue-500"
                            disabled={!file || isParsing}
                            onClick={handleParse}
                            data-testid="receipt-scanner-submit-action"
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
