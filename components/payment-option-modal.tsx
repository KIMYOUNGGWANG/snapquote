"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { CreditCard, DollarSign, Loader2 } from "lucide-react"

interface PaymentOptionModalProps {
    open: boolean
    onClose: () => void
    totalAmount: number
    onConfirm: (amount: number, type: 'full' | 'deposit' | 'custom') => Promise<void>
}

function formatMoney(value: number) {
    return `$${value.toFixed(2)}`
}

export function PaymentOptionModal({ open, onClose, totalAmount, onConfirm }: PaymentOptionModalProps) {
    const [type, setType] = useState<'full' | 'deposit' | 'custom'>('full')
    const [customAmount, setCustomAmount] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const parsedCustomAmount = Number.parseFloat(customAmount)
    const isCustomAmountEntered = customAmount.trim().length > 0
    const customAmountError = type !== "custom"
        ? ""
        : !isCustomAmountEntered
            ? "Enter the amount you want to request."
            : !Number.isFinite(parsedCustomAmount) || parsedCustomAmount <= 0
                ? "Enter an amount above $0.00."
                : parsedCustomAmount > totalAmount
                    ? "Custom amount cannot exceed the estimate total."
                    : ""

    useEffect(() => {
        if (open) {
            setType('full')
            setCustomAmount("")
            setIsLoading(false)
        }
    }, [open])

    const getFinalAmount = () => {
        if (type === 'full') return totalAmount
        if (type === 'deposit') return totalAmount * 0.5
        return Number.isFinite(parsedCustomAmount) ? parsedCustomAmount : 0
    }
    const finalAmount = getFinalAmount()
    const confirmDisabled = isLoading || finalAmount <= 0 || Boolean(customAmountError)
    const selectedTypeLabel = type === "full"
        ? "Full payment"
        : type === "deposit"
            ? "50% deposit"
            : "Custom amount"
    const customOptionAmountLabel = isCustomAmountEntered && Number.isFinite(parsedCustomAmount)
        ? formatMoney(Math.max(0, parsedCustomAmount))
        : "Set amount"

    const handleTypeChange = (value: string) => {
        if (value === 'full' || value === 'deposit' || value === 'custom') {
            setType(value)
        }
    }

    const handleConfirm = async () => {
        if (confirmDisabled) return

        setIsLoading(true)
        try {
            await onConfirm(finalAmount, type)
        } catch (error) {
            console.error(error)
            setIsLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="grid max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-md grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-md">
                <DialogHeader className="border-b border-white/10 p-4 pr-16 text-left">
                    <DialogTitle className="flex min-w-0 items-center gap-2 text-base">
                        <CreditCard className="h-5 w-5 shrink-0 text-blue-200" />
                        <span className="min-w-0 break-words [overflow-wrap:anywhere]">Payment Link Options</span>
                    </DialogTitle>
                    <DialogDescription className="mt-1 break-words leading-5 [overflow-wrap:anywhere]">
                        Choose how much the customer should pay online.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 gap-2 border-b border-white/10 bg-slate-950/45 p-4 sm:grid-cols-2" data-testid="payment-option-summary">
                    <div className="min-w-0 rounded-lg border border-white/10 bg-slate-950/70 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Estimate total</p>
                        <p className="mt-1 break-words text-sm font-semibold text-slate-100 [overflow-wrap:anywhere]">{formatMoney(totalAmount)}</p>
                    </div>
                    <div className="min-w-0 rounded-lg border border-blue-300/25 bg-blue-500/10 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-200/70">
                            Requesting
                        </p>
                        <p className="mt-1 break-words text-sm font-semibold text-blue-100 [overflow-wrap:anywhere]" data-testid="payment-option-request-summary">
                            {selectedTypeLabel}
                        </p>
                    </div>
                </div>

                <div className="min-h-0 space-y-4 overflow-y-auto p-4">
                    <RadioGroup value={type} onValueChange={handleTypeChange} className="gap-3">
                        <div className={`rounded-lg border p-3 transition-colors ${type === 'full' ? 'border-blue-400/45 bg-blue-500/10' : 'border-white/10 bg-slate-950/60 hover:bg-slate-900'}`}>
                            <div className="flex items-start gap-3">
                                <RadioGroupItem
                                    value="full"
                                    id="full-payment-option"
                                    aria-label="Full Payment"
                                    className="mt-0 h-12 w-12 shrink-0 bg-slate-950/70"
                                    data-testid="payment-option-full-radio"
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                                        <Label htmlFor="full-payment-option" className="min-w-0 cursor-pointer break-words font-semibold text-white [overflow-wrap:anywhere]">
                                            Full Payment (100%)
                                        </Label>
                                        <span className="w-fit max-w-full break-words rounded-lg border border-white/10 bg-slate-950/70 px-2 py-1 text-xs font-semibold text-slate-100 [overflow-wrap:anywhere]">
                                            {formatMoney(totalAmount)}
                                        </span>
                                    </div>
                                    <p className="mt-1.5 text-sm leading-5 text-slate-400">
                                        Request the complete estimate balance.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className={`rounded-lg border p-3 transition-colors ${type === 'deposit' ? 'border-blue-400/45 bg-blue-500/10' : 'border-white/10 bg-slate-950/60 hover:bg-slate-900'}`}>
                            <div className="flex items-start gap-3">
                                <RadioGroupItem
                                    value="deposit"
                                    id="deposit-payment-option"
                                    aria-label="50% Deposit"
                                    className="mt-0 h-12 w-12 shrink-0 bg-slate-950/70"
                                    data-testid="payment-option-deposit-radio"
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                                        <Label htmlFor="deposit-payment-option" className="min-w-0 cursor-pointer break-words font-semibold text-white [overflow-wrap:anywhere]">
                                            50% Deposit
                                        </Label>
                                        <span className="w-fit max-w-full break-words rounded-lg border border-white/10 bg-slate-950/70 px-2 py-1 text-xs font-semibold text-slate-100 [overflow-wrap:anywhere]">
                                            {formatMoney(totalAmount * 0.5)}
                                        </span>
                                    </div>
                                    <p className="mt-1.5 text-sm leading-5 text-slate-400">
                                        Collect half before sending a crew or ordering materials.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className={`rounded-lg border p-3 transition-colors ${type === 'custom' ? 'border-blue-400/45 bg-blue-500/10' : 'border-white/10 bg-slate-950/60 hover:bg-slate-900'}`}>
                            <div className="flex items-start gap-3">
                                <RadioGroupItem
                                    value="custom"
                                    id="custom-payment-option"
                                    aria-label="Custom Amount"
                                    className="mt-0 h-12 w-12 shrink-0 bg-slate-950/70"
                                    data-testid="payment-option-custom-radio"
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                                        <Label htmlFor="custom-payment-option" className="min-w-0 cursor-pointer break-words font-semibold text-white [overflow-wrap:anywhere]">
                                            Custom Amount
                                        </Label>
                                        <span className={`w-fit max-w-full break-words rounded-lg border px-2 py-1 text-xs font-semibold [overflow-wrap:anywhere] ${customAmountError ? "border-amber-300/25 bg-amber-400/10 text-amber-200" : "border-white/10 bg-slate-950/70 text-slate-100"}`}>
                                            {customOptionAmountLabel}
                                        </span>
                                    </div>
                                    <div className="relative mt-1">
                                        <DollarSign className="absolute left-2.5 top-3.5 h-4 w-4 text-slate-500" />
                                        <Input
                                            type="number"
                                            value={customAmount}
                                            onChange={(e) => setCustomAmount(e.target.value)}
                                            disabled={type !== 'custom'}
                                            className="h-12 min-h-12 rounded-lg border-white/10 bg-slate-950 pl-8 text-white placeholder:text-slate-500"
                                            placeholder="0.00"
                                            min="0.01"
                                            max={totalAmount.toFixed(2)}
                                            step="0.01"
                                            inputMode="decimal"
                                            aria-label="Custom payment amount"
                                            aria-invalid={Boolean(customAmountError)}
                                            aria-describedby="custom-payment-amount-help"
                                            data-testid="custom-payment-amount-input"
                                            onFocus={() => setType('custom')}
                                            onClick={() => setType('custom')}
                                        />
                                    </div>
                                    <p
                                        className={`text-xs leading-5 ${customAmountError ? "text-amber-200" : "text-slate-500"}`}
                                        data-testid="custom-payment-amount-help"
                                        id="custom-payment-amount-help"
                                    >
                                        {customAmountError || "Use this for a partial deposit or milestone payment."}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </RadioGroup>

                    <div className="rounded-lg border border-white/10 bg-slate-950/70 p-4 text-center" aria-live="polite">
                        <p className="mb-1 text-sm text-slate-400">Total to Request</p>
                        <p className={`break-words text-3xl font-bold [overflow-wrap:anywhere] ${customAmountError ? "text-amber-200" : "text-blue-300"}`} data-testid="payment-request-total">
                            {formatMoney(finalAmount)}
                        </p>
                        <p className="mt-2 break-words text-xs text-slate-500 [overflow-wrap:anywhere]">
                            Estimate total: {formatMoney(totalAmount)}
                        </p>
                    </div>
                </div>

                <DialogFooter className="grid grid-cols-1 gap-2 border-t border-white/10 bg-slate-950/55 p-4 sm:grid-cols-2 sm:justify-stretch sm:space-x-0" data-testid="payment-option-footer">
                    <Button variant="outline" className="h-12 min-h-12 w-full min-w-0 rounded-lg border-white/10 bg-slate-950 text-slate-100 hover:bg-slate-900" onClick={onClose} disabled={isLoading}>
                        Cancel
                    </Button>
                    {confirmDisabled ? (
                        <button
                            type="button"
                            aria-disabled="true"
                            disabled
                            className="inline-flex h-12 min-h-12 w-full min-w-0 items-center justify-center gap-2 rounded-lg bg-slate-800 px-3 py-2.5 text-center text-sm font-medium leading-tight text-slate-500 shadow-none disabled:cursor-not-allowed"
                            data-testid="create-payment-link-button"
                        >
                            Create Link
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="inline-flex h-12 min-h-12 w-full min-w-0 appearance-none items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-center text-sm font-medium leading-tight text-primary-foreground shadow-[0_18px_32px_-20px_hsl(var(--primary)/0.85)] transition-[background-color,color,box-shadow,transform] duration-200 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px"
                            data-testid="create-payment-link-button"
                            onClick={() => void handleConfirm()}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                "Create Link"
                            )}
                        </button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
