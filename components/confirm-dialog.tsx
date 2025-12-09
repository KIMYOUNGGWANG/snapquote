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
}

export function ConfirmDialog({
    open,
    onClose,
    onConfirm,
    title,
    description,
}: ConfirmDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={() => {
                            onConfirm()
                            onClose()
                        }}
                    >
                        Delete
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
