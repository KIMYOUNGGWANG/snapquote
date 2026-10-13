"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import NextLink from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { AlertTriangle, CheckCircle2, Clock, DollarSign, Eye, Link2, Loader2, Mail, Send, X } from "lucide-react"
import { toast } from "@/components/toast"
import { withAuthHeaders } from "@/lib/auth-headers"
import { buildDeliveryIssue, type DeliveryIssue } from "@/lib/delivery-issues"
import { getReferralShareUrl } from "@/lib/referrals"

interface FollowUpModalProps {
    open: boolean
    onClose: () => void
    clientName: string
    clientEmail?: string
    estimateNumber: string
    totalAmount: number
    businessName?: string
    approvalLink?: string
    customerPortalStatus?: CustomerPortalFollowUpStatus
    customerViewedAt?: string
    lastFollowedUpAt?: string
    lastFollowUpChannel?: FollowUpChannel
    onSent?: () => void | Promise<void>
}

type CustomerPortalFollowUpStatus = "shared" | "viewed" | "approved" | "change_requested"
type FollowUpChannel = "email" | "sms" | "automation"
type FollowUpRecencySummary = {
    title: string
    helper: string
    isRecent: boolean
}

type FollowUpPortalSummary = {
    label: string
    helper: string
    badge: string
    icon: "eye" | "link" | "check" | "alert" | "clock"
    className: string
    iconClassName: string
}

type SendEmailResult = {
    error?: unknown
    code?: unknown
    method?: unknown
    mailtoUrl?: unknown
    success?: unknown
}

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) return error.message
    return fallback
}

function formatFollowUpStatusDate(value?: string): string {
    if (!value) return ""

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ""

    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function getFollowUpChannelLabel(channel?: FollowUpChannel): string {
    if (channel === "email") return "Email follow-up"
    if (channel === "sms") return "SMS follow-up"
    if (channel === "automation") return "Automated follow-up"

    return "Follow-up"
}

function getFollowUpRelativeLabel(value: string, now = new Date()): string {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ""

    const diffMs = Math.max(0, now.getTime() - date.getTime())
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    if (diffMinutes < 60) return diffMinutes <= 1 ? "just now" : `${diffMinutes}m ago`

    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours < 24) return `${diffHours}h ago`

    const dateLabel = formatFollowUpStatusDate(value)
    return dateLabel ? `on ${dateLabel}` : ""
}

function getFollowUpRecencySummary({
    lastFollowedUpAt,
    lastFollowUpChannel,
}: {
    lastFollowedUpAt?: string
    lastFollowUpChannel?: FollowUpChannel
}): FollowUpRecencySummary | null {
    if (!lastFollowedUpAt) return null

    const date = new Date(lastFollowedUpAt)
    if (Number.isNaN(date.getTime())) return null

    const hoursSinceFollowUp = (Date.now() - date.getTime()) / (1000 * 60 * 60)
    const isRecent = hoursSinceFollowUp < 48
    const relativeLabel = getFollowUpRelativeLabel(lastFollowedUpAt)
    const channelLabel = getFollowUpChannelLabel(lastFollowUpChannel)

    return {
        title: isRecent ? "Followed up recently" : "Last follow-up recorded",
        helper: `${channelLabel}${relativeLabel ? ` ${relativeLabel}` : ""}. ${isRecent
            ? "Send again only if you have a new update for the customer."
            : "Use this note to keep customer contact spaced out."}`,
        isRecent,
    }
}

function getFollowUpApprovalLine({
    approvalLink,
    customerPortalStatus,
}: {
    approvalLink?: string
    customerPortalStatus?: CustomerPortalFollowUpStatus
}): string {
    if (!approvalLink) return ""

    if (customerPortalStatus === "viewed") {
        return `\n\nIf the scope looks good, you can approve it or request changes here: ${approvalLink}`
    }

    if (customerPortalStatus === "shared") {
        return `\n\nThe review link is ready here: ${approvalLink}`
    }

    return `\n\nYou can review, approve, or request changes here: ${approvalLink}`
}

