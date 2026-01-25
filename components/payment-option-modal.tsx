"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Loader2, DollarSign } from "lucide-react"

interface PaymentOptionModalProps {
    open: boolean
    onClose: () => void
    totalAmount: number
    onConfirm: (amount: number, type: 'full' | 'deposit' | 'custom') => Promise<void>
}

export function PaymentOptionModal({ open, onClose, totalAmount, onConfirm }: PaymentOptionModalProps) {
    const [type, setType] = useState<'full' | 'deposit' | 'custom'>('full')
    const [customAmount, setCustomAmount] = useState("")
    const [isLoading, setIsLoading] = useState(false)

    // Reset state when opening
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
        return parseFloat(customAmount) || 0
    }

    const handleConfirm = async () => {
        const amount = getFinalAmount()
        if (amount <= 0) return

        setIsLoading(true)
        try {
            await onConfirm(amount, type)
            // Parent handles closing
        } catch (error) {
            console.error(error)
            setIsLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Payment Link Options</DialogTitle>
                </DialogHeader>

                <div className="py-4 space-y-6">
                    <RadioGroup value={type} onValueChange={(v: any) => setType(v)} className="gap-4">

                        {/* Option 1: Full Payment */}
                        <div className={`flex items-start space-x-3 p-3 rounded-lg border-2 ${type === 'full' ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted'}`}>
                            <RadioGroupItem value="full" id="full" className="mt-1" />
                            <div className="grid gap-1.5 flex-1">
                                <Label htmlFor="full" className="font-semibold cursor-pointer">
                                    Full Payment (100%)
                                </Label>
                                <p className="text-sm text-muted-foreground">
                                    Request the full amount of <span className="text-foreground font-medium">${totalAmount.toFixed(2)}</span>
                                </p>
                            </div>
                        </div>

                        {/* Option 2: 50% Deposit */}
                        <div className={`flex items-start space-x-3 p-3 rounded-lg border-2 ${type === 'deposit' ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted'}`}>
                            <RadioGroupItem value="deposit" id="deposit" className="mt-1" />
                            <div className="grid gap-1.5 flex-1">
                                <Label htmlFor="deposit" className="font-semibold cursor-pointer">
                                    50% Deposit
                                </Label>
                                <p className="text-sm text-muted-foreground">
                                    Request a deposit of <span className="text-foreground font-medium">${(totalAmount * 0.5).toFixed(2)}</span>
                                </p>
                            </div>
                        </div>

                        {/* Option 3: Custom Amount */}
                        <div className={`flex items-start space-x-3 p-3 rounded-lg border-2 ${type === 'custom' ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted'}`}>
                            <RadioGroupItem value="custom" id="custom" className="mt-1" />
                            <div className="grid gap-1.5 flex-1">
                                <Label htmlFor="custom" className="font-semibold cursor-pointer">
                                    Custom Amount
                                </Label>
                                <div className="relative mt-1">
                                    <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        type="number"
                                        value={customAmount}
                                        onChange={(e) => setCustomAmount(e.target.value)}
                                        disabled={type !== 'custom'}
                                        className="pl-8"
                                        placeholder="0.00"
                                        onClick={() => setType('custom')}
                                    />
                                </div>
                            </div>
                        </div>
                    </RadioGroup>

                    <div className="bg-muted p-4 rounded-lg text-center">
                        <p className="text-sm text-muted-foreground mb-1">Total to Request</p>
                        <p className="text-3xl font-bold text-primary">
                            ${getFinalAmount().toFixed(2)}
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isLoading}>
                        Cancel
                    </Button>
                    <Button onClick={handleConfirm} disabled={isLoading || getFinalAmount() <= 0}>
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Generating Link...
                            </>
                        ) : (
                            "Create Link"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
