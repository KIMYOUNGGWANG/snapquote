"use client"

import { useState, useEffect, useRef } from "react"
import { Camera, Receipt, Trash2, Plus, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import Link from "next/link"
import { saveReceipt, getReceipts, deleteReceipt, type Receipt as ReceiptType } from "@/lib/db"
import { toast } from "@/components/toast"

export default function ReceiptsPage() {
    const [receipts, setReceipts] = useState<ReceiptType[]>([])
    const [isAddingNew, setIsAddingNew] = useState(false)
    const [newReceipt, setNewReceipt] = useState({
        photoUrl: "",
        amount: "",
        vendor: "",
        note: "",
    })
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        loadReceipts()
    }, [])

    const loadReceipts = async () => {
        const data = await getReceipts()
        setReceipts(data.reverse()) // Most recent first
    }

    const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = (event) => {
            setNewReceipt(prev => ({ ...prev, photoUrl: event.target?.result as string }))
        }
        reader.readAsDataURL(file)
    }

    const handleSaveReceipt = async () => {
        if (!newReceipt.photoUrl) {
            toast("📸 Please add a photo first", "error")
            return
        }

        await saveReceipt({
            photoUrl: newReceipt.photoUrl,
            amount: newReceipt.amount ? parseFloat(newReceipt.amount) : undefined,
            vendor: newReceipt.vendor || undefined,
            note: newReceipt.note || undefined,
            date: new Date().toISOString().split('T')[0],
        })

        toast("✅ Receipt saved!", "success")
        setNewReceipt({ photoUrl: "", amount: "", vendor: "", note: "" })
        setIsAddingNew(false)
        loadReceipts()
    }

    const handleDelete = async (id: string) => {
        await deleteReceipt(id)
        toast("🗑️ Receipt deleted", "success")
        loadReceipts()
    }

    return (
        <div className="min-h-screen bg-background p-4 pb-24">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <Link href="/">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                </Link>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    🧾 Receipts
                </h1>
            </div>

            {/* Add New Button */}
            {!isAddingNew && (
                <Button
                    className="w-full mb-6"
                    onClick={() => setIsAddingNew(true)}
                >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Receipt
                </Button>
            )}

            {/* New Receipt Form */}
            {isAddingNew && (
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle className="text-lg">New Receipt</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Photo */}
                        <div
                            className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary transition-colors"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={handlePhotoCapture}
                                className="hidden"
                            />
                            {newReceipt.photoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={newReceipt.photoUrl}
                                    alt="Receipt"
                                    className="max-h-40 mx-auto rounded"
                                />
                            ) : (
                                <>
                                    <Camera className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
                                    <p className="text-sm text-muted-foreground">Tap to capture receipt</p>
                                </>
                            )}
                        </div>

                        {/* Amount */}
                        <div>
                            <label className="text-sm text-muted-foreground">Amount (optional)</label>
                            <Input
                                type="number"
                                placeholder="$0.00"
                                value={newReceipt.amount}
                                onChange={(e) => setNewReceipt(prev => ({ ...prev, amount: e.target.value }))}
                            />
                        </div>

                        {/* Vendor */}
                        <div>
                            <label className="text-sm text-muted-foreground">Vendor (optional)</label>
                            <Input
                                placeholder="e.g. Home Depot"
                                value={newReceipt.vendor}
                                onChange={(e) => setNewReceipt(prev => ({ ...prev, vendor: e.target.value }))}
                            />
                        </div>

                        {/* Note */}
                        <div>
                            <label className="text-sm text-muted-foreground">Note (optional)</label>
                            <Textarea
                                placeholder="What was this for?"
                                value={newReceipt.note}
                                onChange={(e) => setNewReceipt(prev => ({ ...prev, note: e.target.value }))}
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                            <Button variant="outline" className="flex-1" onClick={() => setIsAddingNew(false)}>
                                Cancel
                            </Button>
                            <Button className="flex-1" onClick={handleSaveReceipt}>
                                Save Receipt
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Receipts List */}
            <div className="space-y-4">
                {receipts.length === 0 && !isAddingNew && (
                    <div className="text-center py-12 text-muted-foreground">
                        <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No receipts yet</p>
                        <p className="text-sm">Tap &quot;Add Receipt&quot; to get started</p>
                    </div>
                )}

                {receipts.map((receipt) => (
                    <Card key={receipt.id} className="overflow-hidden">
                        <div className="flex">
                            {/* Thumbnail */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={receipt.photoUrl}
                                alt="Receipt"
                                className="w-24 h-24 object-cover"
                            />
                            <div className="flex-1 p-3">
                                <div className="flex justify-between items-start">
                                    <div>
                                        {receipt.amount && (
                                            <p className="font-bold text-lg">${receipt.amount.toFixed(2)}</p>
                                        )}
                                        {receipt.vendor && (
                                            <p className="text-sm text-muted-foreground">{receipt.vendor}</p>
                                        )}
                                        <p className="text-xs text-muted-foreground">{receipt.date}</p>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-destructive"
                                        onClick={() => handleDelete(receipt.id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                                {receipt.note && (
                                    <p className="text-sm mt-1 text-muted-foreground line-clamp-1">{receipt.note}</p>
                                )}
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    )
}