function getFollowUpPortalSummary({
    approvalLink,
    customerPortalStatus,
    customerViewedAt,
}: {
    approvalLink?: string
    customerPortalStatus?: CustomerPortalFollowUpStatus
    customerViewedAt?: string
}): FollowUpPortalSummary {
    if (customerPortalStatus === "viewed") {
        const viewedLabel = formatFollowUpStatusDate(customerViewedAt)
        return {
            label: "Quote viewed",
            helper: viewedLabel
                ? `Customer opened the approval link ${viewedLabel}. Follow up while it is fresh.`
                : "Customer opened the approval link. Follow up while it is fresh.",
            badge: "Warm lead",
            icon: "eye",
            className: "border-sky-300/25 bg-sky-500/10 text-sky-100",
            iconClassName: "border-sky-300/25 bg-sky-300/10 text-sky-100",
        }
    }

    if (customerPortalStatus === "approved") {
        return {
            label: "Approved",
            helper: "Customer already approved this quote. Collect payment instead of sending a generic reminder.",
            badge: "Approved",
            icon: "check",
            className: "border-emerald-300/25 bg-emerald-500/10 text-emerald-100",
            iconClassName: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
        }
    }

    if (customerPortalStatus === "change_requested") {
        return {
            label: "Changes requested",
            helper: "Customer asked for changes. Start a revision instead of sending a generic reminder.",
            badge: "Revise",
            icon: "alert",
            className: "border-amber-300/25 bg-amber-500/10 text-amber-100",
            iconClassName: "border-amber-300/25 bg-amber-300/10 text-amber-100",
        }
    }

    if (customerPortalStatus === "shared" || approvalLink) {
        return {
            label: "Link shared",
            helper: "Approval link is ready, but the customer has not opened it yet.",
            badge: "Waiting",
            icon: "link",
            className: "border-blue-300/20 bg-blue-500/10 text-blue-100",
            iconClassName: "border-blue-300/25 bg-blue-300/10 text-blue-100",
        }
    }

    return {
        label: "No approval link",
        helper: "This reminder will send without a customer approval link.",
        badge: "Manual",
        icon: "clock",
        className: "border-slate-500/25 bg-slate-900/70 text-slate-200",
        iconClassName: "border-slate-500/25 bg-slate-800 text-slate-200",
    }
}

function FollowUpPortalSummaryIcon({ summary }: { summary: FollowUpPortalSummary }) {
    if (summary.icon === "eye") return <Eye className="h-4 w-4" aria-hidden="true" />
    if (summary.icon === "link") return <Link2 className="h-4 w-4" aria-hidden="true" />
    if (summary.icon === "check") return <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
    if (summary.icon === "alert") return <AlertTriangle className="h-4 w-4" aria-hidden="true" />

    return <Clock className="h-4 w-4" aria-hidden="true" />
}

function getDefaultFollowUpMessage({
    clientName,
    estimateNumber,
    totalAmount,
    businessName,
    approvalLink,
    customerPortalStatus,
}: {
    clientName: string
    estimateNumber: string
    totalAmount: number
    businessName: string
    approvalLink?: string
    customerPortalStatus?: CustomerPortalFollowUpStatus
}) {
    const approvalLine = getFollowUpApprovalLine({ approvalLink, customerPortalStatus })
    return `Hi ${clientName || "there"},\n\nI wanted to follow up on the estimate (${estimateNumber}) for $${totalAmount.toFixed(2)} that I sent you recently.${approvalLine}\n\nPlease let me know if you have any questions or would like to proceed.\n\nBest regards,\n${businessName}`
}

