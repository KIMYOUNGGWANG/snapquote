"use client"

import React, { useRef, useState } from "react"
import SignatureCanvas from "react-signature-canvas"
import { Button } from "@/components/ui/button"
import { Eraser, Check } from "lucide-react"

interface SignaturePadProps {
    onSave: (base64Signature: string) => void
    onCancel: () => void
}

export function SignaturePad({ onSave, onCancel }: SignaturePadProps) {
    const sigPad = useRef<SignatureCanvas>(null)
    const [isEmpty, setIsEmpty] = useState(true)

    const clear = () => {
        sigPad.current?.clear()
        setIsEmpty(true)
    }

    const save = () => {
        if (sigPad.current && !sigPad.current.isEmpty()) {
            // Trim whitespace for cleaner image
            const dataUrl = sigPad.current.getTrimmedCanvas().toDataURL('image/png')
            onSave(dataUrl)
        }
    }

    const handleEnd = () => {
        if (sigPad.current) {
            setIsEmpty(sigPad.current.isEmpty())
        }
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg bg-white overflow-hidden touch-none">
                <SignatureCanvas
                    ref={sigPad}
                    penColor="black"
                    canvasProps={{
                        className: "w-full h-64 bg-white cursor-crosshair",
                    }}
                    onEnd={handleEnd}
                    backgroundColor="rgb(255, 255, 255)"
                />
            </div>

            <p className="text-xs text-muted-foreground text-center">
                Sign above with your finger or pen
            </p>

            <div className="flex gap-2">
                <Button
                    variant="outline"
                    onClick={clear}
                    className="flex-1"
                    disabled={isEmpty}
                >
                    <Eraser className="h-4 w-4 mr-2" />
                    Clear
                </Button>
                <Button
                    onClick={save}
                    className="flex-1"
                    disabled={isEmpty}
                >
                    <Check className="h-4 w-4 mr-2" />
                    Accept Signature
                </Button>
            </div>
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={onCancel}>
                Cancel
            </Button>
        </div>
    )
}
