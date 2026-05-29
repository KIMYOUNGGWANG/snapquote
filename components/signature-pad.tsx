"use client"

import React, { useRef, useState } from "react"
import SignatureCanvas from "react-signature-canvas"
import { Button } from "@/components/ui/button"
import { Check, Eraser, Loader2, PenTool } from "lucide-react"

interface SignaturePadProps {
    onSave: (base64Signature: string) => void | Promise<void>
    onCancel: () => void
}

export function SignaturePad({ onSave, onCancel }: SignaturePadProps) {
    const sigPad = useRef<SignatureCanvas>(null)
    const [isEmpty, setIsEmpty] = useState(true)
    const [isSaving, setIsSaving] = useState(false)

    const clear = () => {
        if (isSaving) return
        sigPad.current?.clear()
        setIsEmpty(true)
    }

    const save = async () => {
        if (!sigPad.current || sigPad.current.isEmpty() || isSaving) return

        setIsSaving(true)
        try {
            const dataUrl = sigPad.current.toDataURL('image/png')
            await onSave(dataUrl)
        } finally {
            setIsSaving(false)
        }
    }

    const handleEnd = () => {
        if (sigPad.current) {
            setIsEmpty(sigPad.current.isEmpty())
        }
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/55 p-3">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-300/25 bg-blue-500/10 text-blue-200">
                        <PenTool className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">Customer approval</p>
                        <p className="mt-0.5 text-xs text-slate-400">Stored with this estimate and included on the PDF.</p>
                    </div>
                </div>
                <span
                    className={
                        isEmpty
                            ? "shrink-0 rounded-lg border border-amber-300/20 bg-amber-400/10 px-2 py-1 text-[11px] font-semibold text-amber-100"
                            : "shrink-0 rounded-lg border border-emerald-300/20 bg-emerald-400/10 px-2 py-1 text-[11px] font-semibold text-emerald-100"
                    }
                    data-testid="signature-status"
                >
                    {isEmpty ? "Needed" : "Ready"}
                </span>
            </div>

            <div
                className="touch-none overflow-hidden rounded-lg border border-dashed border-white/20 bg-white shadow-inner shadow-slate-950/20"
                data-testid="signature-canvas"
            >
                <SignatureCanvas
                    ref={sigPad}
                    penColor="black"
                    canvasProps={{
                        width: 640,
                        height: 260,
                        className: "h-52 w-full bg-white cursor-crosshair sm:h-64",
                    }}
                    onEnd={handleEnd}
                    backgroundColor="rgb(255, 255, 255)"
                />
            </div>

            <div className="flex gap-2">
                <Button
                    variant="outline"
                    onClick={clear}
                    className="flex-1 rounded-lg border-white/10 bg-slate-950 text-slate-100 hover:bg-slate-900"
                    disabled={isEmpty || isSaving}
                    data-testid="signature-clear-button"
                >
                    <Eraser className="mr-2 h-4 w-4" />
                    Clear
                </Button>
                <Button
                    onClick={save}
                    className="flex-1 rounded-lg"
                    disabled={isEmpty || isSaving}
                    data-testid="signature-accept-button"
                >
                    {isSaving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Check className="mr-2 h-4 w-4" />
                    )}
                    {isSaving ? "Saving..." : "Accept Signature"}
                </Button>
            </div>
            <Button
                variant="ghost"
                className="w-full rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
                onClick={onCancel}
                disabled={isSaving}
            >
                Cancel
            </Button>
        </div>
    )
}
