"use client"

import { useState, useCallback } from "react"
import type { Estimate, EstimateItem, EstimateStep } from "@/types"
import { toast } from "@/components/toast"

interface UseEstimateOptions {
    initialTaxRate?: number
}

export function useEstimate(options: UseEstimateOptions = {}) {
    const { initialTaxRate = 13 } = options

    const [step, setStep] = useState<EstimateStep>("input")
    const [estimate, setEstimate] = useState<Estimate | null>(null)
    const [taxRate, setTaxRate] = useState(initialTaxRate)
    const [clientName, setClientName] = useState("")
    const [clientAddress, setClientAddress] = useState("")
    const [transcribedText, setTranscribedText] = useState("")

    // Calculate totals
    const subtotal = estimate?.items.reduce((sum, item) => sum + item.total, 0) ?? 0
    const taxAmount = subtotal * (taxRate / 100)
    const totalAmount = subtotal + taxAmount

    // Item management
    const handleItemChange = useCallback((
        index: number,
        field: keyof EstimateItem,
        value: string | number | boolean
    ) => {
        if (!estimate) return

        const newItems = [...estimate.items]
        const item = { ...newItems[index] }

        if (field === "description" || field === "notes") {
            (item as Record<string, unknown>)[field] = value as string
        } else if (field === "is_value_add") {
            item.is_value_add = value as boolean
        } else {
            (item as Record<string, unknown>)[field] = Number(value)
            if (field === "quantity" || field === "unit_price") {
                item.total = item.quantity * item.unit_price
            }
        }

        newItems[index] = item
        setEstimate({ ...estimate, items: newItems })
    }, [estimate])

    const handleAddItem = useCallback(() => {
        if (!estimate) return
        setEstimate({
            ...estimate,
            items: [...estimate.items, { description: "", quantity: 1, unit_price: 0, total: 0 }]
        })
    }, [estimate])

    const handleDeleteItem = useCallback((index: number) => {
        if (!estimate) return
        setEstimate({
            ...estimate,
            items: estimate.items.filter((_, i) => i !== index)
        })
    }, [estimate])

    const handleSummaryChange = useCallback((value: string) => {
        if (!estimate) return
        setEstimate({ ...estimate, summary_note: value })
    }, [estimate])

    // Reset state
    const reset = useCallback(() => {
        setStep("input")
        setEstimate(null)
        setTranscribedText("")
        setClientName("")
        setClientAddress("")
    }, [])

    return {
        // State
        step,
        setStep,
        estimate,
        setEstimate,
        taxRate,
        setTaxRate,
        clientName,
        setClientName,
        clientAddress,
        setClientAddress,
        transcribedText,
        setTranscribedText,

        // Computed
        subtotal,
        taxAmount,
        totalAmount,

        // Actions
        handleItemChange,
        handleAddItem,
        handleDeleteItem,
        handleSummaryChange,
        reset,
    }
}
