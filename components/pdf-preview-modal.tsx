"use client"

import { useState, useEffect, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertTriangle, CheckCircle2, CreditCard, Download, FileText, Loader2, Mail, RefreshCw } from "lucide-react"
import { withAuthHeaders } from "@/lib/auth-headers"
import { getReferralShareUrl } from "@/lib/referrals"
import { toast } from "@/components/toast"
import { buildDeliveryIssue, type DeliveryIssue } from "@/lib/delivery-issues"
import { lineTotal } from "@/lib/estimates/math"
import type { EstimateItem } from "@/lib/estimates-storage"

interface PDFPreviewModalProps {
    open: boolean
    onClose: () => void
    createDocument?: () => Promise<React.ReactElement>
    document?: React.ReactElement
    fileName?: string
    clientEmail?: string
    clientName?: string
    businessName?: string
    estimateTotal?: number
    estimateItems?: EstimateItem[]
    summaryNote?: string
    clientAddress?: string
    taxRate?: number
    paymentLink?: string | null
}

type PreviewMode = "review" | "pdf"

function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error("Failed to read PDF attachment."))
        reader.onloadend = () => {
            const dataUrl = reader.result?.toString()
            const base64Data = dataUrl?.split(",")[1]

            if (!base64Data) {
                reject(new Error("Failed to prepare PDF attachment."))
                return
            }

            resolve(base64Data)
        }
        reader.readAsDataURL(blob)
    })
}

function readEmailErrorPayload(payload: unknown): { message: string; code?: string } {
    if (!payload || typeof payload !== "object") {
        return { message: "Failed to send email." }
    }

    const errorPayload = payload as { error?: unknown; code?: unknown }
    const code = typeof errorPayload.code === "string" ? errorPayload.code : undefined
    const error = errorPayload.error

    if (typeof error === "string" && error.trim()) {
        return { message: error.trim(), code }
    }

    if (error && typeof error === "object" && "message" in error) {
        const nestedMessage = (error as { message?: unknown }).message
        if (typeof nestedMessage === "string" && nestedMessage.trim()) {
            return { message: nestedMessage.trim(), code }
        }
    }

    return { message: "Failed to send email.", code }
}

function getPreviewEmailMessage({
    estimateTotal,
    paymentLink,
}: {
    estimateTotal?: number
    paymentLink?: string | null
}) {
    const totalLine = estimateTotal != null
        ? `\n\nEstimate total: $${estimateTotal.toFixed(2)}`
        : ""
    const paymentLine = paymentLink
        ? `\n\nYou can approve or pay online here: ${paymentLink}`
        : ""

    return `Please find your estimate attached.${totalLine}${paymentLine}`
}

function formatMoney(value: number | undefined) {
    return `$${(value ?? 0).toFixed(2)}`
}

