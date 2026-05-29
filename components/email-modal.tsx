"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import NextLink from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { AlertTriangle, CheckCircle2, CreditCard, Loader2, Mail, Paperclip, X } from "lucide-react"
import { buildDeliveryIssue, type DeliveryIssue } from "@/lib/delivery-issues"

interface EmailModalProps {
    open: boolean
    onClose: () => void
    onSend: (email: string, message: string) => Promise<void>
    clientEmail?: string
    estimateTotal?: number
    paymentLink?: string | null
}

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) return error.message
    return fallback
}

function getDefaultEmailMessage({
    estimateTotal,
    paymentLink,
}: {
    estimateTotal?: number
    paymentLink?: string | null
}) {
    const total = estimateTotal?.toFixed(2) || "0.00"
    const paymentLine = paymentLink ? `\n\nYou can approve or pay online here: ${paymentLink}` : ""

    return `Thank you for choosing our services!\n\nPlease find your estimate attached. The total amount is $${total}.${paymentLine}\n\nIf you have any questions, please don't hesitate to contact us.\n\nBest regards`
}

export function EmailModal({ open, onClose, onSend, clientEmail = "", estimateTotal, paymentLink }: EmailModalProps) {
    const [email, setEmail] = useState(clientEmail)
    const [message, setMessage] = useState(getDefaultEmailMessage({ estimateTotal, paymentLink }))
    const [sending, setSending] = useState(false)
    const [deliveryIssue, setDeliveryIssue] = useState<DeliveryIssue | null>(null)
    const deliveryIssueRef = useRef<HTMLDivElement | null>(null)
    const hasPaymentLink = Boolean(paymentLink)
    const trimmedEmail = email.trim()
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)
    const recipientStatusLabel = !trimmedEmail ? "Needed" : isValidEmail ? "Ready" : "Check"
    const recipientStatusClassName = !trimmedEmail
        ? "border-amber-300/20 bg-amber-400/10 text-amber-100"
        : isValidEmail
            ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
            : "border-amber-300/20 bg-amber-400/10 text-amber-100"
    const canAttemptSend = Boolean(trimmedEmail && message.trim() && !sending)

    useEffect(() => {
        if (!open) return
        setEmail(clientEmail)
        setMessage(getDefaultEmailMessage({ estimateTotal, paymentLink }))
        setDeliveryIssue(null)
        setSending(false)
    }, [clientEmail, estimateTotal, open, paymentLink])

    useEffect(() => {
        if (!deliveryIssue) return

        const frame = window.requestAnimationFrame(() => {
            deliveryIssueRef.current?.scrollIntoView({ block: "center" })
        })

        return () => window.cancelAnimationFrame(frame)
    }, [deliveryIssue])

    if (!open || typeof document === "undefined") return null

    const handleSend = async () => {
        if (!email || !email.includes("@")) {
            setDeliveryIssue(buildDeliveryIssue({
                channel: "email",
                message: "Please enter a valid email address before sending.",
                targetField: "email",
            }))
            return
        }

        setSending(true)
        setDeliveryIssue(null)

        try {
            await onSend(email, message)
            onClose()
        } catch (error: unknown) {
            setDeliveryIssue(buildDeliveryIssue({
                channel: "email",
                message: getErrorMessage(error, "Failed to send email. Please try again."),
            }))
        } finally {
            setSending(false)
        }
    }

    return createPortal(
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 p-2 backdrop-blur-sm sm:p-4">
            <div
                aria-describedby="email-modal-description"
                aria-labelledby="email-modal-title"
                aria-modal="true"
                className="field-panel flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-md flex-col overflow-hidden"
                role="dialog"
            >
                {/* Header */}
                <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
                    <div className="flex min-w-0 items-center gap-2">
                        <Mail className="h-5 w-5 shrink-0 text-blue-200" />
                        <h2 id="email-modal-title" className="min-w-0 break-words text-lg font-semibold [overflow-wrap:anywhere]">Send Estimate</h2>
                    </div>
                    <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white" onClick={onClose} aria-label="Close email modal">
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Content */}
                <div className="flex-1 space-y-4 overflow-y-auto p-4">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid="email-delivery-summary">
                        <div className={`min-w-0 rounded-lg border p-2 ${recipientStatusClassName}`}>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">To</p>
                            <p className="mt-1 flex min-w-0 items-center gap-1 break-words text-sm font-semibold [overflow-wrap:anywhere]" data-testid="email-recipient-status">
                                <Mail className="h-3.5 w-3.5 shrink-0" />
                                {recipientStatusLabel}
                            </p>
                        </div>
                        <div className="min-w-0 rounded-lg border border-emerald-300/20 bg-emerald-400/10 p-2">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200/70">PDF</p>
                            <p className="mt-1 flex min-w-0 items-center gap-1 break-words text-sm font-semibold text-emerald-100 [overflow-wrap:anywhere]">
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                Attached
                            </p>
                        </div>
                        <div className={`min-w-0 rounded-lg border p-2 ${hasPaymentLink ? "border-emerald-300/20 bg-emerald-400/10" : "border-white/10 bg-slate-950/55"}`}>
                            <p className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${hasPaymentLink ? "text-emerald-200/70" : "text-slate-500"}`}>Pay</p>
                            <p
                                className={`mt-1 flex min-w-0 items-center gap-1 break-words text-sm font-semibold [overflow-wrap:anywhere] ${hasPaymentLink ? "text-emerald-100" : "text-slate-300"}`}
                                data-testid="email-payment-link-status"
                            >
                                <CreditCard className="h-3.5 w-3.5 shrink-0" />
                                {hasPaymentLink ? "Included" : "Not attached"}
                            </p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="email" className="text-slate-300">Customer Email *</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="customer@example.com"
                            value={email}
                            onChange={(e) => {
                                setDeliveryIssue(null)
                                setEmail(e.target.value)
                            }}
                            aria-invalid={deliveryIssue?.targetField === "email" ? "true" : undefined}
                            className={deliveryIssue?.targetField === "email"
                                ? "rounded-lg border-amber-300/50 bg-slate-950/70 text-white placeholder:text-slate-500"
                                : "rounded-lg border-white/10 bg-slate-950/70 text-white placeholder:text-slate-500"}
                        />
                        {!trimmedEmail ? (
                            <p className="text-xs text-amber-100/80">Add a customer email to send the PDF now.</p>
                        ) : !isValidEmail ? (
                            <p className="text-xs text-amber-100/80">Check the email format before sending.</p>
                        ) : null}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="message" className="text-slate-300">Message</Label>
                        <Textarea
                            id="message"
                            rows={6}
                            value={message}
                            onChange={(e) => {
                                setDeliveryIssue(null)
                                setMessage(e.target.value)
                            }}
                            className="min-h-[132px] resize-none rounded-lg border-white/10 bg-slate-950/70 text-white placeholder:text-slate-500 [overflow-wrap:anywhere]"
                        />
                    </div>

                    {deliveryIssue ? (
                        <div
                            ref={deliveryIssueRef}
                            role="alert"
                            className="rounded-lg border border-amber-300/20 bg-amber-400/10 p-3"
                            data-testid="email-delivery-issue"
                        >
                            <div className="flex gap-2">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                                <div className="min-w-0">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200/80">
                                        {deliveryIssue.statusLabel}
                                    </p>
                                    <p className="mt-1 break-words text-sm font-semibold text-amber-100 [overflow-wrap:anywhere]" data-testid="email-delivery-issue-title">{deliveryIssue.title}</p>
                                    <p className="mt-1 break-words text-xs leading-5 text-amber-100/75 [overflow-wrap:anywhere]" data-testid="email-delivery-issue-message">{deliveryIssue.message}</p>
                                </div>
                            </div>
                            {(deliveryIssue.actionHref && deliveryIssue.actionLabel) || deliveryIssue.canRetry ? (
                                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {deliveryIssue.actionHref && deliveryIssue.actionLabel ? (
                                        <Button asChild size="sm" className="h-11 w-full rounded-lg" data-testid="email-delivery-action">
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
                                            disabled={sending}
                                            data-testid="email-delivery-retry-action"
                                        >
                                            Retry send
                                        </Button>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    <div id="email-modal-description" className="flex items-start gap-2 rounded-lg border border-white/10 bg-slate-950/55 p-3 text-sm text-slate-400">
                        <Paperclip className="mt-0.5 h-4 w-4 shrink-0 text-blue-200" />
                        <span className="min-w-0 break-words [overflow-wrap:anywhere]">Your estimate PDF will be attached to this email.</span>
                    </div>
                </div>

                {/* Footer */}
                <div className="grid shrink-0 grid-cols-1 gap-2 border-t border-white/10 bg-slate-950/55 p-4 sm:grid-cols-2" data-testid="email-modal-footer">
                    <Button variant="outline" className="h-11 w-full rounded-lg border-white/10 bg-slate-950/60 text-slate-200 hover:bg-slate-900 hover:text-white" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button className="h-11 w-full rounded-lg" onClick={handleSend} disabled={!canAttemptSend}>
                        {sending ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />
                                Sending...
                            </>
                        ) : !trimmedEmail ? (
                            <>
                                <Mail className="mr-2 h-4 w-4 shrink-0" />
                                Enter Email
                            </>
                        ) : (
                            <>
                                <Mail className="mr-2 h-4 w-4 shrink-0" />
                                Send Email
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    )
}
