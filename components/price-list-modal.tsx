"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { X, Loader2, Plus } from "lucide-react"
import type { PriceListItem, PriceCategory, PriceUnit, CreatePriceListItem } from "@/types"

interface PriceListModalProps {
    open: boolean
    onClose: () => void
    onSave: (item: CreatePriceListItem & { id?: string }) => Promise<void>
    editItem?: PriceListItem | null
}

const CATEGORIES: { value: PriceCategory; label: string }[] = [
    { value: "PARTS", label: "Parts" },
    { value: "LABOR", label: "Labor" },
    { value: "SERVICE", label: "Service" },
]

const UNITS: { value: PriceUnit; label: string }[] = [
    { value: "each", label: "Each" },
    { value: "hour", label: "Hour" },
    { value: "sqft", label: "Sq Ft" },
    { value: "linear_ft", label: "Linear Ft" },
    { value: "unit", label: "Unit" },
]

export function PriceListModal({ open, onClose, onSave, editItem }: PriceListModalProps) {
    const [name, setName] = useState("")
    const [price, setPrice] = useState("")
    const [category, setCategory] = useState<PriceCategory>("PARTS")
    const [unit, setUnit] = useState<PriceUnit>("each")
    const [keywords, setKeywords] = useState("")
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState("")

    useEffect(() => {
        if (open && editItem) {
            setName(editItem.name)
            setPrice(editItem.price.toString())
            setCategory(editItem.category)
            setUnit(editItem.unit)
            setKeywords(editItem.keywords.join(", "))
        } else if (open) {
            setName("")
            setPrice("")
            setCategory("PARTS")
            setUnit("each")
            setKeywords("")
        }
        setError("")
    }, [open, editItem])

    if (!open) return null

    const handleSave = async () => {
        if (!name.trim()) {
            setError("Item name is required")
            return
        }
        if (!price || isNaN(Number(price)) || Number(price) < 0) {
            setError("Valid price is required")
            return
        }

        setSaving(true)
        setError("")

        try {
            await onSave({
                id: editItem?.id,
                name: name.trim(),
                price: Number(price),
                category,
                unit,
                keywords: keywords.split(",").map(k => k.trim()).filter(k => k),
            })
            onClose()
        } catch {
            setError("Failed to save. Please try again.")
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="field-panel w-full max-w-md overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/10 bg-slate-950/70 p-4">
                    <h2 className="text-lg font-semibold text-white">
                        {editItem ? "Edit Price Item" : "Add Price Item"}
                    </h2>
                    <Button variant="ghost" size="icon" className="rounded-lg text-slate-300 hover:bg-white/10 hover:text-white" onClick={onClose} aria-label="Close price item modal">
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <div className="p-4 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name" className="text-slate-200">Item Name *</Label>
                        <Input
                            id="name"
                            placeholder="e.g., Kitchen Faucet Replacement"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="rounded-lg border-white/10 bg-slate-950 text-white placeholder:text-slate-500"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="price" className="text-slate-200">Price ($) *</Label>
                            <Input
                                id="price"
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="250.00"
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                className="rounded-lg border-white/10 bg-slate-950 text-white placeholder:text-slate-500"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="unit" className="text-slate-200">Unit</Label>
                            <select
                                id="unit"
                                value={unit}
                                onChange={(e) => setUnit(e.target.value as PriceUnit)}
                                className="h-11 w-full rounded-lg border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                {UNITS.map(u => (
                                    <option key={u.value} value={u.value}>{u.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="category" className="text-slate-200">Category</Label>
                        <div className="flex gap-2">
                            {CATEGORIES.map(c => (
                                <button
                                    key={c.value}
                                    type="button"
                                    onClick={() => setCategory(c.value)}
                                    className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${category === c.value
                                            ? "border-blue-400/45 bg-blue-500/15 text-white"
                                            : "border-white/10 bg-slate-950/70 text-slate-300 hover:bg-slate-900"
                                        }`}
                                >
                                    {c.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="keywords" className="text-slate-200">Keywords (for voice matching)</Label>
                        <Input
                            id="keywords"
                            placeholder="faucet, 수도꼭지, grifo"
                            value={keywords}
                            onChange={(e) => setKeywords(e.target.value)}
                            className="rounded-lg border-white/10 bg-slate-950 text-white placeholder:text-slate-500"
                        />
                        <p className="text-xs text-slate-500">
                            Separate with commas. AI will match voice input to these keywords.
                        </p>
                    </div>

                    {error && (
                        <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>
                    )}
                </div>

                <div className="flex gap-2 border-t border-white/10 bg-slate-950/50 p-4">
                    <Button variant="outline" className="flex-1 rounded-lg border-white/10 bg-slate-950 text-slate-100 hover:bg-slate-900" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button className="flex-1 rounded-lg" onClick={handleSave} disabled={saving}>
                        {saving ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Plus className="mr-2 h-4 w-4" />
                                {editItem ? "Update" : "Add Item"}
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    )
}
