"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import dynamic from "next/dynamic"
import NextLink from "next/link"
import {
    AlertTriangle,
    ArrowLeft,
    Camera,
    Check,
    CheckCircle2,
    Copy,
    ImagePlus,
    Loader2,
    Mail,
    MessageSquare,
    Plus,
    Sparkles,
    Trash2,
    WifiOff,
    X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/toast"
import { computeBalanceDue } from "@/lib/estimates/balance"
import type { JobCompletionItem, LocalEstimate } from "@/lib/estimates-storage"
import { compressImageToDataUrl } from "@/lib/image-compress"
import {
    applyExtraWork,
    buildCompletionMessage,
    buildReviewItems,
    getQuoteItemsForCompletion,
    type ExtraWorkLine,
} from "@/lib/job-completion"
import { finalizeJobCompletion, requestCompletionMatches, sendCompletionEmail } from "@/lib/job-completion-client"
import { sendEstimateSms } from "@/lib/send-sms"
import { cn } from "@/lib/utils"

const SmsModal = dynamic(() => import("@/components/sms-modal").then((mod) => mod.SmsModal), { ssr: false })
const EmailModal = dynamic(() => import("@/components/email-modal").then((mod) => mod.EmailModal), { ssr: false })

const MAX_PHOTOS = 6
const MAX_RECEIVED = 1_000_000

type Phase = "capture" | "matching" | "limit" | "review" | "ready"
type ExtraWorkRow = { key: string; description: string; amount: string }
type SelectedPhoto = { itemId: string | null; photoIndex: number }
type ReadyState = { portalUrl: string; balanceDue: number; estimate: LocalEstimate }

interface JobCompletionSheetProps {
    estimate: LocalEstimate
    businessName?: string
    onClose: () => void
    onChanged: () => void | Promise<void>
}

const moneyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

function formatMoney(value: number): string {
    return moneyFormatter.format(value)
}

function getErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback
}

function useOnlineStatus(): boolean {
    const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine)
    useEffect(() => {
        const update = () => setOnline(navigator.onLine)
        window.addEventListener("online", update)
        window.addEventListener("offline", update)
        return () => {
            window.removeEventListener("online", update)
            window.removeEventListener("offline", update)
        }
    }, [])
    return online
}

function parseAmount(value: string): number {
    const trimmed = value.trim()
    return trimmed ? Number(trimmed) : 0
}

function getInitialReady(estimate: LocalEstimate): ReadyState | null {
    if (!estimate.completion || !estimate.customerPortalUrl) return null
    return {
        portalUrl: estimate.customerPortalUrl,
        balanceDue: computeBalanceDue(estimate.totalAmount, estimate.amountPaid ?? 0),
        estimate,
    }
}

const fieldClassName = "rounded-lg border-white/10 bg-slate-950/70 text-white placeholder:text-slate-500"
const outlineButtonClassName = "border-white/10 bg-slate-950/60 text-slate-200 hover:bg-slate-900 hover:text-white"

function Notice({ tone, icon, title, children, testId }: {
    tone: "amber" | "blue" | "red"
    icon: React.ReactNode
    title: string
    children?: React.ReactNode
    testId?: string
}) {
    const toneClassName = tone === "amber"
        ? "border-amber-300/20 bg-amber-400/10 text-amber-100"
        : tone === "red"
            ? "border-red-300/25 bg-red-500/10 text-red-100"
            : "border-blue-300/20 bg-blue-500/10 text-blue-100"
    return (
        <div role={tone === "blue" ? "status" : "alert"} className={cn("flex gap-2 rounded-lg border p-3", toneClassName)} data-testid={testId}>
            <span className="mt-0.5 shrink-0">{icon}</span>
            <div className="min-w-0">
                <p className="break-words text-sm font-semibold [overflow-wrap:anywhere]">{title}</p>
                {children ? <div className="mt-1 break-words text-xs leading-5 opacity-80 [overflow-wrap:anywhere]">{children}</div> : null}
            </div>
        </div>
    )
}

