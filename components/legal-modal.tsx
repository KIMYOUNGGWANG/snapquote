"use client"

import { useState, useEffect } from "react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export function LegalModal() {
    const [open, setOpen] = useState(false)

    useEffect(() => {
        const hasAccepted = localStorage.getItem("snapquote_terms_accepted")
        if (!hasAccepted) {
            setOpen(true)
        }
    }, [])

    const handleAccept = () => {
        localStorage.setItem("snapquote_terms_accepted", "true")
        setOpen(false)
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-[425px]" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>Terms of Service & Disclaimer</DialogTitle>
                    <DialogDescription>
                        Please review and accept our terms to continue using SnapQuote.
                    </DialogDescription>
                </DialogHeader>
                <div className="h-[300px] w-full rounded-md border p-4 text-sm overflow-y-auto">
                    <h4 className="font-bold mb-2">1. Estimates are Non-Binding</h4>
                    <p className="mb-4">
                        SnapQuote generates estimates based on user input and AI analysis. These estimates are for informational purposes only and do not constitute a binding contract unless explicitly agreed upon by all parties.
                    </p>

                    <h4 className="font-bold mb-2">2. AI Accuracy</h4>
                    <p className="mb-4">
                        While we strive for accuracy, AI-generated content may contain errors. You are responsible for verifying all prices, quantities, and descriptions before sending estimates to clients.
                    </p>

                    <h4 className="font-bold mb-2">3. User Responsibility</h4>
                    <p className="mb-4">
                        You agree to use SnapQuote in compliance with all applicable laws and regulations. You are solely responsible for the professional quality of the estimates you issue.
                    </p>

                    <h4 className="font-bold mb-2">4. Data Privacy</h4>
                    <p className="mb-4">
                        We process your data to provide this service. Please refer to our Privacy Policy for details on how we handle your information.
                    </p>
                </div>
                <DialogFooter>
                    <Button onClick={handleAccept} className="w-full">I Accept</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
