"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { X, Loader2, Copy, CreditCard, FileText, Check, Minus, Plus } from "lucide-react"
import { toast } from "@/components/toast"
import { useRouter } from "next/navigation"
import { getProfile } from "@/lib/estimates-storage"
import { trackAnalyticsEvent } from "@/lib/analytics"
import { withAuthHeaders } from "@/lib/auth-headers"
import type { PriceListItem } from "@/types"

interface QuickQuoteModalProps {
    open: boolean
    onClose: () => void
    item: PriceListItem | null
}

export function QuickQuoteModal({ open, onClose, item }: QuickQuoteModalProps) {
    const router = useRouter()
    const [quantity, setQuantity] = useState(1)
    const [price, setPrice] = useState(0)
    const [taxRate, setTaxRate] = useState(13)
    const [isGeneratingLink, setIsGeneratingLink] = useState(false)
    const [paymentLink, setPaymentLink] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [businessName, setBusinessName] = useState("SnapQuote")
    const [businessPhone, setBusinessPhone] = useState("")

    useEffect(() => {
        if (open && item) {
            setQuantity(1)
            setPrice(item.price)
            setPaymentLink(null)
            setCopied(false)

            // Load business profile
            const profile = getProfile()
            if (profile) {
                setBusinessName(profile.business_name || "SnapQuote")
                setBusinessPhone(profile.phone || "")
                if (profile.tax_rate) setTaxRate(profile.tax_rate)
            }
        }
    }, [open, item])

    if (!open || !item) return null

    const subtotal = quantity * price
    const taxAmount = subtotal * (taxRate / 100)
    const total = subtotal + taxAmount

    const generateQuoteText = (includeLink = false) => {
        let text = `📋 Estimate from ${businessName}\n`
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
            text += `\n💳 Pay online: ${paymentLink}\n`
        }

        if (businessPhone) {
            text += `\n📞 ${businessPhone}`
        }

        return text
    }

    const handleCopyToClipboard = async () => {
        try {
            const text = generateQuoteText(!!paymentLink)
            await navigator.clipboard.writeText(text)
            setCopied(true)
            toast("📋 Copied! Paste in SMS or chat.", "success")
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            toast("❌ Failed to copy.", "error")
        }
    }

    const handleGeneratePaymentLink = async () => {
        if (!navigator.onLine) {
            toast("📴 Payment links require internet.", "warning")
            return
        }

        setIsGeneratingLink(true)
        try {
            const headers = await withAuthHeaders({ 'Content-Type': 'application/json' })
            if (!headers.authorization) {
                toast("🔐 Sign in first to generate a card payment link.", "warning")
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

            if (!response.ok) {
                const error = await response.json().catch(() => ({}))
                const errorMessage =
                    typeof error?.error === "string"
                        ? error.error
                        : typeof error?.error?.message === "string"
                            ? error.error.message
                            : 'Failed to create payment link'

                if (response.status === 401) {
                    toast("🔐 Session expired. Please sign in again.", "warning")
                    const params = new URLSearchParams({
                        next: "/",
                        intent: "payment-link",
                    })
                    router.push(`/login?${params.toString()}`)
                    return
                }

                if (response.status === 403) {
                    if (error?.code === "STRIPE_CONNECT_REQUIRED" || error?.code === "STRIPE_CONNECT_INCOMPLETE") {
                        throw new Error("Connect Stripe in Profile first, then generate a payment link.")
                    }
                    throw new Error(errorMessage)
                }

                throw new Error(errorMessage)
            }

            const data = await response.json()
            setPaymentLink(data.url)
            void trackAnalyticsEvent({
                event: "payment_link_created",
                channel: "quick_quote",
                metadata: {
                    amount: total,
                    itemName: item.name,
                    quantity,
                },
            })
            toast("💳 Payment link ready!", "success")
        } catch (error: any) {
            console.error('Payment link error:', error)
            toast(`❌ ${error.message}`, "error")
        } finally {
            setIsGeneratingLink(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-background rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b bg-primary/5">
                    <div className="flex items-center gap-2">
                        <div className="text-2xl">⚡</div>
                        <h2 className="text-lg font-semibold">Quick Quote</h2>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    {/* Item Name */}
                    <div className="text-center">
                        <p className="font-semibold text-lg">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.category}</p>
                    </div>

                    {/* Quantity Control */}
                    <div className="flex items-center justify-center gap-4">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setQuantity(Math.max(1, quantity - 1))}
                            disabled={quantity <= 1}
                        >
                            <Minus className="h-4 w-4" />
                        </Button>
                        <span className="text-2xl font-bold w-12 text-center">{quantity}</span>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setQuantity(quantity + 1)}
                        >
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>

                    {/* Price Input */}
                    <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Price:</span>
                        <div className="flex items-center gap-1 flex-1">
                            <span className="text-lg font-medium">$</span>
                            <Input
                                type="number"
                                value={price}
                                onChange={(e) => setPrice(Number(e.target.value))}
                                className="text-lg font-medium"
                            />
                        </div>
                    </div>

                    {/* Totals */}
                    <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Subtotal</span>
                            <span>${subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Tax ({taxRate}%)</span>
                            <span>${taxAmount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t">
                            <span className="font-bold">Total</span>
                            <span className="font-bold text-primary text-xl">${total.toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Payment Link Status */}
                    {paymentLink && (
                        <div className="text-center text-sm text-green-600 flex items-center justify-center gap-1">
                            <Check className="h-4 w-4" />
                            Payment link included
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="p-4 border-t bg-muted/30 space-y-2">
                    {/* Copy Button */}
                    <Button
                        className="w-full h-12"
                        onClick={handleCopyToClipboard}
                    >
                        {copied ? (
                            <>
                                <Check className="h-4 w-4 mr-2" />
                                Copied!
                            </>
                        ) : (
                            <>
                                <Copy className="h-4 w-4 mr-2" />
                                📱 Copy for SMS / Chat
                            </>
                        )}
                    </Button>

                    {/* Payment Link Button */}
                    <Button
                        variant="outline"
                        className="w-full"
                        onClick={handleGeneratePaymentLink}
                        disabled={isGeneratingLink || !!paymentLink}
                    >
                        {isGeneratingLink ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Generating...
                            </>
                        ) : paymentLink ? (
                            <>
                                <Check className="h-4 w-4 mr-2" />
                                Link Ready - Copy Above
                            </>
                        ) : (
                            <>
                                <CreditCard className="h-4 w-4 mr-2" />
                                💳 Add Payment Link
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    )
}
