"use client"

import { useRef, useState, type MouseEvent } from "react"
import { Check, CheckCircle2, CreditCard, ImageOff, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import type { CustomerQuoteSnapshot } from "@/lib/server/customer-portal"
import { formatPortalCurrency } from "@/lib/customer-portal-payment"

type CustomerQuoteLineItem = CustomerQuoteSnapshot["items"][number]

type CustomerJobCompletionProps = {
    estimate: CustomerQuoteSnapshot
    completion: NonNullable<CustomerQuoteSnapshot["completion"]>
    businessName: string
    paymentComplete: boolean
    payLink?: string
    payLabel: string
}

type OpenPhoto = { photoIndex: number; label: string; title: string }

function getLineTotal(item: CustomerQuoteLineItem): number {
    return typeof item.total === "number" ? item.total : item.quantity * item.unit_price
}

function PhotoThumb({ src, label, onOpen }: { src: string; label: string; onOpen: (event: MouseEvent<HTMLButtonElement>) => void }) {
    // "" = the server could not sign this photo.
    if (!src) {
        return (
            <span
                className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-white/15 text-[10px] leading-none text-slate-500"
                data-testid="customer-completion-photo-unavailable"
                role="img"
                aria-label={`${label} could not load`}
            >
                <ImageOff className="h-4 w-4" aria-hidden="true" />
                Can&apos;t load
            </span>
        )
    }

    return (
        <button
            type="button"
            onClick={onOpen}
            className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-white/10 bg-slate-900 transition-[border-color,transform] hover:border-white/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 active:scale-[0.97]"
            data-testid="customer-completion-photo"
        >
            {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL or legacy data URL */}
            <img src={src} alt={label} width={56} height={56} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        </button>
    )
}

export function CustomerJobCompletion({
    estimate,
    completion,
    businessName,
    paymentComplete,
    payLink,
    payLabel,
}: CustomerJobCompletionProps) {
    const [openPhoto, setOpenPhoto] = useState<OpenPhoto | null>(null)
    const returnFocusRef = useRef<HTMLButtonElement | null>(null)
    const currency = estimate.currency || "USD"
    const money = (amount: number) => formatPortalCurrency(amount, currency)

    const sections = estimate.sections ?? []
    const extraItems = sections.filter((section) => section.addedOnSite).flatMap((section) => section.items)
    const extraIds = new Set(extraItems.map((item) => item.id).filter(Boolean))
    const itemsById = new Map(
        [...estimate.items, ...sections.flatMap((section) => section.items)]
            .filter((item) => item.id)
            .map((item) => [item.id, item]),
    )
    const rows = completion.items.flatMap((entry) => {
        const item = itemsById.get(entry.itemId)
        return item && !extraIds.has(entry.itemId) ? [{ ...entry, description: item.description }] : []
    })
    const doneCount = rows.filter((row) => row.done).length
    const shownPhotos = new Set(rows.flatMap((row) => row.photoIndexes))
    const otherPhotos = completion.photos.map((_, index) => index).filter((index) => !shownPhotos.has(index))
    const extraTotal = extraItems.reduce((sum, item) => sum + getLineTotal(item), 0)
    const taxed = estimate.taxRate > 0

    const open = (photoIndex: number, label: string, title: string) => (event: MouseEvent<HTMLButtonElement>) => {
        returnFocusRef.current = event.currentTarget
        setOpenPhoto({ photoIndex, label, title })
    }

    return (
        <section className="field-panel overflow-hidden" data-testid="customer-job-completion">
            <div className="border-b border-white/10 p-4 sm:p-6">
                <p className="text-sm font-semibold text-slate-300">
                    {businessName} <span className="text-slate-500">· Job {estimate.estimateNumber}</span>
                </p>
                <div className="mt-4 flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-300/25 bg-emerald-400/10 text-emerald-200">
                        <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">Your job is done</h1>
                </div>

                <div
                    className={`mt-5 flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-end sm:justify-between ${paymentComplete
                        ? "border-emerald-300/25 bg-emerald-500/10"
                        : "border-white/10 bg-slate-950/60"}`}
                >
                    {paymentComplete ? (
                        <div className="min-w-0">
                            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
                                <Check className="h-4 w-4" aria-hidden="true" />
                                <span data-testid="customer-completion-paid">Paid in full</span>
                            </p>
                            <p className="mt-1 text-3xl font-semibold tabular-nums text-white sm:text-4xl" data-testid="customer-completion-received">
                                {money(estimate.totalAmount)} paid
                            </p>
                            <p className="mt-2 text-sm leading-6 text-emerald-100/80">Thank you. {businessName} has your payment.</p>
                        </div>
                    ) : (
                        <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Balance due</p>
                            <p className="mt-1 text-4xl font-semibold tabular-nums text-white" data-testid="customer-completion-balance">
                                {money(completion.balanceDue)}
                            </p>
                            <p className="mt-2 text-sm leading-6 text-slate-400" data-testid="customer-completion-received">
                                {completion.amountPaid > 0
                                    ? `${money(completion.amountPaid)} paid so far of ${money(estimate.totalAmount)}`
                                    : `Nothing paid yet of ${money(estimate.totalAmount)}`}
                            </p>
                        </div>
                    )}
                    {payLink ? (
                        <Button asChild className="h-12 w-full shrink-0 rounded-lg bg-emerald-600 px-6 text-base text-white shadow-[0_18px_32px_-20px_rgba(16,185,129,0.75)] hover:bg-emerald-500 sm:w-auto" data-testid="customer-completion-pay-link">
                            <a href={payLink} target="_blank" rel="noreferrer">
                                <CreditCard className="mr-2 h-4 w-4" aria-hidden="true" />
                                {payLabel}
                            </a>
                        </Button>
                    ) : !paymentComplete && completion.balanceDue > 0 ? (
                        <p className="text-sm leading-6 text-slate-400 sm:max-w-[14rem] sm:text-right">
                            {businessName} will tell you how to pay the balance.
                        </p>
                    ) : null}
                </div>
            </div>

            {completion.summary ? (
                <div className="border-b border-white/10 p-4 sm:p-6">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Work summary</p>
                    <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-slate-200" data-testid="customer-completion-summary">
                        {completion.summary}
                    </p>
                </div>
            ) : null}

            {rows.length > 0 ? (
                <div className="border-b border-white/10 p-4 sm:p-6">
                    <div className="flex items-baseline justify-between gap-3">
                        <h2 className="text-lg font-semibold">What was done</h2>
                        <p className="text-sm text-slate-400" data-testid="customer-completion-done-count">
                            {doneCount} of {rows.length} done
                        </p>
                    </div>
                    <ul className="mt-2 divide-y divide-white/10">
                        {rows.map((row) => (
                            <li
                                key={row.itemId}
                                className="flex items-start gap-3 py-3"
                                data-testid="customer-completion-item"
                                data-done={row.done ? "true" : "false"}
                            >
                                {row.done ? (
                                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
                                        <Check className="h-4 w-4" aria-hidden="true" />
                                        <span className="sr-only">Done:</span>
                                    </span>
                                ) : (
                                    <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full border border-dashed border-slate-500" aria-hidden="true" />
                                )}
                                <div className="min-w-0 flex-1 pt-0.5">
                                    <p className="break-words text-sm font-medium leading-6 text-white">{row.description}</p>
                                    {!row.done ? <p className="text-xs leading-5 text-slate-500">Not confirmed yet</p> : null}
                                </div>
                                <div className="flex w-[7.5rem] shrink-0 flex-wrap justify-end gap-2">
                                    {row.photoIndexes.length > 0 ? row.photoIndexes.map((photoIndex, position) => {
                                        const label = `${row.description}, photo ${position + 1}`
                                        return (
                                            <PhotoThumb
                                                key={photoIndex}
                                                src={completion.photos[photoIndex]}
                                                label={label}
                                                onOpen={open(photoIndex, label, row.description)}
                                            />
                                        )
                                    }) : (
                                        <span
                                            className="flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-white/15 text-[10px] leading-none text-slate-500"
                                            data-testid="customer-completion-no-photo"
                                        >
                                            <ImageOff className="h-4 w-4" aria-hidden="true" />
                                            No photo
                                        </span>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            {otherPhotos.length > 0 ? (
                <div className="border-b border-white/10 p-4 sm:p-6" data-testid="customer-completion-more-photos">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {rows.length > 0 ? "More photos" : "Photos"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {otherPhotos.map((photoIndex, position) => {
                            const label = `Job photo ${position + 1}`
                            return <PhotoThumb key={photoIndex} src={completion.photos[photoIndex]} label={label} onOpen={open(photoIndex, label, "Job photos")} />
                        })}
                    </div>
                </div>
            ) : null}

            {extraItems.length > 0 ? (
                <div className="p-4 sm:p-6">
                    <div className="rounded-lg border border-amber-300/30 bg-amber-400/10 p-4" data-testid="customer-completion-extra">
                        <div className="flex items-start gap-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-300/30 bg-amber-400/15 text-amber-200">
                                <Plus className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <div className="min-w-0">
                                <h2 className="text-base font-semibold text-amber-50">Added on site</h2>
                                <p className="mt-0.5 text-sm leading-6 text-amber-100/70">
                                    Extra work agreed during the job{taxed ? ", taxed like the rest of the quote" : ""}.
                                </p>
                            </div>
                        </div>
                        <ul className="mt-3 divide-y divide-amber-200/15 border-t border-amber-200/15">
                            {extraItems.map((item, index) => (
                                <li key={item.id || index} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                                    <span className="min-w-0 break-words leading-6 text-amber-50">{item.description}</span>
                                    <span className="shrink-0 font-semibold leading-6 tabular-nums text-amber-50">
                                        {money(getLineTotal(item))}{taxed ? <span className="font-normal text-amber-100/70"> + tax</span> : null}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        {extraItems.length > 1 ? (
                            <p className="flex justify-between border-t border-amber-200/15 pt-2.5 text-sm font-semibold text-amber-50">
                                <span>Total added</span>
                                <span className="tabular-nums">{money(extraTotal)}{taxed ? " + tax" : ""}</span>
                            </p>
                        ) : null}
                    </div>
                </div>
            ) : null}

            <Dialog open={openPhoto !== null} onOpenChange={(next) => { if (!next) setOpenPhoto(null) }}>
                <DialogContent
                    className="w-[calc(100%-2rem)] max-w-3xl gap-3 p-3 pt-16 sm:p-4 sm:pt-16"
                    aria-describedby={undefined}
                    onCloseAutoFocus={(event) => {
                        // No DialogTrigger here, so return focus to the thumbnail that opened the photo.
                        event.preventDefault()
                        returnFocusRef.current?.focus()
                    }}
                >
                    {openPhoto ? (
                        <>
                            <DialogTitle className="absolute left-4 top-6 max-w-[calc(100%-5.5rem)] truncate text-base">
                                {openPhoto.title}
                            </DialogTitle>
                            {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL or legacy data URL */}
                            <img
                                src={completion.photos[openPhoto.photoIndex]}
                                alt={openPhoto.label}
                                className="max-h-[75vh] w-full rounded-md bg-slate-950 object-contain"
                            />
                        </>
                    ) : null}
                </DialogContent>
            </Dialog>
        </section>
    )
}