function EstimateReviewDocument({
    businessName,
    clientName,
    clientAddress,
    estimateItems,
    summaryNote,
    taxRate,
    estimateTotal,
    hasPaymentLink,
}: {
    businessName?: string
    clientName?: string
    clientAddress?: string
    estimateItems: EstimateItem[]
    summaryNote?: string
    taxRate?: number
    estimateTotal?: number
    hasPaymentLink: boolean
}) {
    const subtotal = estimateItems.reduce((sum, item) => sum + lineTotal(item), 0)
    const total = estimateTotal ?? subtotal * (1 + (taxRate ?? 0) / 100)
    const taxAmount = Math.max(0, total - subtotal)
    const itemCountLabel = `${estimateItems.length} ${estimateItems.length === 1 ? "item" : "items"}`

    return (
        <div
            className="h-full overflow-y-auto bg-slate-950 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:p-6"
            data-testid="pdf-preview-review-panel"
            tabIndex={0}
            aria-label="Estimate PDF review"
        >
            <div className="mx-auto min-h-full max-w-2xl rounded-sm bg-white p-3 text-slate-950 shadow-[0_24px_90px_-38px_rgba(15,23,42,0.85)] sm:p-8">
                <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-start sm:justify-between sm:pb-4">
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Customer Estimate</p>
                        <h3
                            className="mt-2 break-words text-xl font-semibold text-slate-950 [overflow-wrap:anywhere] sm:text-2xl"
                            data-testid="pdf-preview-review-business-name"
                        >
                            {businessName || "SnapQuote"}
                        </h3>
                    </div>
                    <div className="w-full shrink-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left sm:w-auto sm:text-right">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Total</p>
                        <p className="mt-1 text-xl font-semibold text-slate-950">{formatMoney(total)}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3 border-b border-slate-200 py-3 sm:grid-cols-2 sm:py-4">
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Bill to</p>
                        <p
                            className="mt-1 break-words font-semibold text-slate-950 [overflow-wrap:anywhere]"
                            data-testid="pdf-preview-review-client-name"
                        >
                            {clientName || "Customer"}
                        </p>
                        {clientAddress ? (
                            <p
                                className="mt-1 whitespace-pre-line break-words text-sm leading-5 text-slate-600 [overflow-wrap:anywhere]"
                                data-testid="pdf-preview-review-client-address"
                            >
                                {clientAddress}
                            </p>
                        ) : null}
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Delivery</p>
                        <p className="mt-1 text-sm leading-5 text-slate-700">
                            PDF attachment {hasPaymentLink ? "with payment link included" : "ready for customer review"}
                        </p>
                    </div>
                </div>

                {summaryNote ? (
                    <div className="border-b border-slate-200 py-3 sm:py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Scope summary</p>
                        <p className="mt-2 line-clamp-2 break-words text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">{summaryNote}</p>
                    </div>
                ) : null}

                <div className="py-3 sm:py-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Line items</p>
                        <p className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600" data-testid="pdf-preview-review-item-count">
                            {itemCountLabel}
                        </p>
                    </div>
                    <div className="rounded-md border border-slate-200">
                        <div className="hidden grid-cols-[1fr_64px_84px_92px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 sm:grid">
                            <span>Description</span>
                            <span className="text-right">Qty</span>
                            <span className="text-right">Rate</span>
                            <span className="text-right">Amount</span>
                        </div>
                        {estimateItems.length > 0 ? (
                            estimateItems.map((item, index) => (
                                <div
                                    key={item.id || `${item.description}-${index}`}
                                    className="border-b border-slate-100 px-3 py-3 last:border-b-0"
                                    data-testid="pdf-preview-review-line-item"
                                >
                                    <div className="grid gap-2 sm:grid-cols-[1fr_64px_84px_92px] sm:gap-3">
                                        <div className="min-w-0">
                                            <p
                                                className="break-words text-sm font-semibold text-slate-950 [overflow-wrap:anywhere]"
                                                data-testid="pdf-preview-review-line-description"
                                            >
                                                {item.description || "Line item"}
                                            </p>
                                            <p className="mt-1 break-words text-xs uppercase tracking-[0.12em] text-slate-500 [overflow-wrap:anywhere]">{item.category}</p>
                                        </div>
                                        <p className="break-words text-sm text-slate-700 [overflow-wrap:anywhere] sm:text-right">
                                            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 sm:hidden">Qty </span>
                                            {item.quantity} {item.unit}
                                        </p>
                                        <p className="text-sm text-slate-700 sm:text-right">
                                            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 sm:hidden">Rate </span>
                                            {formatMoney(item.unit_price)}
                                        </p>
                                        <p className="text-sm font-semibold text-slate-950 sm:text-right">
                                            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 sm:hidden">Amount </span>
                                            {formatMoney(lineTotal(item))}
                                        </p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="px-3 py-6 text-sm text-slate-500">No line items are available for this preview.</div>
                        )}
                    </div>
                    {estimateItems.length > 3 ? (
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                            Scroll this preview to review all {estimateItems.length} line items before sending.
                        </p>
                    ) : null}
                </div>

                <div className="ml-auto max-w-xs space-y-2 border-t border-slate-200 pt-4">
                    <div className="flex items-center justify-between text-sm text-slate-600">
                        <span>Subtotal</span>
                        <span>{formatMoney(subtotal)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-slate-600">
                        <span>Tax</span>
                        <span>{formatMoney(taxAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-lg font-semibold text-slate-950">
                        <span>Total</span>
                        <span>{formatMoney(total)}</span>
                    </div>
                </div>
            </div>
        </div>
    )
}

export function PDFPreviewModal({
    open,
    onClose,
    createDocument,
    document: pdfDocument,
    fileName = "estimate.pdf",
    clientEmail = "",
    clientName,
    businessName,
    estimateTotal,
    estimateItems = [],
    summaryNote,
    clientAddress,
    taxRate,
    paymentLink,
}: PDFPreviewModalProps) {
    const [pdfUrl, setPdfUrl] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [buildAttempt, setBuildAttempt] = useState(0)
    const [sending, setSending] = useState(false)
    const [showEmailInput, setShowEmailInput] = useState(false)
    const [email, setEmail] = useState(clientEmail)
    const [emailIssue, setEmailIssue] = useState<DeliveryIssue | null>(null)
    const [previewMode, setPreviewMode] = useState<PreviewMode>("review")
    const hasPaymentLink = Boolean(paymentLink)
    const pdfStatusLabel = loading ? "Building" : pdfUrl ? "Ready" : "Retry"
    const trimmedEmail = email.trim()
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)
    const recipientStatusLabel = !trimmedEmail ? "Needed" : isValidEmail ? "Ready" : "Check"
    const recipientStatusClassName = !trimmedEmail
        ? "border-amber-300/20 bg-amber-400/10 text-amber-100"
        : isValidEmail
            ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
            : "border-amber-300/20 bg-amber-400/10 text-amber-100"
    const canSendPreviewEmail = Boolean(isValidEmail && pdfUrl && !sending)

    const resolveDocument = useCallback(async () => {
        if (createDocument) return createDocument()
        if (pdfDocument) return pdfDocument
        throw new Error("PDF document is unavailable.")
    }, [createDocument, pdfDocument])

    useEffect(() => {
        if (!open) return
        setEmail(clientEmail)
        setShowEmailInput(false)
        setEmailIssue(null)
        setSending(false)
        setPreviewMode("review")
    }, [clientEmail, open])

    useEffect(() => {
        let currentUrl: string | null = null
        let cancelled = false

        const buildPdf = async () => {
            if (!open) return
            setLoading(true)
            setPdfUrl(null)
            setError(null)
            setEmailIssue(null)
            try {
                const [{ pdf }, pdfDocument] = await Promise.all([
                    import("@react-pdf/renderer"),
                    resolveDocument(),
                ])
                const blob = await pdf(pdfDocument).toBlob()
                if (cancelled) return
                currentUrl = URL.createObjectURL(blob)
                setPdfUrl(currentUrl)
                setLoading(false)
            } catch (err) {
                if (cancelled) return
                console.error("PDF preview error:", err)
                const message = err instanceof Error
                    ? err.message
                    : "PDF 생성 실패"
                setError(message)
                setLoading(false)
            }
        }

        void buildPdf()

        return () => {
            cancelled = true
            if (currentUrl) {
                URL.revokeObjectURL(currentUrl)
            }
        }
    }, [buildAttempt, open, resolveDocument])

    const handleDownload = () => {
        if (pdfUrl) {
            const a = document.createElement("a")
            a.href = pdfUrl
            a.download = fileName
            a.click()
        }
    }

    const handleRetryPreview = () => {
        setBuildAttempt((attempt) => attempt + 1)
    }

    const handleSendEmail = async () => {
        if (!isValidEmail) {
            setEmailIssue(buildDeliveryIssue({
                channel: "email",
                message: "Enter a valid customer email before sending this PDF.",
                targetField: "email",
            }))
            return
        }

        try {
            setSending(true)
            setEmailIssue(null)
            const { pdf } = await import("@react-pdf/renderer")
            const pdfDocument = await resolveDocument()
            const blob = await pdf(pdfDocument).toBlob()
            const base64data = await blobToBase64(blob)
            const referralUrl = await getReferralShareUrl({ source: "pdf_preview_email" })
            const message = getPreviewEmailMessage({ estimateTotal, paymentLink })

            const response = await fetch('/api/send-email', {
                method: 'POST',
                headers: await withAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    to: trimmedEmail,
                    subject: businessName ? `Estimate from ${businessName}` : "Your Estimate from SnapQuote",
                    message,
                    pdfBuffer: base64data,
                    filename: fileName,
                    clientName,
                    businessName,
                    referralUrl: referralUrl || undefined,
                })
            })

            if (!response.ok) {
                const payload = await response.json().catch(() => null)
                const errorDetails = readEmailErrorPayload(payload)
                const message = response.status === 402 && errorDetails.message === "Failed to send email."
                    ? "Monthly email quota reached. Upgrade to keep sending PDFs."
                    : errorDetails.message
                setEmailIssue(buildDeliveryIssue({
                    channel: "email",
                    message,
                    status: response.status,
                    code: errorDetails.code,
                }))
                return
            }

            toast("Email sent successfully.", "success")
            setShowEmailInput(false)
            setEmail("")
            setEmailIssue(null)
        } catch (err) {
            console.error(err)
            const message = err instanceof Error ? err.message : "Error sending email."
            setEmailIssue(buildDeliveryIssue({ channel: "email", message }))
        } finally {
            setSending(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => {
            if (!nextOpen) onClose()
        }}>
            <DialogContent className="flex h-[92dvh] w-[calc(100vw-1rem)] max-w-5xl flex-col overflow-hidden p-0 sm:h-[90vh] sm:w-[95vw]">
                <DialogHeader className="shrink-0 border-b border-white/10 bg-slate-950/80 p-4 pr-16 text-left">
                    <div className="min-w-0">
                        <DialogTitle>PDF Preview</DialogTitle>
                        <DialogDescription className="mt-1 truncate text-sm text-slate-400">
                            Review the customer PDF before delivery.
                        </DialogDescription>
                    </div>
                </DialogHeader>
                <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] bg-slate-950 lg:grid-cols-[minmax(0,1fr)_330px] lg:grid-rows-1">
                    <div className="flex min-h-0 flex-col overflow-hidden bg-slate-950">
                        <div className="flex shrink-0 gap-2 border-b border-white/10 bg-slate-950/80 p-2" data-testid="pdf-preview-view-toggle">
                            <button
                                type="button"
                                className={previewMode === "review"
                                    ? "inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-blue-400/40 bg-blue-600 px-3.5 text-xs font-medium text-white shadow-[0_18px_32px_-20px_rgba(37,99,235,0.85)] transition hover:bg-blue-500"
                                    : "inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 bg-slate-950/70 px-3.5 text-xs font-medium text-slate-100 transition hover:bg-slate-900 hover:text-white"}
                                onClick={() => setPreviewMode("review")}
                                data-testid="pdf-preview-review-tab"
                            >
                                <FileText className="mr-2 h-4 w-4" />
                                Review
                            </button>
                            <button
                                type="button"
                                className={previewMode === "pdf"
                                    ? "inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-blue-400/40 bg-blue-600 px-3.5 text-xs font-medium text-white shadow-[0_18px_32px_-20px_rgba(37,99,235,0.85)] transition hover:bg-blue-500"
                                    : "inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 bg-slate-950/70 px-3.5 text-xs font-medium text-slate-100 transition hover:bg-slate-900 hover:text-white"}
                                onClick={() => setPreviewMode("pdf")}
                                data-testid="pdf-preview-pdf-tab"
                            >
                                <FileText className="mr-2 h-4 w-4" />
                                PDF file
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-hidden">
                            {previewMode === "review" ? (
                                <EstimateReviewDocument
                                    businessName={businessName}
                                    clientName={clientName}
                                    clientAddress={clientAddress}
                                    estimateItems={estimateItems}
                                    summaryNote={summaryNote}
                                    taxRate={taxRate}
                                    estimateTotal={estimateTotal}
                                    hasPaymentLink={hasPaymentLink}
                                />
                            ) : loading ? (
                                <div className="flex h-full items-center justify-center">
                                    <Loader2 className="h-8 w-8 animate-spin text-blue-300" />
                                    <span className="ml-2 text-slate-300">Building PDF...</span>
                                </div>
                            ) : pdfUrl ? (
                                <iframe
                                    src={pdfUrl}
                                    className="h-full w-full border-0"
                                    title="PDF Preview"
                                />
                            ) : (
                                <div className="flex h-full flex-col items-center justify-center px-6 text-center text-red-200" data-testid="pdf-preview-error">
                                    <div className="rounded-lg border border-red-300/20 bg-red-400/10 p-4">
                                        <AlertTriangle className="mx-auto h-6 w-6 text-red-200" />
                                        <p className="mt-3 font-semibold">PDF generation failed.</p>
                                        {error && <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">{error}</p>}
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="mt-4 rounded-lg border-red-300/20 bg-slate-950/70 text-red-100 hover:bg-red-400/10"
                                            onClick={handleRetryPreview}
                                            data-testid="pdf-preview-retry-action"
                                        >
                                            <RefreshCw className="mr-2 h-4 w-4" />
                                            Retry
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <aside
                        className="flex max-h-[50dvh] min-h-0 flex-col border-t border-white/10 bg-slate-900/95 lg:max-h-none lg:border-l lg:border-t-0"
                        data-testid="pdf-preview-delivery-panel"
                    >
                        <div className="flex-1 space-y-3 overflow-y-auto p-4">
                            <div className="grid grid-cols-3 gap-2" data-testid="pdf-preview-delivery-summary">
                                <div className={`rounded-lg border p-2 ${recipientStatusClassName}`}>
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">To</p>
                                    <p className="mt-1 flex items-center gap-1 text-sm font-semibold" data-testid="pdf-preview-recipient-status">
                                        <Mail className="h-3.5 w-3.5 shrink-0" />
                                        {recipientStatusLabel}
                                    </p>
                                </div>
                                <div className={`rounded-lg border p-2 ${pdfUrl ? "border-emerald-300/20 bg-emerald-400/10" : "border-white/10 bg-slate-950/55"}`}>
                                    <p className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${pdfUrl ? "text-emerald-200/70" : "text-slate-400"}`}>PDF</p>
                                    <p className={`mt-1 flex items-center gap-1 text-sm font-semibold ${pdfUrl ? "text-emerald-100" : "text-slate-300"}`}>
                                        {loading ? (
                                            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                                        ) : pdfUrl ? (
                                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                        ) : (
                                            <FileText className="h-3.5 w-3.5 shrink-0" />
                                        )}
                                        {pdfStatusLabel}
                                    </p>
                                </div>
                                <div className={`rounded-lg border p-2 ${hasPaymentLink ? "border-emerald-300/20 bg-emerald-400/10" : "border-white/10 bg-slate-950/55"}`}>
                                    <p className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${hasPaymentLink ? "text-emerald-200/70" : "text-slate-400"}`}>Pay</p>
                                    <p
                                        className={`mt-1 flex items-center gap-1 text-sm font-semibold ${hasPaymentLink ? "text-emerald-100" : "text-slate-300"}`}
                                        data-testid="pdf-preview-payment-link-status"
                                    >
                                        <CreditCard className="h-3.5 w-3.5 shrink-0" />
                                        {hasPaymentLink ? "Included" : "Not attached"}
                                    </p>
                                </div>
                            </div>

                            {showEmailInput ? (
                                <div className="space-y-3 rounded-lg border border-white/10 bg-slate-950/55 p-3">
                                    <label htmlFor="pdf-preview-client-email" className="text-sm font-medium text-slate-300">
                                        Client email
                                    </label>
                                    <input
                                        id="pdf-preview-client-email"
                                        type="email"
                                        placeholder="customer@example.com"
                                        className={emailIssue?.targetField === "email"
                                            ? "h-12 w-full rounded-lg border border-amber-300/50 bg-slate-950 px-3 py-1 text-sm text-white shadow-sm transition-colors placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                                            : "h-12 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-1 text-sm text-white shadow-sm transition-colors placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"}
                                        value={email}
                                        onChange={(e) => {
                                            setEmailIssue(null)
                                            setEmail(e.target.value)
                                        }}
                                        aria-invalid={emailIssue?.targetField === "email" ? "true" : undefined}
                                    />
                                    {!emailIssue ? (
                                        <p className="text-xs leading-5 text-slate-400">
                                            {!trimmedEmail
                                                ? "Add a customer email to send this PDF now."
                                                : isValidEmail
                                                    ? `This sends the generated PDF attachment${hasPaymentLink ? " and includes the payment link in the email body." : "."}`
                                                    : "Check the email format before sending."}
                                        </p>
                                    ) : null}
                                </div>
                            ) : (
                                <div className="rounded-lg border border-white/10 bg-slate-950/55 p-3 text-sm leading-5 text-slate-400">
                                    <FileText className="mb-2 h-4 w-4 text-blue-200" />
                                    The PDF shown here is the exact file your customer will receive.
                                </div>
                            )}

                            {emailIssue ? (
                                <div className="rounded-lg border border-amber-300/20 bg-amber-400/10 p-3" data-testid="pdf-preview-email-issue" role="alert">
                                    <div className="flex gap-2">
                                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                                        <div className="min-w-0">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200/80">
                                                {emailIssue.statusLabel}
                                            </p>
                                            <p className="mt-1 text-sm font-semibold text-amber-100">{emailIssue.title}</p>
                                            <p className="mt-1 text-xs leading-5 text-amber-100/75">{emailIssue.message}</p>
                                        </div>
                                    </div>
                                    {(emailIssue.actionHref && emailIssue.actionLabel) || emailIssue.canRetry ? (
                                        <div className="mt-3 flex gap-2">
                                            {emailIssue.actionHref && emailIssue.actionLabel ? (
                                                <Button asChild size="sm" className="flex-1 rounded-lg" data-testid="pdf-preview-email-action">
                                                    <a href={emailIssue.actionHref}>{emailIssue.actionLabel}</a>
                                                </Button>
                                            ) : null}
                                            {emailIssue.canRetry ? (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="flex-1 rounded-lg border-amber-300/20 bg-slate-950/70 text-amber-100 hover:bg-amber-400/10"
                                                    onClick={() => void handleSendEmail()}
                                                    disabled={!canSendPreviewEmail}
                                                    data-testid="pdf-preview-email-retry-action"
                                                >
                                                    Retry send
                                                </Button>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>

                        <div className="flex shrink-0 gap-2 border-t border-white/10 bg-slate-950/65 p-4" data-testid="pdf-preview-action-footer">
                            {showEmailInput ? (
                                <>
                                    <Button
                                        variant="outline"
                                        className="flex-1 rounded-lg border-white/10 bg-slate-950/60 text-slate-200 hover:bg-slate-900 hover:text-white"
                                        onClick={() => {
                                            setShowEmailInput(false)
                                            setEmailIssue(null)
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                    <Button className="flex-1 rounded-lg" onClick={handleSendEmail} disabled={!canSendPreviewEmail}>
                                        {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                                        {!trimmedEmail ? "Enter Email" : "Send"}
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button
                                        variant="outline"
                                        className="flex-1 rounded-lg border-white/10 bg-slate-950/60 text-slate-100 hover:bg-slate-900 hover:text-white"
                                        onClick={() => setShowEmailInput(true)}
                                        disabled={!pdfUrl}
                                        data-testid="pdf-preview-email-toggle"
                                    >
                                        <Mail className="mr-2 h-4 w-4" />
                                        Email
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="flex-1 rounded-lg border-white/10 bg-slate-950/60 text-slate-100 hover:bg-slate-900 hover:text-white"
                                        onClick={handleDownload}
                                        disabled={!pdfUrl}
                                    >
                                        <Download className="mr-2 h-4 w-4" />
                                        Download
                                    </Button>
                                </>
                            )}
                        </div>
                    </aside>
                </div>
            </DialogContent>
        </Dialog>
    )
}
