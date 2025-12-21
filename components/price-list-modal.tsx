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

    // Reset form when opening/closing or edit item changes
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
        } catch (err) {
            setError("Failed to save. Please try again.")
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-background rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-lg font-semibold">
                        {editItem ? "Edit Price Item" : "Add Price Item"}
                    </h2>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Item Name *</Label>
                        <Input
                            id="name"
                            placeholder="e.g., Kitchen Faucet Replacement"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="price">Price ($) *</Label>
                            <Input
                                id="price"
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="250.00"
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="unit">Unit</Label>
                            <select
                                id="unit"
                                value={unit}
                                onChange={(e) => setUnit(e.target.value as PriceUnit)}
                                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                            >
                                {UNITS.map(u => (
                                    <option key={u.value} value={u.value}>{u.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="category">Category</Label>
                        <div className="flex gap-2">
                            {CATEGORIES.map(c => (
                                <button
                                    key={c.value}
                                    type="button"
                                    onClick={() => setCategory(c.value)}
                                    className={`flex-1 py-2 px-3 text-sm rounded-md border transition-colors ${category === c.value
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "bg-muted border-muted-foreground/20 hover:bg-muted/80"
                                        }`}
                                >
                                    {c.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="keywords">Keywords (for voice matching)</Label>
                        <Input
                            id="keywords"
                            placeholder="faucet, 수도꼭지, grifo"
                            value={keywords}
                            onChange={(e) => setKeywords(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            Separate with commas. AI will match voice input to these keywords.
                        </p>
                    </div>

                    {error && (
                        <p className="text-sm text-destructive">{error}</p>
                    )}
                </div>

                {/* Footer */}
                <div className="flex gap-2 p-4 border-t bg-muted/50">
                    <Button variant="outline" className="flex-1" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button className="flex-1" onClick={handleSave} disabled={saving}>
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
