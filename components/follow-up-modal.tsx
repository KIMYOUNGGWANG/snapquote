"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { X, Send, Loader2 } from "lucide-react"
import { toast } from "@/components/toast"

interface FollowUpModalProps {
    open: boolean
    onClose: () => void
    clientName: string
    estimateNumber: string
    totalAmount: number
    businessName?: string
}

export function FollowUpModal({
    open,
    onClose,
    clientName,
    estimateNumber,
    totalAmount,
    businessName = "SnapQuote"
}: FollowUpModalProps) {
    const [email, setEmail] = useState("")
    const [message, setMessage] = useState(
        `Hi ${clientName || "there"},\n\nI wanted to follow up on the estimate (${estimateNumber}) for $${totalAmount.toFixed(2)} that I sent you recently.\n\nPlease let me know if you have any questions or would like to proceed.\n\nBest regards,\n${businessName}`
    )
    const [sending, setSending] = useState(false)

    if (!open) return null

    const handleSend = async () => {
        if (!email || !email.includes("@")) {
            toast("Please enter a valid email address", "error")
            return
        }

        setSending(true)
        try {
            const response = await fetch("/api/send-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email,
                    subject: `Following up on Estimate ${estimateNumber}`,
                    message,
                    businessName,
                }),
            })

            const result = await response.json()

            if (result.method === "mailto") {
                // Open mailto link
                window.open(result.mailtoUrl, "_blank")
                toast("📧 Email client opened. Please send manually.", "success")
            } else if (result.success) {
                toast("📧 Follow-up email sent!", "success")
            } else {
                throw new Error(result.error)
            }

            onClose()
        } catch (error) {
            toast("Failed to send email", "error")
        } finally {
            setSending(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <Card className="w-full max-w-md">
                <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-lg">Send Follow-up</h3>
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={onClose}
                            className="h-8 w-8"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">
                                Client Email
                            </label>
                            <Input
                                type="email"
                                placeholder="client@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="mt-1"
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium text-muted-foreground">
                                Message
                            </label>
                            <Textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                rows={8}
                                className="mt-1"
                            />
                        </div>

                        <Button
                            className="w-full"
                            onClick={handleSend}
                            disabled={sending}
                        >
                            {sending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <Send className="h-4 w-4 mr-2" />
                            )}
                            Send Follow-up
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
