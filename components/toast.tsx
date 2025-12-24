"use client"

import { useEffect, useState } from "react"
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react"

interface Toast {
    id: string
    message: string
    type: "success" | "error" | "warning" | "info"
}

let toastCount = 0
const listeners = new Set<(toast: Toast) => void>()

export function toast(message: string, type: Toast["type"] = "success") {
    const id = `toast-${++toastCount}-${Date.now()}`
    const newToast = { id, message, type }
    listeners.forEach((listener) => listener(newToast))
}

export function useToast() {
    const [toasts, setToasts] = useState<Toast[]>([])

    useEffect(() => {
        const listener = (toast: Toast) => {
            setToasts((prev) => [...prev, toast])
            setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== toast.id))
            }, 4000)
        }

        listeners.add(listener)
        return () => {
            listeners.delete(listener)
        }
    }, [])

    const removeToast = (id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
    }

    return { toasts, removeToast }
}

const toastStyles = {
    success: "bg-green-500 text-white",
    error: "bg-red-500 text-white",
    warning: "bg-yellow-500 text-white",
    info: "bg-blue-500 text-white"
}

const ToastIcon = ({ type }: { type: Toast["type"] }) => {
    const iconClass = "h-5 w-5 shrink-0"
    switch (type) {
        case "success": return <CheckCircle className={iconClass} />
        case "error": return <XCircle className={iconClass} />
        case "warning": return <AlertTriangle className={iconClass} />
        case "info": return <Info className={iconClass} />
    }
}

export function Toaster() {
    const { toasts, removeToast } = useToast()

    return (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm">
            {toasts.map((t) => (
                <div
                    key={t.id}
                    className={`pointer-events-auto px-4 py-3 rounded-lg shadow-lg animate-in slide-in-from-top-2 fade-in flex items-center gap-3 ${toastStyles[t.type]}`}
                >
                    <ToastIcon type={t.type} />
                    <span className="flex-1 text-sm font-medium">{t.message}</span>
                    <button
                        onClick={() => removeToast(t.id)}
                        className="p-1 hover:bg-white/20 rounded transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            ))}
        </div>
    )
}
