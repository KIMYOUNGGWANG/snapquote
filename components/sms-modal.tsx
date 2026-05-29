"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import NextLink from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { AlertTriangle, CheckCircle2, CreditCard, Loader2, MessageSquare, X, Info } from "lucide-react"
import { buildDeliveryIssue, type DeliveryIssue } from "@/lib/delivery-issues"

interface SmsModalProps {
    open: boolean
    onClose: () => void
    onSend: (toPhoneNumber: string, message: string) => Promise<void>
    clientPhone?: string
    estimateTotal?: number
    paymentLink?: string | null
    businessName?: string
}

function formatE164Hint(raw: string): string {
    const cleaned = raw.replace(/[^\d+]/g, "")
    return cleaned
}

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) return error.message
    return fallback
}

function getDefaultSmsMessage(input: {
    estimateTotal?: number
    paymentLink?: string | null
    businessName?: string
}) {
    const totalStr = input.estimateTotal != null ? ` Total: $${input.estimateTotal.toFixed(2)}.` : ""
    const linkStr = input.paymentLink ? ` Pay online: ${input.paymentLink}` : ""
    const fromStr = input.businessName ? ` - ${input.businessName}` : ""
    return `Your estimate is ready.${totalStr}${linkStr}${fromStr}`
}

export function SmsModal({
    open,
    onClose,
    onSend,
    clientPhone = "",
    estimateTotal,
    paymentLink,
    businessName,
}: SmsModalProps) {
    const [phone, setPhone] = useState(clientPhone)
    const [message, setMessage] = useState(() => getDefaultSmsMessage({ estimateTotal, paymentLink, businessName }))
    const [sending, setSending] = useState(false)
    const [deliveryIssue, setDeliveryIssue] = useState<DeliveryIssue | null>(null)
    const deliveryIssueRef = useRef<HTMLDivElement | null>(null)
    const hasPaymentLink = Boolean(paymentLink)
    const trimmedPhone = phone.trim()
    const isValidE164 = /^\+[1-9]\d{7,14}$/.test(trimmedPhone)
    const recipientStatusLabel = !trimmedPhone ? "Needed" : isValidE164 ? "Ready" : "Check"
    const recipientStatusClassName = !trimmedPhone
        ? "border-amber-300/20 bg-amber-400/10 text-amber-100"
        : isValidE164
            ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
            : "border-amber-300/20 bg-amber-400/10 text-amber-100"

    useEffect(() => {
        if (!open) return
        setPhone(clientPhone)
        setMessage(getDefaultSmsMessage({ estimateTotal, paymentLink, businessName }))
        setDeliveryIssue(null)
        setSending(false)
    }, [businessName, clientPhone, estimateTotal, open, paymentLink])

    useEffect(() => {
        if (!deliveryIssue) return

        const frame = window.requestAnimationFrame(() => {
            deliveryIssueRef.current?.scrollIntoView({ block: "center" })
        })

        return () => window.cancelAnimationFrame(frame)
    }, [deliveryIssue])

    if (!open || typeof document === "undefined") return null

    const handleSend = async () => {
        if (!isValidE164) {
            setDeliveryIssue(buildDeliveryIssue({
                channel: "sms",
                message: "Enter a valid phone number in international format (e.g. +14165550123).",
                targetField: "phone",
            }))
            return
        }
        if (!message.trim()) {
            setDeliveryIssue(buildDeliveryIssue({
                channel: "sms",
                message: "Message cannot be empty.",
                targetField: "message",
            }))
            return
        }

        setSending(true)
        setDeliveryIssue(null)

        try {
            await onSend(trimmedPhone, message.trim())
            onClose()
        } catch (error: unknown) {
            setDeliveryIssue(buildDeliveryIssue({
                channel: "sms",
                message: getErrorMessage(error, "Failed to send SMS. Please try again."),
            }))
        } finally {
            setSending(false)
        }
    }

    return createPortal(
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 p-2 backdrop-blur-sm sm:p-4">
            <div
                aria-describedby="sms-modal-description"
                aria-labelledby="sms-modal-title"
                aria-modal="true"
                className="field-panel flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-md flex-col overflow-hidden"
                role="dialog"
            >
                {/* Header */}
                <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
                    <div className="flex min-w-0 items-center gap-2">
                        <MessageSquare className="h-5 w-5 shrink-0 text-blue-200" />
                        <h2 id="sms-modal-title" className="min-w-0 break-words text-lg font-semibold [overflow-wrap:anywhere]">Send via SMS</h2>
                    </div>
                    <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white" onClick={onClose} aria-label="Close SMS modal">
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Content */}
                <div className="flex-1 space-y-4 overflow-y-auto p-4">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid="sms-delivery-summary">
                        <div className={`min-w-0 rounded-lg border p-2 ${recipientStatusClassName}`}>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">To</p>
                            <p className="mt-1 flex min-w-0 items-center gap-1 break-words text-sm font-semibold [overflow-wrap:anywhere]" data-testid="sms-recipient-status">
                                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                                {recipientStatusLabel}
                            </p>
                        </div>
                        <div className="min-w-0 rounded-lg border border-emerald-300/20 bg-emerald-400/10 p-2">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200/70">SMS</p>
                            <p className="mt-1 flex min-w-0 items-center gap-1 break-words text-sm font-semibold text-emerald-100 [overflow-wrap:anywhere]">
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                Ready
                            </p>
                        </div>
                        <div className={`min-w-0 rounded-lg border p-2 ${hasPaymentLink ? "border-emerald-300/20 bg-emerald-400/10" : "border-white/10 bg-slate-950/55"}`}>
                            <p className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${hasPaymentLink ? "text-emerald-200/70" : "text-slate-500"}`}>Pay</p>
                            <p
                                className={`mt-1 flex min-w-0 items-center gap-1 break-words text-sm font-semibold [overflow-wrap:anywhere] ${hasPaymentLink ? "text-emerald-100" : "text-slate-300"}`}
                                data-testid="sms-payment-link-status"
                            >
                                <CreditCard className="h-3.5 w-3.5 shrink-0" />
                                {hasPaymentLink ? "Included" : "Not attached"}
                            </p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="sms-phone" className="text-slate-300">Customer Phone *</Label>
                        <Input
                            id="sms-phone"
                            type="tel"
                            placeholder="Customer phone number"
                            value={phone}
                            onChange={(e) => {
                                setDeliveryIssue(null)
                                setPhone(formatE164Hint(e.target.value))
                            }}
                            aria-invalid={deliveryIssue?.targetField === "phone" || (!!phone && !isValidE164) ? "true" : undefined}
                            className={deliveryIssue?.targetField === "phone" || (!!phone && !isValidE164)
                                ? "rounded-lg border-amber-300/50 bg-slate-950/70 text-white placeholder:text-slate-500"
                                : "rounded-lg border-white/10 bg-slate-950/70 text-white placeholder:text-slate-500"}
                        />
                        <p className="flex items-center gap-1 break-words text-xs text-slate-400 [overflow-wrap:anywhere]">
                            <Info className="h-3 w-3 shrink-0" />
                            {!trimmedPhone
                                ? "Add a customer phone to send the SMS now."
                                : isValidE164
                                    ? "Phone is ready in international format."
                                    : "Use international format, for example +14165550123."}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="sms-message" className="text-slate-300">Message</Label>
                            <span
                                className={`text-xs ${message.length > 1100 ? "text-destructive" : "text-slate-400"}`}
                                data-testid="sms-message-length"
                            >
                                {message.length}/1200
                            </span>
                        </div>
                        <Textarea
                            id="sms-message"
                            rows={4}
                            value={message}
                            onChange={(e) => {
                                setDeliveryIssue(null)
                                setMessage(e.target.value)
                            }}
                            aria-invalid={deliveryIssue?.targetField === "message" ? "true" : undefined}
                            className={deliveryIssue?.targetField === "message"
                                ? "min-h-[112px] resize-none rounded-lg border-amber-300/50 bg-slate-950/70 text-white placeholder:text-slate-500 [overflow-wrap:anywhere]"
                                : "min-h-[112px] resize-none rounded-lg border-white/10 bg-slate-950/70 text-white placeholder:text-slate-500 [overflow-wrap:anywhere]"}
                            maxLength={1200}
                        />
                    </div>

                    {deliveryIssue ? (
                        <div
                            ref={deliveryIssueRef}
                            role="alert"
                            className="rounded-lg border border-amber-300/20 bg-amber-400/10 p-3"
                            data-testid="sms-delivery-issue"
                        >
                            <div className="flex gap-2">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                                <div className="min-w-0">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200/80">
                                        {deliveryIssue.statusLabel}
                                    </p>
                                    <p className="mt-1 break-words text-sm font-semibold text-amber-100 [overflow-wrap:anywhere]" data-testid="sms-delivery-issue-title">{deliveryIssue.title}</p>
                                    <p className="mt-1 break-words text-xs leading-5 text-amber-100/75 [overflow-wrap:anywhere]" data-testid="sms-delivery-issue-message">{deliveryIssue.message}</p>
                                </div>
                            </div>
                            {(deliveryIssue.actionHref && deliveryIssue.actionLabel) || deliveryIssue.canRetry ? (
                                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {deliveryIssue.actionHref && deliveryIssue.actionLabel ? (
                                        <Button asChild size="sm" className="h-11 w-full rounded-lg" data-testid="sms-delivery-action">
                                            <NextLink href={deliveryIssue.actionHref}>{deliveryIssue.actionLabel}</NextLink>
                                        </Button>
                                    ) : null}
                                    {deliveryIssue.canRetry ? (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-11 w-full rounded-lg border-amber-300/20 bg-slate-950/70 text-amber-100 hover:bg-amber-400/10"
                                            onClick={() => void handleSend()}
                                            disabled={sending || !isValidE164 || !message.trim()}
                                            data-testid="sms-delivery-retry-action"
                                        >
                                            Retry send
                                        </Button>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    <div id="sms-modal-description" className="flex items-start gap-2 rounded-lg border border-white/10 bg-slate-950/55 p-3 text-sm text-slate-400">
                        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-200" />
                        <span className="min-w-0 break-words [overflow-wrap:anywhere]">1 SMS credit is used per message. SMS follow-up is a paid feature and duplicate sends are protected automatically.</span>
                    </div>
                </div>

                {/* Footer */}
                <div className="grid shrink-0 grid-cols-1 gap-2 border-t border-white/10 bg-slate-950/55 p-4 sm:grid-cols-2" data-testid="sms-modal-footer">
                    <Button variant="outline" className="h-11 w-full rounded-lg border-white/10 bg-slate-950/60 text-slate-200 hover:bg-slate-900 hover:text-white" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        className="h-11 w-full rounded-lg"
                        onClick={handleSend}
                        disabled={sending || !isValidE164 || !message.trim()}
                    >
                        {sending ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />
                                Sending...
                            </>
                        ) : (
                            <>
                                <MessageSquare className="mr-2 h-4 w-4 shrink-0" />
                                Send SMS
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    )
}
