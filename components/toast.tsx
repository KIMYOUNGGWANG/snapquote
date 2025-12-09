"use client"

import { useEffect, useState } from "react"

interface Toast {
    id: string
    message: string
    type: "success" | "error" | "info"
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
            }, 3000)
        }

        listeners.add(listener)
        return () => {
            listeners.delete(listener)
        }
    }, [])

    return toasts
}

export function Toaster() {
    const toasts = useToast()

    return (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={`pointer-events-auto px-4 py-3 rounded-lg shadow-lg animate-in slide-in-from-top-2 fade-in ${toast.type === "success"
                            ? "bg-green-500 text-white"
                            : toast.type === "error"
                                ? "bg-red-500 text-white"
                                : "bg-blue-500 text-white"
                        }`}
                >
                    {toast.message}
                </div>
            ))}
        </div>
    )
}
