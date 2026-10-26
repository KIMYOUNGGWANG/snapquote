import Link from "next/link"
import { Fragment } from "react"
import { AlertCircle, FileText, MapPin, Phone } from "lucide-react"
import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"
import { getCustomerPortalQuote, type CustomerQuoteSnapshot } from "@/lib/server/customer-portal"
import { CustomerQuoteActions } from "@/components/customer-portal/customer-quote-actions"
import { CustomerQuoteStatusBadge } from "@/components/customer-portal/customer-quote-status-badge"
import { CustomerQuoteNextStep } from "@/components/customer-portal/customer-quote-next-step"
import { CustomerJobCompletion } from "@/components/customer-portal/customer-job-completion"
import { formatPortalCurrency as formatCurrency, getCustomerPortalPaymentActionState } from "@/lib/customer-portal-payment"

export const dynamic = "force-dynamic"

type CustomerQuotePageProps = {
    params: Promise<{ token: string }>
}

type CustomerQuoteLineItem = CustomerQuoteSnapshot["items"][number]

type CustomerQuoteLineGroup = {
    id: string
    name?: string
    divisionCode?: string
    addedOnSite?: boolean
    items: CustomerQuoteLineItem[]
}

function getLineTotal(item: CustomerQuoteLineItem): number {
    return typeof item.total === "number" ? item.total : item.quantity * item.unit_price
}

function getQuoteLineGroups(estimate: CustomerQuoteSnapshot): CustomerQuoteLineGroup[] {
    if (estimate.sections?.length) {
        // Flat items mirror section lines; a line whose id is in no section (e.g. a flat quote
        // that later got an "Added on site" section) would otherwise vanish from the quote.
        const sectionItemIds = new Set(estimate.sections.flatMap((section) => section.items.map((item) => item.id)))
        const ungrouped = estimate.items.filter((item) => item.id && !sectionItemIds.has(item.id))
        return [
            { id: "items", items: ungrouped },
            ...estimate.sections.map((section, index) => ({
                id: section.id || `section-${index}`,
                name: section.name,
                divisionCode: section.divisionCode,
                addedOnSite: section.addedOnSite,
                items: section.items,
            })),
        ].filter((section) => section.items.length > 0)
    }

    return [{
        id: "items",
        items: estimate.items,
    }]
}

function sumLines(groups: CustomerQuoteLineGroup[]): number {
    return groups.flatMap((group) => group.items).reduce((sum, item) => sum + getLineTotal(item), 0)
}

function EmptyQuoteState({ message }: { message: string }) {
    return (
        <main className="field-app flex min-h-screen items-center justify-center px-4 py-10 text-white">
            <section className="field-panel w-full max-w-md p-5 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-amber-300/20 bg-amber-400/10 text-amber-100">
                    <AlertCircle className="h-6 w-6" />
                </div>
                <h1 className="mt-4 text-2xl font-semibold">Quote unavailable</h1>
                <p className="mt-2 text-sm leading-6 text-slate-400">{message}</p>
                <Link
                    href="/"
                    className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg border border-white/10 bg-slate-950/70 px-4 text-sm font-semibold text-slate-200 hover:bg-slate-900 hover:text-white"
                >
                    Open SnapQuote
                </Link>
            </section>
        </main>
    )
}

