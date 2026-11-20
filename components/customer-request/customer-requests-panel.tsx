"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Camera, FilePlus2, Images, Loader2, Mail, MapPin, Phone, RefreshCw, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { toast } from "@/components/toast"
import { withAuthHeaders } from "@/lib/auth-headers"
import {
    buildRequestEstimateNotes,
    formatRequestPrice,
    type CustomerRequestDetail,
    type CustomerRequestSummary,
} from "@/lib/customer-requests"
import { generateEstimateNumber, getProfile, saveEstimate, type LocalEstimate } from "@/lib/estimates-storage"
import { cn } from "@/lib/utils"

type Filter = "new" | "all"

const URGENCY_CLASS: Record<string, string> = {
    low: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100",
    medium: "border-amber-300/25 bg-amber-400/10 text-amber-100",
    high: "border-red-300/30 bg-red-500/10 text-red-100",
}

async function readError(response: Response, fallback: string): Promise<string> {
    const data = (await response.json().catch(() => ({}))) as { error?: { message?: unknown } }
    return typeof data.error?.message === "string" ? data.error.message : fallback
}

function formatReceivedAt(iso: string): string {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ""
    return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

/** Customer photo requests from /r/{slug}. Hidden until the contractor has at least one. */
export function CustomerRequestsPanel() {
    const router = useRouter()
    const [requests, setRequests] = useState<CustomerRequestSummary[] | null>(null)
    const [loadError, setLoadError] = useState("")
    const [filter, setFilter] = useState<Filter>("new")
    const [busyId, setBusyId] = useState("")

    const load = useCallback(async () => {
        setLoadError("")
        try {
            const response = await fetch("/api/customer-requests", { headers: await withAuthHeaders() })
            if (!response.ok) throw new Error(await readError(response, "Could not load customer requests."))
            const data = (await response.json()) as { requests?: CustomerRequestSummary[] }
            const list = Array.isArray(data.requests) ? data.requests : []
            setRequests(list)
            if (!list.some((request) => request.status === "new")) setFilter("all")
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : "Could not load customer requests.")
        }
    }, [])

    useEffect(() => {
        void load()
    }, [load])

    const patchStatus = async (requestId: string, body: Record<string, string>) => {
        const response = await fetch(`/api/customer-requests/${encodeURIComponent(requestId)}`, {
            method: "PATCH",
            headers: await withAuthHeaders({ "content-type": "application/json" }),
            body: JSON.stringify(body),
        })
        if (!response.ok) throw new Error(await readError(response, "Could not update the request."))
    }

    const startEstimate = async (summary: CustomerRequestSummary) => {
        setBusyId(summary.id)
        try {
            const response = await fetch(`/api/customer-requests/${encodeURIComponent(summary.id)}`, { headers: await withAuthHeaders() })
            if (!response.ok) throw new Error(await readError(response, "Could not open the request."))
            const { request } = (await response.json()) as { request: CustomerRequestDetail }

            const notes = buildRequestEstimateNotes(request)
            const nowIso = new Date().toISOString()
            // Same shape as a field-capture draft, so /new-estimate resumes it with photos and notes loaded.
            const draft: LocalEstimate = {
                id: crypto.randomUUID(),
                estimateNumber: generateEstimateNumber(),
                type: "estimate",
                items: [],
                summary_note: notes,
                clientName: request.customerName,
                clientEmail: request.customerEmail,
                clientPhone: request.customerPhone,
                clientAddress: request.areaLabel || "",
                taxRate: getProfile()?.tax_rate ?? 13,
                taxAmount: 0,
                totalAmount: 0,
                createdAt: nowIso,
                status: "draft",
                attachments: { photos: request.photos, originalTranscript: notes },
                updatedAt: nowIso,
                synced: false,
            }
            await saveEstimate(draft)
            await patchStatus(summary.id, { status: "drafted", estimateId: draft.id }).catch((error) => {
                // The draft is already saved locally; a stale "new" badge is the only cost.
                console.warn("Failed to mark customer request as drafted:", error)
            })
            router.push(`/new-estimate?draftId=${encodeURIComponent(draft.id)}`)
        } catch (error) {
            toast(error instanceof Error ? error.message : "Could not start the estimate.", "error")
            setBusyId("")
        }
    }

    const dismiss = async (summary: CustomerRequestSummary) => {
        setBusyId(summary.id)
        try {
            await patchStatus(summary.id, { status: "dismissed" })
            setRequests((current) => current?.map((request) => (request.id === summary.id ? { ...request, status: "dismissed" } : request)) ?? null)
        } catch (error) {
            toast(error instanceof Error ? error.message : "Could not dismiss the request.", "error")
        } finally {
            setBusyId("")
        }
    }

    if (loadError) {
        return (
            <Card className="field-card" id="customer-requests" data-testid="customer-requests-panel">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-slate-300">
                    <span>{loadError}</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => void load()} className="rounded-lg border-white/10 bg-slate-900/70 text-white">
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Retry
                    </Button>
                </CardContent>
            </Card>
        )
    }
    if (!requests || requests.length === 0) return null

    const newCount = requests.filter((request) => request.status === "new").length
    const visible = filter === "new" ? requests.filter((request) => request.status === "new") : requests

    return (
        <Card className="field-card scroll-mt-24" id="customer-requests" data-testid="customer-requests-panel">
            <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                            <Camera className="h-5 w-5" />
                            Customer requests
                        </h2>
                        {newCount > 0 ? <Badge className="bg-blue-500 text-white hover:bg-blue-500" data-testid="customer-requests-new-count">{newCount} new</Badge> : null}
                    </div>
                    <div className="flex gap-1.5" role="group" aria-label="Filter customer requests">
                        {(["new", "all"] as const).map((option) => (
                            <button
                                key={option}
                                type="button"
                                aria-pressed={filter === option}
                                onClick={() => setFilter(option)}
                                className={cn(
                                    "min-h-9 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300",
                                    filter === option ? "border-white/40 bg-white text-slate-950" : "border-white/10 bg-slate-950/60 text-slate-300 hover:text-white",
                                )}
                            >
                                {option === "new" ? `New (${newCount})` : `All (${requests.length})`}
                            </button>
                        ))}
                    </div>
                </div>

                {visible.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-white/10 p-4 text-center text-sm text-slate-400">No new requests. Switch to All to see past ones.</p>
                ) : (
                    <ul className="grid gap-2">
                        {visible.map((request) => {
                            const { diagnosis } = request
                            const busy = busyId === request.id
                            return (
                                <li key={request.id} className="rounded-lg border border-white/10 bg-slate-950/55 p-3" data-testid="customer-request-item">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 font-semibold text-white">
                                                {request.customerName}
                                                {request.status === "new" ? <Badge className="bg-blue-500 text-white hover:bg-blue-500">New</Badge> : null}
                                                {request.status === "drafted" ? <Badge variant="secondary">Drafted</Badge> : null}
                                                {request.status === "dismissed" ? <Badge variant="outline" className="border-white/15 text-slate-400">Dismissed</Badge> : null}
                                            </div>
                                            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                                                <span>{formatReceivedAt(request.createdAt)}</span>
                                                {diagnosis.space ? <span className="capitalize">{diagnosis.space}</span> : null}
                                                {request.areaLabel ? <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{request.areaLabel}</span> : null}
                                                <span className="flex items-center gap-1"><Images className="h-3 w-3" />{request.photoCount}</span>
                                            </p>
                                        </div>
                                        <span className={cn("rounded-lg border px-2 py-0.5 text-xs font-semibold capitalize", URGENCY_CLASS[diagnosis.urgency])}>{diagnosis.urgency} urgency</span>
                                    </div>
                                    <p className="mt-2 text-sm leading-6 text-slate-200">{diagnosis.cause}</p>
                                    {diagnosis.priceRange ? <p className="text-sm font-semibold tabular-nums text-white">AI range {formatRequestPrice(diagnosis.priceRange)}</p> : null}
                                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                                        {request.customerPhone ? <a href={`tel:${request.customerPhone}`} className="flex items-center gap-1 text-blue-200 hover:text-white"><Phone className="h-3.5 w-3.5" />{request.customerPhone}</a> : null}
                                        {request.customerEmail ? <a href={`mailto:${request.customerEmail}`} className="flex items-center gap-1 text-blue-200 hover:text-white"><Mail className="h-3.5 w-3.5" />{request.customerEmail}</a> : null}
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {request.status === "drafted" && request.estimateId ? (
                                            <Button type="button" size="sm" className="rounded-lg" onClick={() => router.push(`/new-estimate?draftId=${encodeURIComponent(request.estimateId || "")}`)}>
                                                <FilePlus2 className="mr-2 h-4 w-4" />
                                                Open draft
                                            </Button>
                                        ) : (
                                            <Button type="button" size="sm" className="rounded-lg" disabled={busy} onClick={() => void startEstimate(request)} data-testid="customer-request-start">
                                                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FilePlus2 className="mr-2 h-4 w-4" />}
                                                Start estimate
                                            </Button>
                                        )}
                                        {request.status === "new" ? (
                                            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void dismiss(request)} className="rounded-lg border-white/10 bg-slate-900/70 text-slate-200">
                                                <X className="mr-2 h-4 w-4" />
                                                Dismiss
                                            </Button>
                                        ) : null}
                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </CardContent>
        </Card>
    )
}
