"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react"
import { useBottomChromeOffset } from "@/hooks/use-bottom-chrome-offset"

interface Toast {
    id: string
    message: string
    type: "success" | "error" | "warning" | "info"
}

let toastCount = 0
const listeners = new Set<(toast: Toast) => void>()
const clearListeners = new Set<() => void>()
const MAX_VISIBLE_TOASTS = 1

export function toast(message: string, type: Toast["type"] = "success") {
    const id = `toast-${++toastCount}-${Date.now()}`
    const newToast = { id, message, type }
    listeners.forEach((listener) => listener(newToast))
}

export function dismissToasts() {
    clearListeners.forEach((listener) => listener())
}

export function useToast() {
    const [toasts, setToasts] = useState<Toast[]>([])

    useEffect(() => {
        const listener = (toast: Toast) => {
            setToasts((prev) => [...prev, toast].slice(-MAX_VISIBLE_TOASTS))
            setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== toast.id))
            }, 3000)
        }
        const clearListener = () => setToasts([])

        listeners.add(listener)
        clearListeners.add(clearListener)
        return () => {
            listeners.delete(listener)
            clearListeners.delete(clearListener)
        }
    }, [])

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
    }, [])

    const clearToasts = useCallback(() => {
        setToasts([])
    }, [])

    return { toasts, removeToast, clearToasts }
}

const toastStyles = {
    success: "border-emerald-400/25 bg-emerald-950/95 text-emerald-50",
    error: "border-red-400/25 bg-red-950/95 text-red-50",
    warning: "border-amber-400/25 bg-amber-950/95 text-amber-50",
    info: "border-sky-400/25 bg-sky-950/95 text-sky-50"
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
    const pathname = usePathname()
    const { toasts, removeToast, clearToasts } = useToast()
    const bottomOffset = useBottomChromeOffset({ gap: 20, includeOfflineBanner: true })

    useEffect(() => {
        if (pathname?.startsWith("/login") || pathname?.startsWith("/auth/callback")) {
            clearToasts()
        }
    }, [clearToasts, pathname])

    return (
        <div
            className="pointer-events-none fixed inset-x-4 z-[120] flex max-w-[calc(100vw-2rem)] flex-col items-stretch gap-2 transition-[bottom] duration-300 sm:left-auto sm:right-4 sm:max-w-sm sm:items-end"
            data-testid="toast-stack"
            style={{
                bottom: bottomOffset,
            }}
        >
            {toasts.map((t) => (
                <div
                    key={t.id}
                    className={`pointer-events-auto flex w-full max-w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 shadow-[0_18px_44px_-24px_rgba(0,0,0,0.95)] backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 sm:w-fit sm:slide-in-from-top-2 ${toastStyles[t.type]}`}
                    data-testid="toast-message"
                    role="status"
                >
                    <ToastIcon type={t.type} />
                    <span className="min-w-0 flex-1 whitespace-normal break-words text-sm font-medium leading-snug" data-testid="toast-message-text">{t.message}</span>
                    <button
                        onClick={() => removeToast(t.id)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white/20"
                        aria-label="Dismiss notification"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            ))}
        </div>
    )
}