export default async function CustomerQuotePage({ params }: CustomerQuotePageProps) {
    const { token } = await params
    const supabase = createServiceSupabaseClient()
    if (!supabase) {
        return <EmptyQuoteState message="The customer quote portal is not configured yet." />
    }

    const result = await getCustomerPortalQuote(supabase, token, { markViewed: true })
    if (!result.ok) {
        return <EmptyQuoteState message={result.error} />
    }

    const quote = result.data
    const estimate = quote.estimate
    const currency = estimate.currency || "USD"
    const completion = estimate.completion
    const allLineGroups = getQuoteLineGroups(estimate)
    // With a completion report, "Added on site" lines are listed in the report above; the quote
    // body shows them as one summary row so they are not listed twice and the totals still add up.
    const quoteLineGroups = completion ? allLineGroups.filter((group) => !group.addedOnSite) : allLineGroups
    const addedOnSiteFiltered = quoteLineGroups.length !== allLineGroups.length
    const addedOnSiteTotal = sumLines(allLineGroups) - sumLines(quoteLineGroups)
    const subtotal = sumLines(allLineGroups)
    const taxAmount = estimate.taxAmount || 0
    const totalAmount = estimate.totalAmount || subtotal + taxAmount
    const paymentComplete = estimate.paymentStatus === "paid" || Boolean(estimate.paymentCompletedAt)
    // The completion report owns the page's h1.
    const QuoteTitle = completion ? "h2" : "h1"
    const hasCompletionBalance = Boolean(completion && completion.balanceDue > 0)
    const paymentAction = getCustomerPortalPaymentActionState(
        quote.status,
        Boolean(estimate.paymentLink?.trim()),
        estimate.paymentLinkType,
        paymentComplete,
        hasCompletionBalance,
    )

    return (
        <main className="field-app min-h-screen px-4 py-5 text-white sm:py-8" data-testid="customer-quote-page">
            <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
                <div className="grid min-w-0 gap-4">
                    {completion ? (
                        <CustomerJobCompletion
                            estimate={estimate}
                            completion={completion}
                            businessName={quote.business.businessName}
                            paymentComplete={paymentComplete}
                            payLink={paymentAction.showPayLink ? estimate.paymentLink : undefined}
                            payLabel={paymentAction.buttonLabel}
                        />
                    ) : null}
                    <section className="field-panel overflow-hidden" data-testid="customer-quote-document">
                        <div className="border-b border-white/10 p-4 sm:p-6">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white text-sm font-black text-slate-950">
                                            SQ
                                        </span>
                                        <p className="text-sm font-semibold text-slate-300">{quote.business.businessName}</p>
                                    </div>
                                    <QuoteTitle className="mt-4 text-3xl font-semibold leading-tight sm:text-4xl" data-testid="customer-quote-title">
                                        Estimate {estimate.estimateNumber}
                                    </QuoteTitle>
                                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                                        Review the scope, totals, and terms. Your response goes back to the contractor.
                                    </p>
                                </div>
                                <CustomerQuoteStatusBadge initialStatus={quote.status} paymentComplete={paymentComplete} />
                            </div>
                        </div>

                        <div className="grid gap-3 border-b border-white/10 p-4 sm:grid-cols-2 sm:p-6">
                            <div className="rounded-lg border border-white/10 bg-slate-950/55 p-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Customer</p>
                                <p className="mt-2 text-base font-semibold text-white" data-testid="customer-quote-client">
                                    {estimate.clientName || "Customer"}
                                </p>
                                {estimate.clientAddress ? (
                                    <p className="mt-1 flex gap-2 text-sm leading-6 text-slate-400">
                                        <MapPin className="mt-1 h-4 w-4 shrink-0 text-blue-200" />
                                        <span>{estimate.clientAddress}</span>
                                    </p>
                                ) : null}
                            </div>
                            <div className="rounded-lg border border-white/10 bg-slate-950/55 p-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Contractor</p>
                                <p className="mt-2 text-base font-semibold text-white">{quote.business.businessName}</p>
                                {quote.business.phone ? (
                                    <p className="mt-1 flex gap-2 text-sm leading-6 text-slate-400">
                                        <Phone className="mt-1 h-4 w-4 shrink-0 text-blue-200" />
                                        <span>{quote.business.phone}</span>
                                    </p>
                                ) : quote.business.email ? (
                                    <p className="mt-1 text-sm leading-6 text-slate-400">{quote.business.email}</p>
                                ) : null}
                            </div>
                        </div>

                        {estimate.summaryNote ? (
                            <div className="border-b border-white/10 p-4 sm:p-6">
                                <div className="rounded-lg border border-blue-300/20 bg-blue-500/10 p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-200/80">Scope summary</p>
                                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-blue-50">{estimate.summaryNote}</p>
                                </div>
                            </div>
                        ) : null}

                        <div className="p-4 sm:p-6">
                            <div className="mb-3 flex items-center gap-2">
                                <FileText className="h-5 w-5 text-blue-200" />
                                <h2 className="text-lg font-semibold">Line items</h2>
                            </div>

                            <div className="overflow-hidden rounded-lg border border-white/10">
                                <div className="grid grid-cols-[1fr_5rem_6rem] gap-2 border-b border-white/10 bg-slate-950/80 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                                    <span>Description</span>
                                    <span className="text-right">Qty</span>
                                    <span className="text-right">Total</span>
                                </div>
                                {quoteLineGroups.map((group, groupIndex) => (
                                    <Fragment key={group.id}>
                                        {group.name ? (
                                            <div
                                                className="border-b border-white/10 bg-slate-900/70 px-3 py-2"
                                                data-testid="customer-quote-section-heading"
                                            >
                                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-100">
                                                    {group.divisionCode ? `${group.divisionCode} / ` : ""}{group.name}
                                                </p>
                                            </div>
                                        ) : null}
                                        {group.items.map((item, itemIndex) => {
                                            const total = getLineTotal(item)
                                            const isLastItem = groupIndex === quoteLineGroups.length - 1
                                                && itemIndex === group.items.length - 1
                                            return (
                                                <div
                                                    key={`${item.id || item.description}-${groupIndex}-${itemIndex}`}
                                                    className={`grid grid-cols-[1fr_5rem_6rem] gap-2 px-3 py-3 text-sm ${isLastItem ? "" : "border-b border-white/10"}`}
                                                    data-testid="customer-quote-line-item"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="break-words font-medium text-white">{item.description}</p>
                                                        <p className="mt-1 text-xs text-slate-500">
                                                            {item.category || "Item"} {item.unit ? ` / ${item.unit}` : ""}
                                                        </p>
                                                    </div>
                                                    <p className="text-right text-slate-300">{item.quantity}</p>
                                                    <p className="text-right font-semibold text-white">{formatCurrency(total, currency)}</p>
                                                </div>
                                            )
                                        })}
                                    </Fragment>
                                ))}
                            </div>

                            <div className="ml-auto mt-4 w-full max-w-sm space-y-2 rounded-lg border border-white/10 bg-slate-950/60 p-3">
                                {addedOnSiteFiltered ? (
                                    <div className="flex justify-between text-sm text-amber-200/90">
                                        <span>Added on site (see above)</span>
                                        <span data-testid="customer-quote-added-on-site-total">{formatCurrency(addedOnSiteTotal, currency)}</span>
                                    </div>
                                ) : null}
                                <div className="flex justify-between text-sm text-slate-400">
                                    <span>Subtotal</span>
                                    <span data-testid="customer-quote-subtotal">{formatCurrency(subtotal, currency)}</span>
                                </div>
                                <div className="flex justify-between text-sm text-slate-400">
                                    <span>Tax ({estimate.taxRate}%)</span>
                                    <span>{formatCurrency(taxAmount, currency)}</span>
                                </div>
                                <div className="flex justify-between border-t border-white/10 pt-2 text-lg font-semibold text-white">
                                    <span>Total</span>
                                    <span data-testid="customer-quote-total">{formatCurrency(totalAmount, currency)}</span>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                <aside className="space-y-4 lg:sticky lg:top-5">
                    <CustomerQuoteActions
                        token={token}
                        initialStatus={quote.status}
                        paymentLink={estimate.paymentLink}
                        paymentLinkType={estimate.paymentLinkType}
                        paymentComplete={paymentComplete}
                        hasCompletionBalance={hasCompletionBalance}
                        jobComplete={Boolean(completion)}
                    />

                    <CustomerQuoteNextStep
                        initialStatus={quote.status}
                        paymentComplete={paymentComplete}
                        paymentTerms={estimate.paymentTerms}
                        closingNote={estimate.closingNote}
                        // The completion report already says what happens next.
                        hideStatus={Boolean(completion)}
                    />
                </aside>
            </div>
        </main>
    )
}
