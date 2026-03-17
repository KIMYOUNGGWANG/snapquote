"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Loader2, MessageSquare, X, Info } from "lucide-react"

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
    // Strip non-digit characters except leading +
    const cleaned = raw.replace(/[^\d+]/g, "")
    return cleaned
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
    const [message, setMessage] = useState(() => {
        const totalStr = estimateTotal != null ? ` Total: $${estimateTotal.toFixed(2)}.` : ""
        const linkStr = paymentLink ? ` Pay online: ${paymentLink}` : ""
        const fromStr = businessName ? ` — ${businessName}` : ""
        return `Your estimate is ready.${totalStr}${linkStr}${fromStr}`
    })
    const [sending, setSending] = useState(false)
    const [error, setError] = useState("")

    if (!open) return null

    const isValidE164 = /^\+[1-9]\d{7,14}$/.test(phone.trim())

    const handleSend = async () => {
        const trimmed = phone.trim()
        if (!isValidE164) {
            setError("Enter a valid phone number in international format (e.g. +14165550123)")
            return
        }
        if (!message.trim()) {
            setError("Message cannot be empty")
            return
        }

        setSending(true)
        setError("")

        try {
            await onSend(trimmed, message.trim())
            onClose()
        } catch (err: any) {
            setError(err?.message || "Failed to send SMS. Please try again.")
        } finally {
            setSending(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-background rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <div className="flex items-center gap-2">
                        <MessageSquare className="h-5 w-5 text-primary" />
                        <h2 className="text-lg font-semibold">Send via SMS</h2>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="sms-phone">Customer Phone *</Label>
                        <Input
                            id="sms-phone"
                            type="tel"
                            placeholder="+14165550123"
                            value={phone}
                            onChange={(e) => {
                                setError("")
                                setPhone(formatE164Hint(e.target.value))
                            }}
                            className={!phone || isValidE164 ? "" : "border-destructive"}
                        />
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Info className="h-3 w-3" />
                            International format required: +1 (US/CA), +44 (UK), etc.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="sms-message">Message</Label>
                            <span className={`text-xs ${message.length > 1100 ? "text-destructive" : "text-muted-foreground"}`}>
                                {message.length}/1200
                            </span>
                        </div>
                        <Textarea
                            id="sms-message"
                            rows={4}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            className="resize-none"
                            maxLength={1200}
                        />
                    </div>

                    {error && (
                        <p className="text-sm text-destructive">{error}</p>
                    )}

                    <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground flex items-start gap-2">
                        <Info className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>1 SMS credit used per message. Credits can be topped up from your account.</span>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex gap-2 p-4 border-t bg-muted/50">
                    <Button variant="outline" className="flex-1" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        className="flex-1"
                        onClick={handleSend}
                        disabled={sending || !isValidE164 || !message.trim()}
                    >
                        {sending ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Sending...
                            </>
                        ) : (
                            <>
                                <MessageSquare className="mr-2 h-4 w-4" />
                                Send SMS
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    )
}
