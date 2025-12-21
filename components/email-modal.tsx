"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Loader2, Mail, X } from "lucide-react"

interface EmailModalProps {
    open: boolean
    onClose: () => void
    onSend: (email: string, message: string) => Promise<void>
    clientEmail?: string
    estimateTotal?: number
}

export function EmailModal({ open, onClose, onSend, clientEmail = "", estimateTotal }: EmailModalProps) {
    const [email, setEmail] = useState(clientEmail)
    const [message, setMessage] = useState(
        `Thank you for choosing our services!\n\nPlease find your estimate attached. The total amount is $${estimateTotal?.toFixed(2) || "0.00"}.\n\nIf you have any questions, please don't hesitate to contact us.\n\nBest regards`
    )
    const [sending, setSending] = useState(false)
    const [error, setError] = useState("")

    if (!open) return null

    const handleSend = async () => {
        if (!email || !email.includes("@")) {
            setError("Please enter a valid email address")
            return
        }

        setSending(true)
        setError("")

        try {
            await onSend(email, message)
            onClose()
        } catch (err) {
            setError("Failed to send email. Please try again.")
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
                        <Mail className="h-5 w-5 text-primary" />
                        <h2 className="text-lg font-semibold">Send Estimate</h2>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">Customer Email *</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="customer@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="message">Message</Label>
                        <Textarea
                            id="message"
                            rows={6}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            className="resize-none"
                        />
                    </div>

                    {error && (
                        <p className="text-sm text-destructive">{error}</p>
                    )}

                    <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">
                        📎 Your estimate PDF will be attached to this email.
                    </div>
                </div>

                {/* Footer */}
                <div className="flex gap-2 p-4 border-t bg-muted/50">
                    <Button variant="outline" className="flex-1" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button className="flex-1" onClick={handleSend} disabled={sending}>
                        {sending ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Sending...
                            </>
                        ) : (
                            <>
                                <Mail className="mr-2 h-4 w-4" />
                                Send Email
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    )
}
