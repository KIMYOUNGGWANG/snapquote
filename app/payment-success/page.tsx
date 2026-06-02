import Link from "next/link"
import { ArrowRight, CheckCircle2, Clock3, FileText, History, ReceiptText, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PaymentSuccessStatusCard } from "@/components/payment-success-status-card"

type PaymentSuccessPageProps = {
    searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function getSearchParam(params: Record<string, string | string[] | undefined>, key: string) {
    const value = params[key]
    return typeof value === "string" ? value.trim() : ""
}

export default async function PaymentSuccessPage({ searchParams }: PaymentSuccessPageProps) {
    const params = await searchParams
    const estimateNumber = params
        ? getSearchParam(params, "estimateNumber")
        : ""
    const estimateId = params
        ? getSearchParam(params, "estimateId")
        : ""
    const sessionId = params
        ? getSearchParam(params, "session_id")
        : ""
    const shortSessionId = sessionId ? sessionId.slice(-12) : ""
    const historyParams = new URLSearchParams({ payment: "success" })
    if (estimateId) historyParams.set("estimateId", estimateId)
    if (estimateNumber) historyParams.set("estimateNumber", estimateNumber)
    const hasEstimateReference = Boolean(estimateId || estimateNumber)
    const paymentNeedsVerification = hasEstimateReference && !sessionId
    if (paymentNeedsVerification) historyParams.set("paymentStatus", "missing_session")
    const historyHref = `/history?${historyParams.toString()}`
    const historyActionLabel = paymentNeedsVerification
        ? "Check History"
        : hasEstimateReference ? "View paid estimate" : "Open History"
    const localHistoryHandoffText = hasEstimateReference
        ? "Local History is updated when this return URL matches the saved estimate."
        : "Open History to check the latest Stripe sync status for this payment."
    const referenceItems = [
        estimateNumber ? { key: "estimate", label: "Estimate", value: estimateNumber } : null,
        shortSessionId ? { key: "stripe-session", label: "Stripe session", value: shortSessionId } : null,
    ].filter((item): item is { key: string; label: string; value: string } => Boolean(item))

    return (
        <div className="payment-success-console field-app min-h-screen px-4 pb-28 pt-5 text-white">
            <section className="mx-auto max-w-5xl overflow-hidden rounded-lg border border-white/10 bg-slate-950/35 shadow-[0_28px_80px_-56px_rgba(0,0,0,0.95)]" data-testid="payment-success-workbench">
                <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
                    <div className="border-b border-emerald-400/20 bg-emerald-500/10 p-5 lg:border-b-0 lg:border-r lg:p-6" data-testid="payment-success-command-center">
                        <div className="mb-4 inline-flex rounded-lg border border-emerald-300/40 bg-emerald-200/15 p-2.5">
                            <CheckCircle2 className="h-7 w-7 text-emerald-300" />
                        </div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100/70">Stripe checkout</p>
                        <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">Payment received</h1>
                        <p className="mt-2 max-w-xl text-sm leading-6 text-emerald-100/90">
                            Your customer completed checkout successfully. SnapQuote is now matching the payment back to local History and the paid estimate lane.
                        </p>

                        {referenceItems.length > 0 ? (
                            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="payment-success-reference-grid">
                                {referenceItems.map((item) => (
                                    <p
                                        key={item.key}
                                        className="min-w-0 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-300"
                                        data-testid={`payment-success-reference-${item.key}`}
                                    >
                                        {item.label}
                                        <span className="block line-clamp-3 break-words pt-1 font-mono leading-4 text-white [overflow-wrap:anywhere]">{item.value}</span>
                                    </p>
                                ))}
                            </div>
                        ) : (
                            <div className="mt-5 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-xs leading-5 text-slate-300" data-testid="payment-success-reference-grid">
                                No estimate reference was included in this return URL.
                            </div>
                        )}
                    </div>

                    <div className="hidden p-5 lg:block" data-testid="payment-success-next-steps">
                        <div className="rounded-lg border border-white/10 bg-slate-950/55 p-4">
                            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                                <Clock3 className="h-4 w-4 text-blue-300" />
                                What happens next
                            </div>
                            <div className="grid gap-3 text-xs leading-5 text-slate-400">
                                <div className="flex gap-2">
                                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                                    <p>Local History updates immediately when the estimate exists on this device.</p>
                                </div>
                                <div className="flex gap-2">
                                    <ReceiptText className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
                                    <p>Stripe webhook sync catches the cloud record if checkout finished on a customer device.</p>
                                </div>
                                <div className="flex gap-2">
                                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                                    <p>Open History to confirm the paid lane, or start the next estimate from a clean slate.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)] lg:p-5">
                    <div>
                        <PaymentSuccessStatusCard
                            estimateId={estimateId}
                            estimateNumber={estimateNumber}
                            sessionId={sessionId}
                        />
                    </div>

                    <div className="space-y-3" data-testid="payment-success-actions-panel">
                        <div className="hidden rounded-lg border border-blue-400/20 bg-blue-500/10 p-3 sm:block">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-100/70">Next action</p>
                            <p className="mt-2 text-sm leading-5 text-blue-50">
                                Confirm the estimate in History, then keep quoting while payment context is fresh.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                            <Button asChild className="h-11 rounded-lg text-sm font-semibold">
                                <Link href={historyHref} data-testid="payment-success-history-link">
                                    <History className="h-4 w-4" />
                                    {historyActionLabel}
                                </Link>
                            </Button>
                            <Button asChild variant="outline" className="h-11 rounded-lg border-white/10 bg-slate-950 text-sm font-semibold text-slate-100 hover:bg-slate-900">
                                <Link href="/new-estimate" data-testid="payment-success-new-estimate-link">
                                    <FileText className="h-4 w-4" />
                                    Create new estimate
                                </Link>
                            </Button>
                        </div>
                    </div>

                    <div className="rounded-lg border border-white/10 bg-slate-950/55 p-3 lg:col-start-1" data-testid="payment-success-handoff-card">
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-100">
                            <ShieldCheck className="h-4 w-4 text-blue-300" />
                            Payment handoff
                        </div>
                        <div className="grid gap-2 text-xs leading-5 text-slate-400">
                            <div className="flex gap-2">
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                                <p>{localHistoryHandoffText}</p>
                            </div>
                            <div className="flex gap-2">
                                <ReceiptText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                                <p>Stripe webhook sync still catches up cloud History if payment happened on another device.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    )
}