export function JobCompletionSheet({ estimate, businessName, onClose, onChanged }: JobCompletionSheetProps) {
    const online = useOnlineStatus()
    const quoteItems = useMemo(() => getQuoteItemsForCompletion(estimate), [estimate])
    const initialReady = useMemo(() => getInitialReady(estimate), [estimate])

    const [phase, setPhase] = useState<Phase>(initialReady ? "ready" : "capture")
    const [photos, setPhotos] = useState<string[]>([])
    const [skippedFiles, setSkippedFiles] = useState<string[]>([])
    const [droppedForLimit, setDroppedForLimit] = useState(0)
    const [compressing, setCompressing] = useState(false)
    const [note, setNote] = useState("")
    const [aiFailed, setAiFailed] = useState(false)
    const [limitMessage, setLimitMessage] = useState("")
    const [reviewItems, setReviewItems] = useState<JobCompletionItem[]>([])
    const [summary, setSummary] = useState("")
    // A send that failed after saving keeps its extra work on the estimate: start from it.
    const [extraWork, setExtraWork] = useState<ExtraWorkRow[]>(() => (estimate.sections ?? [])
        .filter((section) => section.addedOnSite)
        .flatMap((section) => section.items)
        .map((item) => ({ key: item.id, description: item.description, amount: String(item.total) })))
    const [alreadyReceived, setAlreadyReceived] = useState(() => String(estimate.amountPaid ?? 0))
    const [selectedPhoto, setSelectedPhoto] = useState<SelectedPhoto | null>(null)
    const [sending, setSending] = useState(false)
    const [sendError, setSendError] = useState("")
    const [ready, setReady] = useState<ReadyState | null>(initialReady)
    const [channel, setChannel] = useState<"sms" | "email" | null>(null)
    const fileInputRef = useRef<HTMLInputElement | null>(null)

    const isResend = Boolean(initialReady)
    const busy = sending || compressing || phase === "matching"

    const requestClose = useCallback(() => {
        if (!busy) onClose()
    }, [busy, onClose])

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !channel) requestClose()
        }
        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [channel, requestClose])

    // ---- Derived money values -------------------------------------------------
    const extraWorkLines: ExtraWorkLine[] = extraWork
        .filter((row) => row.description.trim() || row.amount.trim())
        .map((row) => ({ description: row.description, amount: parseAmount(row.amount) }))
    const extraWorkInvalid = extraWorkLines.some((line) => !line.description.trim() || !Number.isFinite(line.amount) || line.amount <= 0)
    const projected = applyExtraWork(estimate, extraWorkInvalid ? [] : extraWorkLines)
    const baseTotal = useMemo(() => applyExtraWork(estimate, []).totalAmount, [estimate])
    const receivedValue = parseAmount(alreadyReceived)
    const receivedInvalid = !Number.isFinite(receivedValue) || receivedValue < 0 || receivedValue > MAX_RECEIVED
    const balanceDue = receivedInvalid ? projected.totalAmount : computeBalanceDue(projected.totalAmount, receivedValue)
    const extraSubtotal = extraWorkInvalid ? 0 : extraWorkLines.reduce((sum, line) => sum + line.amount, 0)
    const doneCount = reviewItems.filter((item) => item.done).length
    const unmatchedPhotoIndexes = photos
        .map((_, index) => index)
        .filter((index) => !reviewItems.some((item) => item.photoIndexes.includes(index)))
    const canSend = online && !sending && !extraWorkInvalid && !receivedInvalid

    // ---- Capture ----------------------------------------------------------------
    const handleFiles = async (fileList: FileList | null) => {
        const files = Array.from(fileList ?? [])
        if (fileInputRef.current) fileInputRef.current.value = ""
        if (files.length === 0) return

        const slots = Math.max(0, MAX_PHOTOS - photos.length)
        setDroppedForLimit(Math.max(0, files.length - slots))
        setCompressing(true)
        const added: string[] = []
        const skipped: string[] = []
        for (const file of files.slice(0, slots)) {
            try {
                added.push(await compressImageToDataUrl(file))
            } catch {
                skipped.push(file.name || "Unnamed photo")
            }
        }
        setPhotos((current) => [...current, ...added].slice(0, MAX_PHOTOS))
        setSkippedFiles(skipped)
        setCompressing(false)
    }

    const startMatching = async () => {
        if (photos.length === 0) return
        setPhase("matching")
        setSelectedPhoto(null)
        const outcome = await requestCompletionMatches({
            items: quoteItems.map((item) => ({ itemId: item.id, description: item.description })),
            photos,
            note,
        })
        const itemIds = quoteItems.map((item) => item.id)

        if (outcome.kind === "limit") {
            setLimitMessage(outcome.message)
            setPhase("limit")
            return
        }
        if (outcome.kind === "failed") {
            setAiFailed(true)
            setSummary("")
            setReviewItems(buildReviewItems(itemIds, []))
        } else {
            setAiFailed(false)
            setSummary(outcome.summary)
            setReviewItems(buildReviewItems(itemIds, outcome.items))
        }
        setPhase("review")
    }

    // ---- Review edits -----------------------------------------------------------
    const toggleItem = (itemId: string) => {
        setReviewItems((items) => items.map((item) => item.itemId === itemId ? { ...item, done: !item.done } : item))
    }

    const movePhoto = (selection: SelectedPhoto, targetItemId: string | null) => {
        setReviewItems((items) => items.map((item) => {
            let indexes = item.photoIndexes
            if (item.itemId === selection.itemId) indexes = indexes.filter((index) => index !== selection.photoIndex)
            if (item.itemId === targetItemId && !indexes.includes(selection.photoIndex)) {
                indexes = [...indexes, selection.photoIndex].sort((a, b) => a - b)
            }
            return indexes === item.photoIndexes ? item : { ...item, photoIndexes: indexes }
        }))
        setSelectedPhoto(null)
    }

    const updateExtraRow = (key: string, patch: Partial<ExtraWorkRow>) => {
        setExtraWork((rows) => rows.map((row) => row.key === key ? { ...row, ...patch } : row))
    }

    // ---- Send -------------------------------------------------------------------
    const openChannelFor = (target: LocalEstimate) => {
        if (target.clientPhone?.trim()) setChannel("sms")
        else if (target.clientEmail?.trim()) setChannel("email")
    }

    const handleSend = async () => {
        if (!canSend) return
        setSending(true)
        setSendError("")
        try {
            const result = await finalizeJobCompletion(estimate, {
                completion: {
                    completedAt: new Date().toISOString(),
                    summary: summary.trim(),
                    photos,
                    items: reviewItems,
                },
                extraWork: extraWorkLines,
                alreadyReceived: receivedValue,
            })
            setReady(result)
            setPhase("ready")
            await onChanged()
            openChannelFor(result.estimate)
        } catch (error) {
            setSendError(getErrorMessage(error, "Couldn't send the report. Try again."))
        } finally {
            setSending(false)
        }
    }

    const readyMessage = ready ? buildCompletionMessage(ready.portalUrl, ready.balanceDue) : ""

    const handleSendSms = async (toPhoneNumber: string, message: string) => {
        if (!ready) return
        await sendEstimateSms({ estimateId: ready.estimate.id, toPhoneNumber, message })
        toast("Completion report texted.", "success")
        await onChanged()
    }

    const handleSendEmail = async (email: string, message: string) => {
        if (!ready) return
        const result = await sendCompletionEmail({
            estimateNumber: ready.estimate.estimateNumber,
            email,
            message,
            clientName: ready.estimate.clientName,
            businessName,
        })
        toast(result === "mailto" ? "Email app opened. Send it from there." : "Completion report emailed.", "success")
        await onChanged()
    }

    const handleCopyLink = async () => {
        if (!ready) return
        try {
            await navigator.clipboard.writeText(ready.portalUrl)
            toast("Report link copied.", "success")
        } catch {
            toast("Couldn't copy the link. Select it and copy manually.", "error")
        }
    }

    if (typeof document === "undefined") return null

    // ---- Render -----------------------------------------------------------------
    const headerLabel = `${estimate.estimateNumber} · ${estimate.status === "paid" ? "Deposit paid" : "Approved"}`
    const headerTitle = phase === "capture"
        ? "Mark job complete"
        : phase === "matching"
            ? "Matching photos"
            : phase === "limit"
                ? "Monthly limit reached"
                : phase === "review"
                    ? "Review before sending"
                    : isResend ? "Resend completion report" : "Report ready"
    const sendLabel = balanceDue > 0 ? `Send & request ${formatMoney(balanceDue)}` : "Send report"

    const offlineNotice = !online ? (
        <Notice tone="amber" icon={<WifiOff className="h-4 w-4" />} title="You're offline" testId="completion-offline">
            {phase === "capture"
                ? "AI matching is skipped offline. You can still review every line, but sending needs a connection."
                : "Sending needs a connection. Your review stays here until you're back online."}
        </Notice>
    ) : null

    const photoThumb = (photoIndex: number, itemId: string | null) => {
        const isSelected = selectedPhoto?.photoIndex === photoIndex && selectedPhoto.itemId === itemId
        return (
            <button
                key={`${itemId ?? "unmatched"}-${photoIndex}`}
                type="button"
                onClick={() => setSelectedPhoto(isSelected ? null : { itemId, photoIndex })}
                className={cn(
                    "relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border transition-[transform,border-color] duration-200 active:translate-y-px",
                    isSelected ? "border-primary ring-2 ring-primary/60" : "border-white/15 hover:border-white/35"
                )}
                aria-label={`Photo ${photoIndex + 1}${isSelected ? ", selected" : ""}. Tap to move or remove.`}
                aria-pressed={isSelected}
                data-testid="completion-photo-thumb"
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photos[photoIndex]} alt="" className="h-full w-full object-cover" />
            </button>
        )
    }

    const photoActions = (itemId: string | null) => {
        if (!selectedPhoto || selectedPhoto.itemId !== itemId) return null
        const selection = selectedPhoto
        return (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-slate-950/70 p-2 animate-in fade-in slide-in-from-top-1 duration-200" data-testid="completion-photo-actions">
                <label className="sr-only" htmlFor={`move-photo-${itemId ?? "unmatched"}`}>Move photo to</label>
                <select
                    id={`move-photo-${itemId ?? "unmatched"}`}
                    className="h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950 px-3 text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value=""
                    onChange={(event) => {
                        if (event.target.value) movePhoto(selection, event.target.value)
                    }}
                    data-testid="completion-photo-move"
                >
                    <option value="">{itemId ? "Move to…" : "Attach to…"}</option>
                    {quoteItems.filter((item) => item.id !== itemId).map((item) => (
                        <option key={item.id} value={item.id}>{item.description}</option>
                    ))}
                </select>
                {itemId ? (
                    <Button type="button" variant="outline" size="sm" className={outlineButtonClassName} onClick={() => movePhoto(selection, null)} data-testid="completion-photo-remove">
                        <X className="h-4 w-4" />
                        Remove
                    </Button>
                ) : null}
            </div>
        )
    }

    const body = (() => {
        if (phase === "capture") {
            return (
                <div className="space-y-4">
                    <div className="rounded-lg border border-white/10 bg-slate-950/55 p-3">
                        <p className="break-words text-sm font-semibold text-white [overflow-wrap:anywhere]">{estimate.clientName || "Customer"}</p>
                        <p className="mt-1 text-xs text-slate-400">
                            Total {formatMoney(baseTotal)}
                            {estimate.amountPaid ? ` · ${formatMoney(estimate.amountPaid)} received` : ""}
                            {` · ${quoteItems.length} quote line${quoteItems.length === 1 ? "" : "s"}`}
                        </p>
                    </div>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="sr-only"
                        onChange={(event) => void handleFiles(event.target.files)}
                        data-testid="completion-photo-input"
                        aria-label="Add finished work photos"
                    />

                    {photos.length === 0 ? (
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={compressing}
                            className="flex min-h-[176px] w-full flex-col items-center justify-center gap-2 rounded-[20px] border border-dashed border-white/25 bg-slate-950/40 p-6 text-center transition-[border-color,background-color,transform] duration-200 hover:border-primary/60 hover:bg-slate-950/60 active:translate-y-px disabled:opacity-60"
                            data-testid="completion-photo-dropzone"
                        >
                            {compressing ? <Loader2 className="h-7 w-7 animate-spin text-primary" /> : <Camera className="h-7 w-7 text-primary" />}
                            <span className="text-base font-semibold text-white">{compressing ? "Preparing photos…" : "Snap finished work"}</span>
                            <span className="text-xs text-slate-400">Up to {MAX_PHOTOS} photos. AI matches them to your quote lines.</span>
                        </button>
                    ) : (
                        <div>
                            <div className="mb-2 flex items-center justify-between">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Photos</p>
                                <p className="text-xs text-slate-400" data-testid="completion-photo-count">{photos.length} of {MAX_PHOTOS}</p>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                {photos.map((photo, index) => (
                                    <div key={index} className="relative aspect-square overflow-hidden rounded-lg border border-white/10 animate-in fade-in zoom-in-95 duration-200">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={photo} alt={`Finished work ${index + 1}`} className="h-full w-full object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => setPhotos((current) => current.filter((_, i) => i !== index))}
                                            className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center"
                                            aria-label={`Delete photo ${index + 1}`}
                                        >
                                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white">
                                                <X className="h-4 w-4" />
                                            </span>
                                        </button>
                                    </div>
                                ))}
                                {photos.length < MAX_PHOTOS ? (
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={compressing}
                                        className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/25 bg-slate-950/40 text-xs text-slate-300 transition-colors duration-200 hover:border-primary/60 disabled:opacity-60"
                                        aria-label="Add more photos"
                                    >
                                        {compressing ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <ImagePlus className="h-5 w-5 text-primary" />}
                                        {compressing ? "Preparing" : "Add"}
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    )}

                    {skippedFiles.length > 0 ? (
                        <Notice tone="amber" icon={<AlertTriangle className="h-4 w-4" />} title="Some photos couldn't be opened" testId="completion-skipped-files">
                            <p>Skipped: {skippedFiles.join(", ")}. Save them as JPEG (or take a new photo) and add again.</p>
                        </Notice>
                    ) : null}
                    {droppedForLimit > 0 ? (
                        <Notice tone="blue" icon={<ImagePlus className="h-4 w-4" />} title={`Only ${MAX_PHOTOS} photos fit in a report`}>
                            {droppedForLimit} extra photo{droppedForLimit === 1 ? " was" : "s were"} left out.
                        </Notice>
                    ) : null}

                    <div className="space-y-2">
                        <Label htmlFor="completion-note" className="text-slate-300">What did you do? <span className="text-slate-500">(optional)</span></Label>
                        <Textarea
                            id="completion-note"
                            rows={3}
                            maxLength={2000}
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            placeholder="e.g. Swapped both shut-off valves, leak tested for 10 minutes."
                            className={cn(fieldClassName, "min-h-[88px] resize-none")}
                        />
                    </div>
                    {offlineNotice}
                </div>
            )
        }

        if (phase === "matching") {
            return (
                <div className="space-y-4" aria-busy="true" data-testid="completion-matching">
                    <div className="flex items-center gap-3 rounded-lg border border-primary/25 bg-primary/10 p-3 text-sm text-amber-100" role="status">
                        <Sparkles className="h-4 w-4 shrink-0 animate-pulse text-primary" />
                        Matching {photos.length} photo{photos.length === 1 ? "" : "s"} to {quoteItems.length} quote line{quoteItems.length === 1 ? "" : "s"}…
                    </div>
                    <div className="space-y-2">
                        {quoteItems.slice(0, 5).map((item) => (
                            <div key={item.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-slate-950/55 p-3">
                                <span className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-white/10" />
                                <span className="min-w-0 flex-1 truncate text-sm text-slate-400">{item.description}</span>
                                <span className="h-11 w-11 shrink-0 animate-pulse rounded-lg bg-white/10" />
                            </div>
                        ))}
                    </div>
                    <div className="h-20 animate-pulse rounded-lg bg-white/5" />
                </div>
            )
        }

        if (phase === "limit") {
            return (
                <div className="space-y-4" data-testid="completion-limit">
                    <div className="rounded-[20px] border border-primary/25 bg-primary/10 p-5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200/80">Free plan</p>
                        <p className="mt-2 text-lg font-semibold text-white">{limitMessage}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-300">
                            Upgrade to send unlimited completion reports with AI photo matching. Your photos stay here if you go back.
                        </p>
                        <Button asChild className="mt-4 h-12 w-full" data-testid="completion-limit-pricing">
                            <NextLink href="/pricing">See plans</NextLink>
                        </Button>
                    </div>
                </div>
            )
        }

        if (phase === "review") {
            return (
                <div className="space-y-5">
                    {aiFailed ? (
                        <Notice tone="amber" icon={<AlertTriangle className="h-4 w-4" />} title="AI matching didn't finish" testId="completion-ai-failed">
                            Every line is marked ?. Tap a line to confirm it&apos;s done, and tap a photo to attach it.
                        </Notice>
                    ) : null}

                    <section>
                        <div className="mb-2 flex items-center justify-between">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Quote lines</p>
                            <p className="text-xs text-slate-400" data-testid="completion-done-count">{doneCount} of {reviewItems.length} done</p>
                        </div>
                        <ul className="divide-y divide-white/10 overflow-hidden rounded-[20px] border border-white/10 bg-slate-950/45">
                            {reviewItems.map((item) => {
                                const description = quoteItems.find((quoteItem) => quoteItem.id === item.itemId)?.description ?? "Quote line"
                                return (
                                    <li key={item.itemId} className="p-2" data-testid="completion-item-row" data-done={item.done ? "true" : "false"}>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => toggleItem(item.itemId)}
                                                className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-1 text-left transition-colors duration-200 hover:bg-white/5"
                                                aria-pressed={item.done}
                                                aria-label={`${description}: ${item.done ? "done" : "not confirmed"}. Tap to toggle.`}
                                                data-testid="completion-item-toggle"
                                            >
                                                <span className={cn(
                                                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition-colors duration-200",
                                                    item.done ? "border-emerald-300/40 bg-emerald-400/15 text-emerald-200" : "border-amber-300/40 bg-amber-400/10 text-amber-200"
                                                )}>
                                                    {item.done ? <Check className="h-4 w-4" /> : "?"}
                                                </span>
                                                <span className="min-w-0 break-words text-sm text-slate-100 [overflow-wrap:anywhere]">{description}</span>
                                            </button>
                                            <div className="flex shrink-0 gap-1.5">
                                                {item.photoIndexes.length > 0
                                                    ? item.photoIndexes.map((photoIndex) => photoThumb(photoIndex, item.itemId))
                                                    : <span className="h-11 w-11 rounded-lg border border-dashed border-amber-300/50" aria-label="No photo" />}
                                            </div>
                                        </div>
                                        {photoActions(item.itemId)}
                                    </li>
                                )
                            })}
                        </ul>
                    </section>

                    {unmatchedPhotoIndexes.length > 0 ? (
                        <section data-testid="completion-unmatched-photos">
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Not on a line yet</p>
                            <div className="flex flex-wrap gap-1.5">
                                {unmatchedPhotoIndexes.map((photoIndex) => photoThumb(photoIndex, null))}
                            </div>
                            {photoActions(null)}
                        </section>
                    ) : null}

                    <div className="space-y-2">
                        <Label htmlFor="completion-summary" className="text-slate-300">Summary for the customer</Label>
                        <Textarea
                            id="completion-summary"
                            rows={3}
                            maxLength={2000}
                            value={summary}
                            onChange={(event) => setSummary(event.target.value)}
                            placeholder="e.g. Replaced the kitchen drain and both shut-off valves. Tested for leaks, no issues."
                            className={cn(fieldClassName, "min-h-[96px] resize-none")}
                            data-testid="completion-summary"
                        />
                    </div>

                    <section className="space-y-2">
                        <div className="flex items-center justify-between">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Added on site</p>
                            {estimate.taxRate ? <p className="text-xs text-slate-500">+ {estimate.taxRate}% tax, like other lines</p> : null}
                        </div>
                        {extraWork.map((row, index) => (
                            <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_2.75rem] gap-2 sm:grid-cols-[minmax(0,1fr)_7.5rem_2.75rem] rounded-lg border border-amber-300/20 bg-amber-400/[0.06] p-2 animate-in fade-in slide-in-from-top-1 duration-200" data-testid="completion-extra-row">
                                <Input
                                    value={row.description}
                                    onChange={(event) => updateExtraRow(row.key, { description: event.target.value })}
                                    placeholder="What was added"
                                    aria-label={`Extra work ${index + 1} name`}
                                    maxLength={300}
                                    className={cn(fieldClassName, "col-span-2 sm:col-span-1")}
                                    data-testid="completion-extra-description"
                                />
                                <div className="relative">
                                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">$</span>
                                    <Input
                                        value={row.amount}
                                        onChange={(event) => updateExtraRow(row.key, { amount: event.target.value })}
                                        type="number"
                                        inputMode="decimal"
                                        min="0.01"
                                        step="0.01"
                                        placeholder="0.00"
                                        aria-label={`Extra work ${index + 1} amount`}
                                        className={cn(fieldClassName, "pl-6")}
                                        data-testid="completion-extra-amount"
                                    />
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="text-slate-400 hover:bg-white/10 hover:text-white"
                                    onClick={() => setExtraWork((rows) => rows.filter((entry) => entry.key !== row.key))}
                                    aria-label={`Remove extra work ${index + 1}`}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                        {extraWorkInvalid ? (
                            <p className="text-xs text-amber-200" role="alert">Give each extra line a name and an amount above $0.00.</p>
                        ) : null}
                        <Button
                            type="button"
                            variant="outline"
                            className={cn(outlineButtonClassName, "w-full border-dashed")}
                            onClick={() => setExtraWork((rows) => [...rows, { key: crypto.randomUUID(), description: "", amount: "" }])}
                            data-testid="completion-add-extra"
                        >
                            <Plus className="h-4 w-4" />
                            Extra work
                        </Button>
                    </section>

                    <section className="space-y-3 rounded-[20px] border border-white/10 bg-slate-950/55 p-4">
                        <div className="space-y-2">
                            <Label htmlFor="completion-received" className="text-slate-300">Already received</Label>
                            <div className="relative">
                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">$</span>
                                <Input
                                    id="completion-received"
                                    type="number"
                                    inputMode="decimal"
                                    min="0"
                                    step="0.01"
                                    value={alreadyReceived}
                                    onChange={(event) => setAlreadyReceived(event.target.value)}
                                    aria-invalid={receivedInvalid}
                                    className={cn(fieldClassName, "pl-6", receivedInvalid && "border-amber-300/50")}
                                    data-testid="completion-already-received"
                                />
                            </div>
                            <p className={cn("text-xs leading-5", receivedInvalid ? "text-amber-200" : "text-slate-500")}>
                                {receivedInvalid ? "Enter an amount between $0 and $1,000,000." : "Card payments are filled in. Add cash or cheque deposits here."}
                            </p>
                        </div>
                        <dl className="space-y-1.5 border-t border-white/10 pt-3 text-sm">
                            <div className="flex justify-between text-slate-400">
                                <dt>Quote total</dt>
                                <dd>{formatMoney(baseTotal)}</dd>
                            </div>
                            {extraSubtotal > 0 ? (
                                <div className="flex justify-between text-amber-200/90">
                                    <dt>Added on site + tax</dt>
                                    <dd>{formatMoney(projected.totalAmount - baseTotal)}</dd>
                                </div>
                            ) : null}
                            <div className="flex justify-between text-slate-400">
                                <dt>Received</dt>
                                <dd>−{formatMoney(receivedInvalid ? 0 : receivedValue)}</dd>
                            </div>
                            <div className="flex justify-between pt-1 text-base font-semibold text-white">
                                <dt>Balance due</dt>
                                <dd data-testid="completion-balance">{formatMoney(balanceDue)}</dd>
                            </div>
                        </dl>
                    </section>

                    {offlineNotice}
                    {sendError ? (
                        <Notice tone="red" icon={<AlertTriangle className="h-4 w-4" />} title="Report not sent" testId="completion-send-error">
                            {sendError}
                        </Notice>
                    ) : null}
                </div>
            )
        }

        // ready
        if (!ready) return null
        const target = ready.estimate
        const hasPhone = Boolean(target.clientPhone?.trim())
        const hasEmail = Boolean(target.clientEmail?.trim())
        return (
            <div className="space-y-4" data-testid="completion-ready">
                <div className="rounded-[20px] border border-emerald-300/20 bg-emerald-400/[0.08] p-4 animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex items-center gap-2 text-emerald-100">
                        <CheckCircle2 className="h-5 w-5 shrink-0" />
                        <p className="text-base font-semibold">{isResend ? "Report link is live" : "Report saved"}</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                        {ready.balanceDue > 0
                            ? `${target.clientName || "The customer"} sees the photos and can pay the ${formatMoney(ready.balanceDue)} balance from this link.`
                            : `${target.clientName || "The customer"} sees the photos and checklist from this link.`}
                    </p>
                </div>

                <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/70 p-2 pl-3">
                    <p className="min-w-0 flex-1 truncate text-sm text-slate-200" data-testid="completion-portal-url">{ready.portalUrl}</p>
                    <Button type="button" variant="outline" size="sm" className={outlineButtonClassName} onClick={() => void handleCopyLink()}>
                        <Copy className="h-4 w-4" />
                        Copy
                    </Button>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Button type="button" className="h-12" onClick={() => setChannel("sms")} disabled={!hasPhone} data-testid="completion-text-button">
                        <MessageSquare className="h-4 w-4" />
                        Text report
                    </Button>
                    <Button type="button" variant="outline" className={cn(outlineButtonClassName, "h-12")} onClick={() => setChannel("email")} disabled={!hasEmail} data-testid="completion-email-button">
                        <Mail className="h-4 w-4" />
                        Email report
                    </Button>
                </div>
                {!hasPhone && !hasEmail ? (
                    <p className="text-xs leading-5 text-slate-400">No phone or email on this quote. Copy the link and send it your way.</p>
                ) : null}
                {offlineNotice}
            </div>
        )
    })()

    const footer = (() => {
        if (phase === "capture") {
            return (
                <Button
                    type="button"
                    className="h-12 w-full"
                    onClick={() => void startMatching()}
                    disabled={photos.length === 0 || compressing}
                    data-testid="completion-match-button"
                >
                    <Sparkles className="h-4 w-4" />
                    {photos.length === 0 ? "Add photos to continue" : online ? `Match ${photos.length} photo${photos.length === 1 ? "" : "s"}` : "Review lines"}
                </Button>
            )
        }
        if (phase === "matching") {
            return (
                <Button type="button" className="h-12 w-full" disabled>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Matching…
                </Button>
            )
        }
        if (phase === "limit") {
            return (
                <Button type="button" variant="outline" className={cn(outlineButtonClassName, "h-12 w-full")} onClick={() => setPhase("capture")}>
                    <ArrowLeft className="h-4 w-4" />
                    Back to photos
                </Button>
            )
        }
        if (phase === "review") {
            return (
                <Button type="button" className="h-12 w-full text-base" onClick={() => void handleSend()} disabled={!canSend} data-testid="completion-send-button">
                    {sending ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Sending report…
                        </>
                    ) : sendLabel}
                </Button>
            )
        }
        return (
            <Button type="button" variant="outline" className={cn(outlineButtonClassName, "h-12 w-full")} onClick={onClose} data-testid="completion-done-button">
                Done
            </Button>
        )
    })()

    return createPortal(
        <div
            className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 sm:items-center sm:p-4"
            onClick={(event) => {
                if (event.target === event.currentTarget) requestClose()
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="job-completion-title"
                className="field-panel flex h-[calc(100dvh-0.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-b-none rounded-t-[22px] animate-in slide-in-from-bottom-6 duration-[240ms] sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-[22px]"
                data-testid="job-completion-sheet"
            >
                <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
                    <div className="flex min-w-0 items-start gap-2">
                        {phase === "review" && !sending ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="-ml-2 shrink-0 text-slate-300 hover:bg-white/10 hover:text-white"
                                onClick={() => setPhase("capture")}
                                aria-label="Back to photos"
                            >
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        ) : null}
                        <div className="min-w-0">
                            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200/80">{headerLabel}</p>
                            <h2 id="job-completion-title" className="mt-1 break-words text-lg font-semibold text-white [overflow-wrap:anywhere]">{headerTitle}</h2>
                        </div>
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-slate-300 hover:bg-white/10 hover:text-white"
                        onClick={requestClose}
                        disabled={busy}
                        aria-label="Close completion report"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4">{body}</div>

                <div className="shrink-0 border-t border-white/10 bg-slate-950/55 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>
            </div>

            {ready && channel === "sms" ? (
                <SmsModal
                    open
                    onClose={() => setChannel(null)}
                    onSend={handleSendSms}
                    clientPhone={ready.estimate.clientPhone}
                    estimateTotal={ready.estimate.totalAmount}
                    paymentLink={ready.estimate.paymentLink || null}
                    businessName={businessName}
                    approvalLink={ready.portalUrl}
                    customerPortalStatus={ready.estimate.customerPortalStatus}
                    approvalLinkStatus="included"
                    initialMessage={readyMessage}
                    title="Text completion report"
                />
            ) : null}
            {ready && channel === "email" ? (
                <EmailModal
                    open
                    onClose={() => setChannel(null)}
                    onSend={handleSendEmail}
                    clientEmail={ready.estimate.clientEmail}
                    estimateTotal={ready.estimate.totalAmount}
                    paymentLink={ready.estimate.paymentLink || null}
                    approvalLinkStatus="included"
                    initialMessage={readyMessage}
                    title="Email completion report"
                    pdfAttached={false}
                    linkHelper="The report link with photos and the balance is already in the message."
                />
            ) : null}
        </div>,
        document.body
    )
}
