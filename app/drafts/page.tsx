"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import {
    AlertCircle,
    ArrowRight,
    Clock3,
    Edit3,
    FileText,
    Loader2,
    PlusCircle,
    Search,
    Send,
    Trash2,
    X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/toast"
import {
    deleteEstimate,
    getDraftEstimates,
    updateEstimateStatus,
    type LocalEstimate,
} from "@/lib/estimates-storage"
import { getAllItemsFromEstimate, lineTotal } from "@/lib/estimates/math"
import { cn } from "@/lib/utils"

const ConfirmDialog = dynamic(() => import("@/components/confirm-dialog").then((mod) => mod.ConfirmDialog), {
    ssr: false,
})

function formatAmount(amount: number): string {
    return `$${amount.toFixed(2)}`
}

function formatDate(value: string): string {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "Unknown"
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function getPriceTBDCount(estimate: LocalEstimate): number {
    return getAllItemsFromEstimate(estimate).filter((item) => item.unit_price === 0).length
}

function getDraftDisplayName(estimate: LocalEstimate): string {
    return estimate.clientName || estimate.estimateNumber || "Untitled draft"
}

function buildDraftSearchText(estimate: LocalEstimate): string {
    const itemText = getAllItemsFromEstimate(estimate)
        .map((item) => `${item.description} ${item.category} ${item.quantity} ${item.unit} ${item.unit_price} ${item.total}`)
        .join(" ")

    return [
        estimate.clientName,
        estimate.clientAddress,
        estimate.estimateNumber,
        estimate.summary_note,
        estimate.totalAmount,
        estimate.createdAt,
        estimate.updatedAt,
        itemText,
    ]
        .filter((value) => value !== undefined && value !== null)
        .join(" ")
        .toLowerCase()
}

export default function DraftsPage() {
    const router = useRouter()
    const [drafts, setDrafts] = useState<LocalEstimate[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [draftToDelete, setDraftToDelete] = useState<LocalEstimate | null>(null)
    const [sendingDraftId, setSendingDraftId] = useState<string | null>(null)

    const loadDrafts = useCallback(async () => {
        setLoading(true)
        try {
            setDrafts(await getDraftEstimates())
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void loadDrafts()
    }, [loadDrafts])

    const draftStats = useMemo(() => {
        const draftValue = drafts.reduce((sum, draft) => sum + draft.totalAmount, 0)
        const pricedNeededCount = drafts.reduce((sum, draft) => sum + getPriceTBDCount(draft), 0)
        const pendingSyncCount = drafts.filter((draft) => draft.synced === false).length
        const nextActionDraft = drafts.find((draft) => getPriceTBDCount(draft) > 0) || drafts[0] || null

        return {
            draftValue,
            pricedNeededCount,
            pendingSyncCount,
            nextActionDraft,
        }
    }, [drafts])

    const filteredDrafts = useMemo(() => {
        const query = searchQuery.trim().toLowerCase()
        if (!query) return drafts
        return drafts.filter((draft) => buildDraftSearchText(draft).includes(query))
    }, [drafts, searchQuery])

    const hasActiveSearch = searchQuery.trim().length > 0
    const nextActionPriceTBDCount = draftStats.nextActionDraft
        ? getPriceTBDCount(draftStats.nextActionDraft)
        : 0
    const nextActionButtonLabel = nextActionPriceTBDCount > 0 ? "Finish pricing" : "Review draft"

    const handleEditDraft = (estimate: LocalEstimate) => {
        router.push(`/new-estimate?draftId=${encodeURIComponent(estimate.id)}`)
    }

    const handleMarkSent = async (estimate: LocalEstimate) => {
        setSendingDraftId(estimate.id)
        try {
            await updateEstimateStatus(estimate.id, "sent")
            toast(`${getDraftDisplayName(estimate)} moved to Sent.`, "success")
            await loadDrafts()
        } finally {
            setSendingDraftId(null)
        }
    }

    const handleDeleteDraft = async (estimate: LocalEstimate) => {
        await deleteEstimate(estimate.id)
        setDraftToDelete(null)
        setDrafts((currentDrafts) => currentDrafts.filter((draft) => draft.id !== estimate.id))
        toast(`${getDraftDisplayName(estimate)} deleted.`, "success")
    }

    if (loading) {
        return (
            <div className="field-app flex min-h-screen items-center justify-center px-4 text-white" data-testid="drafts-loading-state">
                <div className="field-panel flex w-full max-w-sm items-center gap-3 p-4">
                    <Loader2 className="h-5 w-5 animate-spin text-blue-300" />
                    <div>
                        <p className="text-sm font-semibold">Loading draft workbench</p>
                        <p className="mt-1 text-xs text-slate-400">Checking estimates saved on this device.</p>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="drafts-console field-app min-h-screen px-4 pb-28 pt-5 text-white" data-testid="drafts-page">
            <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:gap-5">
                <section className="field-panel overflow-hidden" data-testid="drafts-summary-panel">
                    <div className="space-y-3 p-4 sm:p-5">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-slate-950/70 text-slate-200">
                                    <FileText className="h-5 w-5" />
                                </div>
                                <div className="min-w-0">
                                    <h1 className="text-2xl font-semibold leading-[1.25] sm:text-3xl sm:leading-[1.25]" data-testid="drafts-page-title">
                                        Draft workbench
                                    </h1>
                                    <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
                                        Finish pricing, review totals, and send open estimates.
                                    </p>
                                </div>
                            </div>
                            <Button asChild className="h-11 min-w-11 shrink-0 rounded-lg px-3 sm:px-4" data-testid="drafts-new-estimate-link">
                                <Link href="/new-estimate">
                                    <PlusCircle className="h-4 w-4" />
                                    <span className="hidden sm:inline">New estimate</span>
                                    <span className="sr-only sm:hidden">New estimate</span>
                                </Link>
                            </Button>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <div className="field-mini">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 sm:text-[11px] sm:tracking-[0.16em]">Open</p>
                                <p className="mt-1 text-xl font-semibold sm:text-2xl" data-testid="drafts-open-count">{drafts.length}</p>
                            </div>
                            <div className="field-mini">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 sm:text-[11px] sm:tracking-[0.16em]">Value</p>
                                <p className="mt-1 text-xl font-semibold sm:text-2xl" data-testid="drafts-value">{formatAmount(draftStats.draftValue)}</p>
                            </div>
                            <div className="field-mini">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 sm:text-[11px] sm:tracking-[0.16em]">Needs price</p>
                                <p className="mt-1 text-xl font-semibold sm:text-2xl" data-testid="drafts-pricing-needed">{draftStats.pricedNeededCount}</p>
                            </div>
                        </div>
                    </div>
                </section>

                <div
                    className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start"
                    data-testid="drafts-workbench"
                >
                {draftStats.nextActionDraft ? (
                    <aside
                        className="order-1 lg:order-2 lg:sticky lg:top-5"
                        data-testid="drafts-side-panel"
                    >
                    <section
                        className="field-card border-amber-300/20 bg-amber-500/10 p-4"
                        data-testid="drafts-next-action"
                    >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between lg:flex-col lg:items-stretch lg:justify-start">
                            <div className="flex min-w-0 gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-amber-300/25 bg-amber-300/10 text-amber-100">
                                    {nextActionPriceTBDCount > 0 ? (
                                        <AlertCircle className="h-5 w-5" />
                                    ) : (
                                        <Clock3 className="h-5 w-5" />
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-amber-50">
                                        {nextActionPriceTBDCount > 0
                                            ? "Next up: finish draft pricing"
                                            : "Next up: open the latest draft"}
                                    </p>
                                    <p className="mt-1 line-clamp-2 break-words text-sm leading-6 text-amber-50/75 [overflow-wrap:anywhere]" data-testid="drafts-next-action-description">
                                        {getDraftDisplayName(draftStats.nextActionDraft)}
                                        {nextActionPriceTBDCount > 0
                                            ? ` has ${nextActionPriceTBDCount} line item${nextActionPriceTBDCount === 1 ? "" : "s"} without pricing.`
                                            : " is ready for review before sending."}
                                    </p>
                                </div>
                            </div>
                            <Button
                                type="button"
                                className="h-11 shrink-0 rounded-lg lg:w-full"
                                onClick={() => handleEditDraft(draftStats.nextActionDraft!)}
                                data-testid="drafts-next-action-button"
                            >
                                {nextActionButtonLabel}
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </div>
                    </section>
                    </aside>
                ) : null}

                <section className="order-2 space-y-3 lg:order-1" data-testid="drafts-queue-section">
                    <div className="field-card p-3">
                        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-semibold">Draft queue</p>
                                    <Badge variant="outline" className="border-white/10 bg-slate-950/65 text-slate-300" data-testid="drafts-count-badge">
                                        {filteredDrafts.length} of {drafts.length}
                                    </Badge>
                                    {draftStats.pendingSyncCount > 0 ? (
                                        <Badge variant="outline" className="border-amber-400/30 bg-amber-500/10 text-amber-200">
                                            {draftStats.pendingSyncCount} pending sync
                                        </Badge>
                                    ) : null}
                                </div>
                                <p className="mt-1 text-sm leading-6 text-slate-400">
                                    Search by customer, quote number, address, or line item before opening the composer.
                                </p>
                            </div>
                            <div className="relative w-full sm:w-72">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                                <Input
                                    value={searchQuery}
                                    onChange={(event) => setSearchQuery(event.target.value)}
                                    placeholder="Search draft queue"
                                    aria-label="Search drafts"
                                    className="border-white/10 bg-slate-950/60 pl-9 pr-12 text-white placeholder:text-slate-500"
                                    data-testid="drafts-search-input"
                                />
                                {hasActiveSearch ? (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-0 top-1/2 h-11 w-11 -translate-y-1/2 text-slate-400 hover:bg-white/10 hover:text-white"
                                        onClick={() => setSearchQuery("")}
                                        aria-label="Clear drafts search"
                                        data-testid="drafts-clear-search"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    </div>

                    {filteredDrafts.length === 0 ? (
                        <div className="field-card flex flex-col items-center justify-center border-dashed p-8 text-center" data-testid="drafts-empty-state">
                            {hasActiveSearch ? (
                                <Search className="mb-4 h-12 w-12 text-slate-500" />
                            ) : (
                                <FileText className="mb-4 h-12 w-12 text-slate-500" />
                            )}
                            <h2 className="text-lg font-semibold">
                                {hasActiveSearch ? "No matching drafts" : "No local drafts yet"}
                            </h2>
                            <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
                                {hasActiveSearch
                                    ? `No open drafts match "${searchQuery.trim()}".`
                                    : "Start a quote from voice, photos, or rough notes. Saved drafts will stay available on this device."}
                            </p>
                            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                                {hasActiveSearch ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="rounded-lg border-white/10 bg-slate-950 text-slate-100 hover:bg-slate-900"
                                        onClick={() => setSearchQuery("")}
                                    >
                                        Clear search
                                    </Button>
                                ) : null}
                                <Button asChild className="rounded-lg">
                                    <Link href="/new-estimate">
                                        <PlusCircle className="mr-2 h-4 w-4" />
                                        New estimate
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="grid gap-3">
                            {filteredDrafts.map((draft) => {
                                const items = getAllItemsFromEstimate(draft)
                                const previewItems = items.slice(0, 2)
                                const priceTBDCount = getPriceTBDCount(draft)
                                const primaryActionLabel = priceTBDCount > 0 ? "Finish pricing" : "Review draft"

                                return (
                                    <article className="field-card p-4" key={draft.id} data-testid="drafts-card">
                                        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                                            <div className="min-w-0 space-y-3">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h2
                                                        className="min-w-0 flex-[1_1_12rem] break-words text-lg font-semibold leading-tight [overflow-wrap:anywhere]"
                                                        data-testid="drafts-card-title"
                                                    >
                                                        {getDraftDisplayName(draft)}
                                                    </h2>
                                                    <span className="rounded-full border border-white/10 bg-slate-950/65 px-2.5 py-1 font-mono text-xs text-slate-300">
                                                        {draft.estimateNumber}
                                                    </span>
                                                    {priceTBDCount > 0 ? (
                                                        <Badge variant="outline" className="border-amber-400/30 bg-amber-500/10 text-amber-200">
                                                            <AlertCircle className="mr-1 h-3 w-3" />
                                                            {priceTBDCount} TBD
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="border-emerald-400/30 bg-emerald-500/10 text-emerald-200">
                                                            Priced
                                                        </Badge>
                                                    )}
                                                    {draft.synced === false ? (
                                                        <Badge variant="outline" className="border-sky-400/30 bg-sky-500/10 text-sky-200">
                                                            Local changes
                                                        </Badge>
                                                    ) : null}
                                                </div>

                                                <Button
                                                    type="button"
                                                    className="h-10 rounded-lg sm:hidden"
                                                    onClick={() => handleEditDraft(draft)}
                                                    data-testid="drafts-mobile-edit-button"
                                                >
                                                    <Edit3 className="mr-2 h-4 w-4" />
                                                    {primaryActionLabel}
                                                </Button>

                                                <p className="line-clamp-2 text-sm leading-6 text-slate-400">
                                                    {draft.summary_note || "No summary captured yet."}
                                                </p>

                                                <div className="grid gap-2 sm:grid-cols-3">
                                                    <div className="field-mini">
                                                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Job</p>
                                                        <p className="mt-1 truncate text-sm font-semibold">{draft.clientAddress || "Address needed"}</p>
                                                    </div>
                                                    <div className="field-mini">
                                                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Line items</p>
                                                        <p className="mt-1 text-sm font-semibold">{items.length} item{items.length === 1 ? "" : "s"}</p>
                                                    </div>
                                                    <div className="field-mini">
                                                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Updated</p>
                                                        <p className="mt-1 text-sm font-semibold">{formatDate(draft.updatedAt || draft.createdAt)}</p>
                                                    </div>
                                                </div>

                                                {previewItems.length > 0 ? (
                                                    <div className="space-y-2">
                                                        {previewItems.map((item) => (
                                                            <div
                                                                className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2"
                                                                key={item.id}
                                                            >
                                                                <p className="min-w-0 truncate text-sm text-slate-200">{item.description}</p>
                                                                <p className={cn("shrink-0 text-sm font-semibold", item.unit_price === 0 ? "text-amber-200" : "text-white")}>
                                                                    {item.unit_price === 0 ? "TBD" : formatAmount(lineTotal(item))}
                                                                </p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </div>

                                            <div className="grid gap-2 lg:w-48">
                                                <div className="rounded-lg border border-white/10 bg-slate-950/60 p-3 lg:text-right">
                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Draft total</p>
                                                    <p className="mt-1 text-2xl font-semibold">{formatAmount(draft.totalAmount)}</p>
                                                    <p className="mt-1 text-xs text-slate-500">Created {formatDate(draft.createdAt)}</p>
                                                </div>
                                                <Button
                                                    type="button"
                                                    className="hidden h-11 rounded-lg sm:inline-flex"
                                                    onClick={() => handleEditDraft(draft)}
                                                    data-testid="drafts-edit-button"
                                                >
                                                    <Edit3 className="mr-2 h-4 w-4" />
                                                    {primaryActionLabel}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="h-11 rounded-lg border-white/10 bg-slate-950/60 text-slate-100 hover:bg-slate-900"
                                                    onClick={() => void handleMarkSent(draft)}
                                                    disabled={sendingDraftId === draft.id}
                                                    data-testid="drafts-mark-sent-button"
                                                >
                                                    {sendingDraftId === draft.id ? (
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Send className="mr-2 h-4 w-4" />
                                                    )}
                                                    Mark sent
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    className="h-11 rounded-lg text-rose-200 hover:bg-rose-500/10 hover:text-rose-100"
                                                    onClick={() => setDraftToDelete(draft)}
                                                    data-testid="drafts-delete-button"
                                                >
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    Delete
                                                </Button>
                                            </div>
                                        </div>
                                    </article>
                                )
                            })}
                        </div>
                    )}
                </section>
                </div>
            </div>

            <ConfirmDialog
                open={Boolean(draftToDelete)}
                onClose={() => setDraftToDelete(null)}
                onConfirm={() => {
                    if (draftToDelete) void handleDeleteDraft(draftToDelete)
                }}
                title="Delete draft?"
                description={
                    draftToDelete
                        ? `${getDraftDisplayName(draftToDelete)} will be removed from this device.`
                        : "This draft will be removed from this device."
                }
                confirmLabel="Delete draft"
            />
        </div>
    )
}
