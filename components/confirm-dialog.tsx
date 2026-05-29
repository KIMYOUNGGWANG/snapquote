"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"

interface ConfirmDialogProps {
    open: boolean
    onClose: () => void
    onConfirm: () => void
    title: string
    description: string
    confirmLabel?: string
}

export function ConfirmDialog({
    open,
    onClose,
    onConfirm,
    title,
    description,
    confirmLabel = "Delete",
}: ConfirmDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" className="rounded-lg border-white/10 bg-slate-950 text-slate-100 hover:bg-slate-900" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        className="rounded-lg"
                        onClick={() => {
                            onConfirm()
                            onClose()
                        }}
                    >
                        {confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export function useConfirm() {
    const [isOpen, setIsOpen] = useState(false)
    const [onConfirm, setOnConfirm] = useState<(() => void) | null>(null)

    const confirm = (callback: () => void) => {
        setOnConfirm(() => callback)
        setIsOpen(true)
    }

    const handleConfirm = () => {
        if (onConfirm) {
            onConfirm()
        }
        setIsOpen(false)
    }

    const handleCancel = () => {
        setIsOpen(false)
    }

    return {
        isOpen,
        confirm,
        handleConfirm,
        handleCancel,
    }
}
