"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, CalendarDays, Camera, ClipboardList, DollarSign, FileText, Plus, Receipt, Search, Store, Trash2, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { saveReceipt, getReceipts, deleteReceipt, type Receipt as ReceiptType } from "@/lib/db"
import { saveReceiptEstimatePrefill } from "@/lib/receipt-estimate-prefill"
import { toast } from "@/components/toast"

function formatReceiptAmount(amount: number) {
    return `$${amount.toFixed(2)}`
}

export default function ReceiptsPage() {
    const router = useRouter()
    const [receipts, setReceipts] = useState<ReceiptType[]>([])
    const [searchQuery, setSearchQuery] = useState("")
    const [isAddingNew, setIsAddingNew] = useState(false)
    const [newReceipt, setNewReceipt] = useState({
        photoUrl: "",
        amount: "",
        vendor: "",
        note: "",
    })
    const [receiptToDelete, setReceiptToDelete] = useState<ReceiptType | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const loadReceipts = useCallback(async () => {
        const data = await getReceipts()
        setReceipts(data.reverse())
    }, [])

    useEffect(() => {
        void loadReceipts()
    }, [loadReceipts])

    const totalCaptured = useMemo(() => {
        return receipts.reduce((sum, receipt) => sum + (receipt.amount ?? 0), 0)
    }, [receipts])

    const receiptsWithAmount = useMemo(() => {
        return receipts.filter((receipt) => typeof receipt.amount === "number").length
    }, [receipts])

    const filteredReceipts = useMemo(() => {
        const query = searchQuery.trim().toLowerCase()
        if (!query) return receipts

        return receipts.filter((receipt) => {
            const amount = typeof receipt.amount === "number" ? receipt.amount.toFixed(2) : ""
            return (
                receipt.vendor?.toLowerCase().includes(query) ||
                receipt.note?.toLowerCase().includes(query) ||
                receipt.date.toLowerCase().includes(query) ||
                amount.includes(query)
            )
        })
    }, [receipts, searchQuery])

    const parsedNewReceiptAmount = Number.parseFloat(newReceipt.amount)
    const hasNewReceiptAmount = Number.isFinite(parsedNewReceiptAmount)
    const hasNewReceiptVendor = newReceipt.vendor.trim().length > 0
    const receiptFormStatus = newReceipt.photoUrl ? "Ready to save" : "Photo needed"
    const receiptCaptureReadiness = [
        {
            label: "Photo",
            value: newReceipt.photoUrl ? "Ready" : "Needed",
            isReady: Boolean(newReceipt.photoUrl),
        },
        {
            label: "Cost",
            value: hasNewReceiptAmount ? formatReceiptAmount(parsedNewReceiptAmount) : "Not set",
            isReady: hasNewReceiptAmount,
        },
        {
            label: "Vendor",
            value: hasNewReceiptVendor ? "Set" : "Not set",
            isReady: hasNewReceiptVendor,
        },
    ]
    const latestReceipt = filteredReceipts[0] || null
    const latestReceiptSource = latestReceipt
        ? `${latestReceipt.vendor?.trim() || latestReceipt.date} - ${typeof latestReceipt.amount === "number" ? formatReceiptAmount(latestReceipt.amount) : "amount not set"}`
        : null
    const hasActiveSearch = searchQuery.trim().length > 0

    const handlePhotoCapture = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = (readerEvent) => {
            setNewReceipt((prev) => ({ ...prev, photoUrl: String(readerEvent.target?.result || "") }))
        }
        reader.readAsDataURL(file)
    }, [])

    const handleSaveReceipt = useCallback(async () => {
        if (!newReceipt.photoUrl) {
            toast("Add a receipt photo first", "error")
            return
        }

        const parsedAmount = Number.parseFloat(newReceipt.amount)

        await saveReceipt({
            photoUrl: newReceipt.photoUrl,
            amount: Number.isFinite(parsedAmount) ? parsedAmount : undefined,
            vendor: newReceipt.vendor.trim() || undefined,
            note: newReceipt.note.trim() || undefined,
            date: new Date().toISOString().split("T")[0],
        })

        toast("Receipt saved", "success")
        setNewReceipt({ photoUrl: "", amount: "", vendor: "", note: "" })
        setIsAddingNew(false)
        void loadReceipts()
    }, [newReceipt, loadReceipts])

    const confirmDelete = useCallback(async () => {
        if (!receiptToDelete) return

        await deleteReceipt(receiptToDelete.id)
        toast("Receipt deleted", "success")
        setReceiptToDelete(null)
        void loadReceipts()
    }, [loadReceipts, receiptToDelete])

    const startEstimateFromReceipt = useCallback((receipt: ReceiptType) => {
        const didStoreReceipt = saveReceiptEstimatePrefill(receipt)

        if (!didStoreReceipt) {
            toast("Receipt details could not be loaded for a quote.", "error")
            return
        }

        router.push("/new-estimate?capture=type&receipt=1")
    }, [router])

    return (
        <div className="field-app min-h-screen px-4 pb-28 pt-5">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
                <header className="field-panel space-y-4 p-4 sm:p-5" data-testid="receipts-summary-panel">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <Button asChild variant="ghost" size="icon" className="h-11 min-h-11 min-w-11 w-11 rounded-lg border border-white/10 bg-slate-950/50">
                                <Link href="/" aria-label="Back to home">
                                    <ArrowLeft className="h-5 w-5" />
                                </Link>
                            </Button>
                            <div>
                                <h1 className="text-2xl font-semibold tracking-tight text-white">Receipts</h1>
                                <p className="text-sm text-slate-400">Capture job costs while they are still in hand.</p>
                            </div>
                        </div>
                        <Button
                            type="button"
                            onClick={() => setIsAddingNew((current) => !current)}
                            data-testid="add-receipt-button"
                            className="h-10 shrink-0 rounded-lg px-3"
                            variant={isAddingNew ? "outline" : "default"}
                        >
                            {isAddingNew ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                            {isAddingNew ? "Close" : "Add"}
                        </Button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 lg:hidden">
                        <div className="field-mini">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Saved</p>
                            <p className="mt-1 text-xl font-semibold text-white">{receipts.length}</p>
                        </div>
                        <div className="field-mini">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Costed</p>
                            <p className="mt-1 text-xl font-semibold text-white">{receiptsWithAmount}</p>
                        </div>
                        <div className="field-mini">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Total</p>
                            <p className="mt-1 text-xl font-semibold text-white">${totalCaptured.toFixed(0)}</p>
                        </div>
                    </div>
                </header>

                <div
                    className="grid w-full min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start"
                    data-testid="receipts-workbench"
                >
                <aside
                    className={`${isAddingNew ? "grid" : "hidden"} order-1 gap-4 lg:order-2 lg:grid lg:sticky lg:top-5`}
                    data-testid="receipts-side-panel"
                >
                    <section className="field-card hidden p-4 lg:block">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-slate-950/70 text-slate-200">
                                <Receipt className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-white">Receipt capture</p>
                                <p className="mt-1 text-xs leading-5 text-slate-400">Keep material costs ready for the next quote.</p>
                            </div>
                        </div>
                        <div className="mt-4 grid gap-2">
                            <div className="field-mini">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Saved</p>
                                <p className="mt-1 text-2xl font-semibold text-white">{receipts.length}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="field-mini">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Costed</p>
                                    <p className="mt-1 text-xl font-semibold text-white">{receiptsWithAmount}</p>
                                </div>
                                <div className="field-mini">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Total</p>
                                    <p className="mt-1 text-xl font-semibold text-white">${totalCaptured.toFixed(0)}</p>
                                </div>
                            </div>
                        </div>
                    </section>

                {isAddingNew ? (
                    <section className="field-panel p-3">
                        <div className="field-section-title">
                            <span>New receipt</span>
                            <span data-testid="receipt-form-status">{receiptFormStatus}</span>
                        </div>

                        <div className="mt-3 space-y-3">
                            <button
                                type="button"
                                className="flex min-h-32 w-full items-center justify-center rounded-lg border border-dashed border-white/20 bg-slate-950/70 p-4 text-center transition-colors hover:border-blue-400/40"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    onChange={handlePhotoCapture}
                                    className="hidden"
                                    data-testid="receipt-photo-input"
                                />
                                {newReceipt.photoUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={newReceipt.photoUrl}
                                        alt="Receipt preview"
                                        className="max-h-52 rounded-lg object-contain"
                                    />
                                ) : (
                                    <span className="flex flex-col items-center gap-3">
                                        <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-white/10 bg-slate-900">
                                            <Camera className="h-6 w-6 text-slate-300" />
                                        </span>
                                        <span>
                                            <span className="block font-semibold text-white">Capture receipt photo</span>
                                            <span className="mt-1 block text-sm text-slate-400">Camera opens on supported mobile browsers.</span>
                                        </span>
                                    </span>
                                )}
                            </button>

                            <div className="grid grid-cols-2 gap-3">
                                <label className="space-y-2">
                                    <span className="text-sm font-medium text-slate-200">Amount</span>
                                    <Input
                                        type="number"
                                        inputMode="decimal"
                                        placeholder="0.00"
                                        className="h-12 rounded-lg border-white/10 bg-slate-950/70 text-white"
                                        value={newReceipt.amount}
                                        onChange={(event) => setNewReceipt((prev) => ({ ...prev, amount: event.target.value }))}
                                    />
                                </label>

                                <label className="space-y-2">
                                    <span className="text-sm font-medium text-slate-200">Vendor</span>
                                    <Input
                                        placeholder="Home Depot"
                                        className="h-12 rounded-lg border-white/10 bg-slate-950/70 text-white"
                                        value={newReceipt.vendor}
                                        onChange={(event) => setNewReceipt((prev) => ({ ...prev, vendor: event.target.value }))}
                                    />
                                </label>
                            </div>

                            <label className="space-y-2">
                                <span className="text-sm font-medium text-slate-200">Note</span>
                                <Textarea
                                    placeholder="Materials, job name, or reimbursable detail"
                                    className="min-h-16 rounded-lg border-white/10 bg-slate-950/70 text-white sm:min-h-20"
                                    value={newReceipt.note}
                                    onChange={(event) => setNewReceipt((prev) => ({ ...prev, note: event.target.value }))}
                                />
                            </label>

                            <div className="grid grid-cols-3 gap-2" data-testid="receipt-capture-readiness">
                                {receiptCaptureReadiness.map((item) => (
                                    <div
                                        key={item.label}
                                        className={`rounded-lg border px-2.5 py-2 ${item.isReady ? "border-emerald-300/25 bg-emerald-400/10" : "border-white/10 bg-slate-950/60"}`}
                                    >
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
                                        <p className={`mt-1 truncate text-sm font-semibold ${item.isReady ? "text-emerald-100" : "text-slate-300"}`}>
                                            {item.value}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-2 gap-2" data-testid="receipt-form-actions">
                                <Button type="button" variant="outline" className="rounded-lg border-white/10 bg-slate-900/70" onClick={() => setIsAddingNew(false)}>
                                    Cancel
                                </Button>
                                <Button type="button" className="rounded-lg" onClick={handleSaveReceipt} disabled={!newReceipt.photoUrl}>
                                    Save Receipt
                                </Button>
                            </div>
                            {!newReceipt.photoUrl ? (
                                <p className="text-center text-xs leading-5 text-slate-500">
                                    Add a receipt photo before saving.
                                </p>
                            ) : null}
                        </div>
                    </section>
                ) : (
                    <section className="field-card border-blue-400/20 bg-blue-500/10 p-4">
                        <p className="text-sm font-semibold text-blue-50">Quote from costs</p>
                        <p className="mt-1 text-sm leading-6 text-blue-50/75">
                            {latestReceipt
                                ? "Start from the latest receipt and add job context before generating."
                                : "Capture a material receipt, then turn it into quote notes."}
                        </p>
                        {latestReceiptSource ? (
                            <div className="mt-3 rounded-lg border border-blue-200/10 bg-blue-950/30 px-3 py-2" data-testid="receipts-next-quote-source">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-100/55">Next source</p>
                                <p className="mt-1 truncate text-sm font-semibold text-blue-50">{latestReceiptSource}</p>
                            </div>
                        ) : null}
                        {latestReceipt ? (
                            <Button
                                type="button"
                                className="mt-4 h-11 w-full rounded-lg"
                                onClick={() => startEstimateFromReceipt(latestReceipt)}
                                data-testid="receipts-next-quote-button"
                            >
                                <FileText className="h-4 w-4" />
                                Start quote
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                className="mt-4 h-11 w-full rounded-lg"
                                onClick={() => setIsAddingNew(true)}
                                data-testid="receipts-side-add-button"
                            >
                                <Plus className="h-4 w-4" />
                                Add receipt
                            </Button>
                        )}
                    </section>
                )}
                </aside>

                <div className="order-2 min-w-0 space-y-4 lg:order-1" data-testid="receipts-stack-column">

                {receipts.length > 0 && (
                    <section className="field-panel w-full min-w-0 p-3" data-testid="receipts-search-panel">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                            <Input
                                placeholder="Search receipts, notes, dates"
                                className="h-12 rounded-lg border-white/10 bg-slate-950/70 pl-10 pr-12 text-white placeholder:text-slate-500"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                data-testid="receipt-search-input"
                            />
                            {hasActiveSearch ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-1/2 h-11 w-11 -translate-y-1/2 rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
                                    onClick={() => setSearchQuery("")}
                                    aria-label="Clear receipt search"
                                    data-testid="receipt-search-clear"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            ) : null}
                        </div>
                    </section>
                )}

                <section className="w-full min-w-0 space-y-3" data-testid="receipts-stack-section">
                    <div className="field-section-title">
                        <span>Receipt stack</span>
                        <span>{filteredReceipts.length} shown</span>
                    </div>

                    {receipts.length === 0 && !isAddingNew && (
                        <div className="field-panel flex min-h-[180px] flex-col items-center justify-center px-5 py-12 text-center">
                            <Receipt className="mx-auto h-11 w-11 text-slate-500" />
                            <p className="mt-4 font-semibold text-white">No receipts yet</p>
                            <p className="mx-auto mt-1 max-w-60 text-sm leading-6 text-slate-400">Add material purchases before the paper disappears.</p>
                            <Button
                                type="button"
                                className="mt-5 h-10 rounded-lg px-4"
                                onClick={() => setIsAddingNew(true)}
                                data-testid="empty-add-receipt-button"
                            >
                                <Plus className="h-4 w-4" />
                                Add receipt
                            </Button>
                        </div>
                    )}

                    {filteredReceipts.length === 0 && receipts.length > 0 && (
                        <div className="field-panel px-5 py-12 text-center">
                            <Search className="mx-auto h-11 w-11 text-slate-500" />
                            <p className="mt-4 font-semibold text-white">No matching receipts</p>
                            <p className="mx-auto mt-1 max-w-60 text-sm leading-6 text-slate-400">Try a vendor, note, date, or amount from the receipt stack.</p>
                            <Button
                                type="button"
                                variant="outline"
                                className="mt-5 h-10 rounded-lg border-white/10 bg-slate-950/70 px-4 text-slate-200 hover:bg-slate-900 hover:text-white"
                                onClick={() => setSearchQuery("")}
                                data-testid="receipt-empty-search-clear"
                            >
                                <X className="h-4 w-4" />
                                Clear search
                            </Button>
                        </div>
                    )}

                    {filteredReceipts.map((receipt) => {
                        const amount = receipt.amount
                        const hasAmount = typeof amount === "number"
                        const hasVendor = Boolean(receipt.vendor?.trim())
                        const receiptReadiness = hasAmount && hasVendor
                            ? "Quote ready"
                            : hasAmount
                                ? "Needs vendor"
                                : "Needs amount"
                        const missingFields = [
                            hasAmount ? null : "amount",
                            hasVendor ? null : "vendor",
                        ].filter(Boolean)
                        const receiptReadinessDetail = missingFields.length > 0
                            ? `Missing ${missingFields.join(" + ")}`
                            : "Cost and vendor ready"
                        const amountLabel = hasAmount ? formatReceiptAmount(amount) : "Amount not set"

                        return (
                            <div key={receipt.id} className="field-card p-3" data-testid="receipt-card">
                                <div className="flex gap-3">
                                    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-slate-950">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={receipt.photoUrl}
                                            alt="Receipt"
                                            className="h-full w-full object-contain"
                                        />
                                        <span className="absolute bottom-1 left-1 rounded-md bg-slate-950/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300">
                                            Photo
                                        </span>
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="text-lg font-semibold text-white">
                                                    {amountLabel}
                                                </p>
                                                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                                                    <span className="rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-slate-300">
                                                        {receiptReadiness}
                                                    </span>
                                                    {hasAmount ? (
                                                        <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-300/25 bg-emerald-400/10 px-2 py-1 text-emerald-200">
                                                            <DollarSign className="h-3 w-3" />
                                                            Cost saved
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="shrink-0 rounded-lg text-slate-500 hover:text-red-200"
                                                onClick={() => setReceiptToDelete(receipt)}
                                                aria-label="Delete receipt"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>

                                        <div className="mt-3 grid gap-1.5 text-sm text-slate-300">
                                            <p className="flex min-w-0 items-start gap-1.5">
                                                <Store className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                                                <span
                                                    className="line-clamp-2 min-w-0 break-words [overflow-wrap:anywhere]"
                                                    data-testid="receipt-card-vendor"
                                                >
                                                    {receipt.vendor || "Vendor not set"}
                                                </span>
                                            </p>
                                            <p className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
                                                <CalendarDays className="h-3.5 w-3.5" />
                                                {receipt.date}
                                            </p>
                                            {receipt.note && (
                                                <p className="flex min-w-0 items-start gap-1.5 text-sm text-slate-400">
                                                    <ClipboardList className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                                                    <span
                                                        className="line-clamp-3 min-w-0 break-words [overflow-wrap:anywhere]"
                                                        data-testid="receipt-card-note"
                                                    >
                                                        {receipt.note}
                                                    </span>
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-2 border-t border-white/10 pt-3" data-testid="receipt-card-actions">
                                    <p className="text-xs leading-5 text-slate-500" data-testid="receipt-card-readiness-detail">
                                        {receiptReadinessDetail}
                                    </p>
                                    <Button
                                        type="button"
                                        className="h-10 rounded-lg px-3 sm:px-4"
                                        onClick={() => startEstimateFromReceipt(receipt)}
                                        aria-label={`Start quote from receipt ${receipt.vendor || receipt.date}`}
                                        data-testid="receipt-start-estimate-button"
                                    >
                                        <FileText className="h-4 w-4" />
                                        Start Quote
                                    </Button>
                                </div>
                            </div>
                        )
                    })}
                </section>
                </div>
                </div>
            </div>
            <ConfirmDialog
                open={Boolean(receiptToDelete)}
                onClose={() => setReceiptToDelete(null)}
                onConfirm={confirmDelete}
                title="Delete receipt?"
                description="This removes the saved receipt photo and cost detail from this device."
            />
        </div>
    )
}