export function FollowUpModal({
    open,
    onClose,
    clientName,
    clientEmail = "",
    estimateNumber,
    totalAmount,
    businessName = "SnapQuote",
    approvalLink,
    customerPortalStatus,
    customerViewedAt,
    lastFollowedUpAt,
    lastFollowUpChannel,
    onSent,
}: FollowUpModalProps) {
    const followUpBusinessName = businessName.trim() || "SnapQuote"
    const portalSummary = getFollowUpPortalSummary({
        approvalLink,
        customerPortalStatus,
        customerViewedAt,
    })
    const [email, setEmail] = useState(clientEmail)
    const [message, setMessage] = useState(() => getDefaultFollowUpMessage({
        clientName,
        estimateNumber,
        totalAmount,
        businessName: followUpBusinessName,
        approvalLink,
        customerPortalStatus,
    }))
    const [sending, setSending] = useState(false)
    const [deliveryIssue, setDeliveryIssue] = useState<DeliveryIssue | null>(null)
    const deliveryIssueRef = useRef<HTMLDivElement | null>(null)
    const followUpRecency = getFollowUpRecencySummary({ lastFollowedUpAt, lastFollowUpChannel })
    const trimmedEmail = email.trim()
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)
    const canAttemptSend = Boolean(trimmedEmail && message.trim() && !sending)
    const recipientStatusLabel = !trimmedEmail ? "Needed" : isValidEmail ? "Ready" : "Check"
    const recipientStatusClassName = !trimmedEmail
        ? "border-amber-300/20 bg-amber-400/10 text-amber-100"
        : isValidEmail
            ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
            : "border-amber-300/20 bg-amber-400/10 text-amber-100"

    useEffect(() => {
        if (!open) return

        setEmail(clientEmail)
        setMessage(getDefaultFollowUpMessage({
            clientName,
            estimateNumber,
            totalAmount,
            businessName: followUpBusinessName,
            approvalLink,
            customerPortalStatus,
        }))
        setDeliveryIssue(null)
        setSending(false)
    }, [approvalLink, clientEmail, clientName, customerPortalStatus, estimateNumber, followUpBusinessName, open, totalAmount])

    useEffect(() => {
        if (!deliveryIssue) return

        const frame = window.requestAnimationFrame(() => {
            deliveryIssueRef.current?.scrollIntoView({ block: "center" })
        })

        return () => window.cancelAnimationFrame(frame)
    }, [deliveryIssue])

    if (!open || typeof document === "undefined") return null

    const handleSend = async () => {
        if (!isValidEmail) {
            setDeliveryIssue(buildDeliveryIssue({
                channel: "email",
                message: "Please enter a valid email address before sending the follow-up.",
                targetField: "email",
            }))
            return
        }

        setSending(true)
        setDeliveryIssue(null)

        try {
            const referralUrl = await getReferralShareUrl({ source: "follow_up_email" })
            const response = await fetch("/api/send-email", {
                method: "POST",
                headers: await withAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({
                    email: trimmedEmail,
                    subject: `Following up on Estimate ${estimateNumber}`,
                    message,
                    businessName: followUpBusinessName,
                    referralUrl: referralUrl || undefined,
                }),
            })

            const result = await response.json().catch(() => ({})) as SendEmailResult

            if (!response.ok) {
                const message = typeof result.error === "string"
                    ? result.error
                    : "Failed to send follow-up email. Please try again."

                setDeliveryIssue(buildDeliveryIssue({
                    channel: "email",
                    message,
                    status: response.status,
                    code: typeof result.code === "string" ? result.code : undefined,
                }))
                return
            }

            if (result.method === "mailto") {
                if (typeof result.mailtoUrl === "string") {
                    window.open(result.mailtoUrl, "_blank")
                }
                toast("Email client opened. Please send manually.", "success")
            } else if (result.success) {
                await onSent?.()
                toast("Follow-up email sent.", "success")
            } else {
                throw new Error(typeof result.error === "string" ? result.error : "Failed to send follow-up email.")
            }

            onClose()
        } catch (error: unknown) {
            setDeliveryIssue(buildDeliveryIssue({
                channel: "email",
                message: getErrorMessage(error, "Failed to send follow-up email."),
            }))
        } finally {
            setSending(false)
        }
    }

    return createPortal(
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 p-2 backdrop-blur-sm sm:p-4">
            <div
                aria-describedby="follow-up-modal-description"
                aria-labelledby="follow-up-modal-title"
                aria-modal="true"
                className="field-panel flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-md flex-col overflow-hidden"
                role="dialog"
            >
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 p-4">
                    <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-blue-500/10 text-blue-200">
                            <Mail className="h-4 w-4" />
                        </span>
                        <h2 id="follow-up-modal-title" className="min-w-0 break-words text-lg font-semibold [overflow-wrap:anywhere]">
                            Send Follow-up
                        </h2>
                    </div>
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={onClose}
                        aria-label="Close follow-up modal"
                        className="h-11 w-11 shrink-0 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto p-4">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid="follow-up-summary">
                        <div className={`min-w-0 rounded-lg border p-2 ${recipientStatusClassName}`}>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">To</p>
                            <p className="mt-1 flex min-w-0 items-center gap-1 break-words text-sm font-semibold [overflow-wrap:anywhere]" data-testid="follow-up-recipient-status">
                                <Mail className="h-3.5 w-3.5 shrink-0" />
                                {recipientStatusLabel}
                            </p>
                        </div>
                        <div className="min-w-0 rounded-lg border border-sky-300/20 bg-sky-400/10 p-2">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-200/70">Quote</p>
                            <p className="mt-1 flex min-w-0 items-center gap-1 break-words text-sm font-semibold text-sky-100 [overflow-wrap:anywhere]" data-testid="follow-up-estimate-number">
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                {estimateNumber}
                            </p>
                        </div>
                        <div className="min-w-0 rounded-lg border border-emerald-300/20 bg-emerald-400/10 p-2">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200/70">Total</p>
                            <p className="mt-1 flex min-w-0 items-center gap-1 break-words text-sm font-semibold text-emerald-100 [overflow-wrap:anywhere]" data-testid="follow-up-total">
                                <DollarSign className="h-3.5 w-3.5 shrink-0" />
                                {totalAmount.toFixed(2)}
                            </p>
                        </div>
                    </div>

                    <div
                        className={`flex min-w-0 gap-2 rounded-lg border p-3 ${portalSummary.className}`}
                        data-testid="follow-up-portal-status"
                    >
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${portalSummary.iconClassName}`}>
                            <FollowUpPortalSummaryIcon summary={portalSummary} />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="flex items-start justify-between gap-2">
                                <span className="text-sm font-semibold" data-testid="follow-up-portal-status-label">
                                    {portalSummary.label}
                                </span>
                                <span className="shrink-0 rounded-md border border-white/10 bg-slate-950/35 px-2 py-0.5 text-[10px] font-semibold">
                                    {portalSummary.badge}
                                </span>
                            </span>
                            <span className="mt-1 block break-words text-xs leading-5 text-slate-300 [overflow-wrap:anywhere]" data-testid="follow-up-portal-status-helper">
                                {portalSummary.helper}
                            </span>
                        </span>
                    </div>

                    {followUpRecency ? (
                        <div
                            className={followUpRecency.isRecent
                                ? "rounded-lg border border-amber-300/25 bg-amber-400/10 p-3 text-amber-100"
                                : "rounded-lg border border-white/10 bg-slate-950/55 p-3 text-slate-200"}
                            data-testid="follow-up-recent-contact"
                            role="status"
                        >
                            <div className="flex gap-2">
                                <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold">{followUpRecency.title}</p>
                                    <p className="mt-1 break-words text-xs leading-5 opacity-80 [overflow-wrap:anywhere]">
                                        {followUpRecency.helper}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : null}

                    <div className="space-y-2">
                        <Label htmlFor="follow-up-email" className="text-slate-300">Client Email *</Label>
                        <Input
                            id="follow-up-email"
                            type="email"
                            placeholder="client@example.com"
                            value={email}
                            onChange={(event) => {
                                setDeliveryIssue(null)
                                setEmail(event.target.value)
                            }}
                            aria-invalid={deliveryIssue?.targetField === "email" ? "true" : undefined}
                            className={deliveryIssue?.targetField === "email"
                                ? "rounded-lg border-amber-300/50 bg-slate-950/70 text-white placeholder:text-slate-500"
                                : "rounded-lg border-white/10 bg-slate-950/70 text-white placeholder:text-slate-500"}
                        />
                        {!trimmedEmail ? (
                            <p className="text-xs text-amber-100/80">Add the customer email to send this follow-up.</p>
                        ) : !isValidEmail ? (
                            <p className="text-xs text-amber-100/80">Check the email format before sending.</p>
                        ) : null}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="follow-up-message" className="text-slate-300">Message</Label>
                        <Textarea
                            id="follow-up-message"
                            value={message}
                            onChange={(event) => {
                                setDeliveryIssue(null)
                                setMessage(event.target.value)
                            }}
                            rows={8}
                            className="min-h-[168px] resize-none rounded-lg border-white/10 bg-slate-950/70 text-white placeholder:text-slate-500 [overflow-wrap:anywhere]"
                        />
                    </div>

                    {deliveryIssue ? (
                        <div
                            ref={deliveryIssueRef}
                            role="alert"
                            className="rounded-lg border border-amber-300/20 bg-amber-400/10 p-3"
                            data-testid="follow-up-delivery-issue"
                        >
                            <div className="flex gap-2">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                                <div className="min-w-0">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200/80">
                                        {deliveryIssue.statusLabel}
                                    </p>
                                    <p className="mt-1 break-words text-sm font-semibold text-amber-100 [overflow-wrap:anywhere]" data-testid="follow-up-delivery-issue-title">{deliveryIssue.title}</p>
                                    <p className="mt-1 break-words text-xs leading-5 text-amber-100/75 [overflow-wrap:anywhere]" data-testid="follow-up-delivery-issue-message">{deliveryIssue.message}</p>
                                </div>
                            </div>
                            {(deliveryIssue.actionHref && deliveryIssue.actionLabel) || deliveryIssue.canRetry ? (
                                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {deliveryIssue.actionHref && deliveryIssue.actionLabel ? (
                                        <Button asChild size="sm" className="h-11 w-full rounded-lg" data-testid="follow-up-delivery-action">
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
                                            data-testid="follow-up-delivery-retry-action"
                                        >
                                            Retry send
                                        </Button>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    <div id="follow-up-modal-description" className="rounded-lg border border-white/10 bg-slate-950/55 p-3 text-sm leading-6 text-slate-400">
                        This sends a short customer follow-up from your quote history. The estimate number and total stay visible while you edit the message.
                    </div>
                </div>

                <div className="grid shrink-0 grid-cols-1 gap-2 border-t border-white/10 bg-slate-950/55 p-4 sm:grid-cols-2" data-testid="follow-up-modal-footer">
                    <Button
                        type="button"
                        variant="outline"
                        className="h-11 w-full rounded-lg border-white/10 bg-slate-950/60 text-slate-200 hover:bg-slate-900 hover:text-white"
                        onClick={onClose}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        className="h-11 w-full rounded-lg"
                        onClick={handleSend}
                        disabled={!canAttemptSend}
                    >
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
                                <Send className="mr-2 h-4 w-4 shrink-0" />
                                Send Follow-up
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    )
}
