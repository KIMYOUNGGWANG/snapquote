"use client"

import { useEffect, useRef, useState } from "react"
import NextLink from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AlertTriangle, Check, Copy, CreditCard, Loader2, Minus, Plus, X, Zap } from "lucide-react"
import { toast } from "@/components/toast"
import { useRouter } from "next/navigation"
import { getProfile } from "@/lib/estimates-storage"
import { trackAnalyticsEvent } from "@/lib/analytics"
import { withAuthHeaders } from "@/lib/auth-headers"
import {
    buildPaymentLinkIssue,
    PaymentLinkCreationError,
    readPaymentLinkErrorPayload,
    type PaymentLinkIssue,
} from "@/lib/payment-link-errors"
import type { PriceListItem } from "@/types"

interface QuickQuoteModalProps {
    open: boolean
    onClose: () => void
    item: PriceListItem | null
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Failed to create payment link"
}

export function QuickQuoteModal({ open, onClose, item }: QuickQuoteModalProps) {
    const router = useRouter()
    const [quantity, setQuantity] = useState(1)
    const [price, setPrice] = useState(0)
    const [taxRate, setTaxRate] = useState(13)
    const [isGeneratingLink, setIsGeneratingLink] = useState(false)
    const [paymentLink, setPaymentLink] = useState<string | null>(null)
    const [paymentLinkIssue, setPaymentLinkIssue] = useState<PaymentLinkIssue | null>(null)
    const [copied, setCopied] = useState(false)
    const [businessName, setBusinessName] = useState("SnapQuote")
    const [businessPhone, setBusinessPhone] = useState("")
    const paymentLinkIssueRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        if (open && item) {
            setQuantity(1)
            setPrice(item.price)
            setPaymentLink(null)
            setPaymentLinkIssue(null)
            setCopied(false)

            const profile = getProfile()
            if (profile) {
                setBusinessName(profile.business_name || "SnapQuote")
                setBusinessPhone(profile.phone || "")
                if (profile.tax_rate) setTaxRate(profile.tax_rate)
            }
        }
    }, [open, item])

    useEffect(() => {
        if (!paymentLinkIssue) return

        const frame = window.requestAnimationFrame(() => {
            paymentLinkIssueRef.current?.scrollIntoView({ block: "center" })
        })

        return () => window.cancelAnimationFrame(frame)
    }, [paymentLinkIssue])

    if (!open || !item) return null

    const subtotal = quantity * price
    const taxAmount = subtotal * (taxRate / 100)
    const total = subtotal + taxAmount

    const generateQuoteText = (includeLink = false) => {
        let text = `Estimate from ${businessName}\n`
        text += `──────────────────\n`
        text += `${item.name}\n`
        if (quantity > 1) {
            text += `${quantity} x $${price.toFixed(2)} = $${subtotal.toFixed(2)}\n`
        } else {
            text += `$${subtotal.toFixed(2)}\n`
        }
        text += `+ Tax (${taxRate}%): $${taxAmount.toFixed(2)}\n`
        text += `──────────────────\n`
        text += `Total: $${total.toFixed(2)}\n`

        if (includeLink && paymentLink) {
            text += `\nPay online: ${paymentLink}\n`
        }

        if (businessPhone) {
            text += `\n${businessPhone}`
        }

        return text
    }

    const handleCopyToClipboard = async () => {
        try {
            const text = generateQuoteText(!!paymentLink)
            await navigator.clipboard.writeText(text)
            setCopied(true)
            toast("Copied. Paste in SMS or chat.", "success")
            setTimeout(() => setCopied(false), 2000)
        } catch {
            toast("Failed to copy.", "error")
        }
    }

    const handleGeneratePaymentLink = async () => {
        if (!navigator.onLine) {
            toast("Payment links require internet.", "warning")
            return
        }

        setIsGeneratingLink(true)
        setPaymentLinkIssue(null)
        try {
            const headers = await withAuthHeaders({ 'Content-Type': 'application/json' })
            if (!headers.authorization) {
                toast("Sign in first to generate a card payment link.", "warning")
                const params = new URLSearchParams({
                    next: "/",
                    intent: "payment-link",
                })
                router.push(`/login?${params.toString()}`)
                return
            }

            const response = await fetch('/api/create-payment-link', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    amount: total,
                    customerName: 'Customer',
                })
            })
            const data: unknown = await response.json().catch(() => ({}))

            if (!response.ok) {
                const errorDetails = readPaymentLinkErrorPayload(data)

                if (response.status === 401) {
                    toast("Session expired. Please sign in again.", "warning")
                    const params = new URLSearchParams({
                        next: "/",
                        intent: "payment-link",
                    })
                    router.push(`/login?${params.toString()}`)
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

            const paymentLinkData = data as { url?: unknown }
            if (typeof paymentLinkData.url !== "string" || !paymentLinkData.url.trim()) {
                throw new PaymentLinkCreationError(
                    "Payment link response was missing a URL.",
                    buildPaymentLinkIssue({ message: "Payment link response was missing a URL." })
                )
            }

            setPaymentLink(paymentLinkData.url)
            void trackAnalyticsEvent({
                event: "payment_link_created",
                channel: "quick_quote",
                metadata: {
                    amount: total,
                    itemName: item.name,
                    quantity,
                },
            })
            toast("Payment link ready.", "success")
        } catch (error) {
            if (!(error instanceof PaymentLinkCreationError)) {
                console.error('Payment link error:', error)
            }
            const message = getErrorMessage(error)
            const issue = error instanceof PaymentLinkCreationError
                ? error.issue
                : buildPaymentLinkIssue({ message })
            setPaymentLink(null)
            setPaymentLinkIssue(issue)
        } finally {
            setIsGeneratingLink(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 p-2 backdrop-blur-sm sm:p-4">
            <div
                aria-labelledby="quick-quote-title"
                aria-modal="true"
                className="field-panel flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-sm flex-col overflow-hidden"
                role="dialog"
            >
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-slate-950/70 p-4">
                    <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-blue-500/10 text-blue-200">
                            <Zap className="h-4 w-4" />
                        </span>
                        <h2 id="quick-quote-title" className="min-w-0 break-words text-lg font-semibold [overflow-wrap:anywhere]">Quick Quote</h2>
                    </div>
                    <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white" onClick={onClose} aria-label="Close quick quote">
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto p-4">
                    <div className="min-w-0 text-center">
                        <p className="break-words text-lg font-semibold [overflow-wrap:anywhere]" data-testid="quick-quote-item-name">{item.name}</p>
                        <p className="break-words text-xs text-slate-400 [overflow-wrap:anywhere]" data-testid="quick-quote-item-category">{item.category}</p>
                    </div>

                    <div className="flex items-center justify-center gap-4">
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-11 w-11 rounded-lg border-white/10 bg-slate-950 text-slate-100 hover:bg-slate-900"
                            onClick={() => setQuantity(Math.max(1, quantity - 1))}
                            disabled={quantity <= 1}
                            aria-label="Decrease quantity"
                        >
                            <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-12 text-center text-2xl font-bold">{quantity}</span>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-11 w-11 rounded-lg border-white/10 bg-slate-950 text-slate-100 hover:bg-slate-900"
                            onClick={() => setQuantity(quantity + 1)}
                            aria-label="Increase quantity"
                        >
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 text-slate-400">Price:</span>
                        <div className="flex min-w-0 flex-1 items-center gap-1">
                            <span className="shrink-0 text-lg font-medium">$</span>
                            <Input
                                type="number"
                                value={price}
                                onChange={(e) => setPrice(Number(e.target.value))}
                                className="min-w-0 rounded-lg border-white/10 bg-slate-950 text-lg font-medium text-white"
                            />
                        </div>
                    </div>

                    <div className="space-y-1 rounded-lg border border-white/10 bg-slate-950/70 p-3">
                        <div className="flex min-w-0 justify-between gap-3 text-sm">
                            <span className="text-slate-400">Subtotal</span>
                            <span className="break-words text-right [overflow-wrap:anywhere]">${subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex min-w-0 justify-between gap-3 text-sm">
                            <span className="text-slate-400">Tax ({taxRate}%)</span>
                            <span className="break-words text-right [overflow-wrap:anywhere]">${taxAmount.toFixed(2)}</span>
                        </div>
                        <div className="flex min-w-0 justify-between gap-3 border-t border-white/10 pt-2">
                            <span className="shrink-0 font-bold">Total</span>
                            <span className="break-words text-right text-xl font-bold text-blue-300 [overflow-wrap:anywhere]">${total.toFixed(2)}</span>
                        </div>
                    </div>

                    {paymentLink && (
                        <div className="flex min-w-0 items-center justify-center gap-1 text-center text-sm text-emerald-200">
                            <Check className="h-4 w-4 shrink-0" />
                            <span className="min-w-0 break-words [overflow-wrap:anywhere]">Payment link included</span>
                        </div>
                    )}

                    {paymentLinkIssue && !paymentLink ? (
                        <div
                            ref={paymentLinkIssueRef}
                            role="alert"
                            className="rounded-lg border border-amber-300/20 bg-amber-400/10 p-3"
                            data-testid="quick-quote-payment-issue"
                        >
                            <div className="flex gap-2">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                                <div className="min-w-0">
                                    <p className="break-words text-sm font-semibold text-amber-100 [overflow-wrap:anywhere]" data-testid="quick-quote-payment-issue-title">{paymentLinkIssue.title}</p>
                                    <p className="mt-1 break-words text-xs leading-5 text-amber-100/75 [overflow-wrap:anywhere]" data-testid="quick-quote-payment-issue-message">{paymentLinkIssue.message}</p>
                                </div>
                            </div>
                            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {paymentLinkIssue.actionHref && paymentLinkIssue.actionLabel ? (
                                    <Button asChild size="sm" className="h-11 w-full rounded-lg" data-testid="quick-quote-profile-action">
                                        <NextLink href={paymentLinkIssue.actionHref}>
                                            {paymentLinkIssue.actionLabel}
                                        </NextLink>
                                    </Button>
                                ) : null}
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-11 w-full rounded-lg border-amber-300/20 bg-slate-950/70 text-amber-100 hover:bg-amber-400/10"
                                    onClick={() => void handleGeneratePaymentLink()}
                                    disabled={isGeneratingLink}
                                    data-testid="quick-quote-retry-action"
                                >
                                    Retry
                                </Button>
                            </div>
                        </div>
                    ) : null}
                </div>

                <div className="shrink-0 space-y-2 border-t border-white/10 bg-slate-950/50 p-4" data-testid="quick-quote-modal-footer">
                    <Button
                        className="h-12 w-full rounded-lg"
                        onClick={handleCopyToClipboard}
                    >
                        {copied ? (
                            <>
                                <Check className="mr-2 h-4 w-4 shrink-0" />
                                Copied!
                            </>
                        ) : (
                            <>
                                <Copy className="mr-2 h-4 w-4 shrink-0" />
                                Copy for SMS / Chat
                            </>
                        )}
                    </Button>

                    <Button
                        variant="outline"
                        className="h-12 w-full rounded-lg border-white/10 bg-slate-950 text-slate-100 hover:bg-slate-900"
                        onClick={handleGeneratePaymentLink}
                        disabled={isGeneratingLink || !!paymentLink}
                    >
                        {isGeneratingLink ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />
                                Generating...
                            </>
                        ) : paymentLink ? (
                            <>
                                <Check className="mr-2 h-4 w-4 shrink-0" />
                                Link Ready - Copy Above
                            </>
                        ) : (
                            <>
                                <CreditCard className="mr-2 h-4 w-4 shrink-0" />
                                Add Payment Link
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    )
}
