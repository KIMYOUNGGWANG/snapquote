import Link from "next/link"
import { CheckCircle2, FileText, History, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"

type PaymentSuccessPageProps = {
    searchParams?: {
        session_id?: string
        estimateNumber?: string
    }
}

export default function PaymentSuccessPage({ searchParams }: PaymentSuccessPageProps) {
    const estimateNumber = typeof searchParams?.estimateNumber === "string"
        ? searchParams.estimateNumber.trim()
        : ""
    const sessionId = typeof searchParams?.session_id === "string"
        ? searchParams.session_id.trim()
        : ""
    const shortSessionId = sessionId ? sessionId.slice(-12) : ""

    return (
        <div className="relative min-h-screen overflow-hidden px-4 pb-28 pt-12">
            <div className="pointer-events-none absolute -left-28 top-12 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -right-20 bottom-16 h-64 w-64 rounded-full bg-emerald-400/20 blur-3xl" />

            <div className="mx-auto w-full max-w-md space-y-5">
                <div className="glass-card border-emerald-400/30 bg-emerald-400/10 p-6">
                    <div className="mb-4 inline-flex rounded-full border border-emerald-300/40 bg-emerald-200/20 p-3">
                        <CheckCircle2 className="h-8 w-8 text-emerald-300" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-white">Payment received</h1>
                    <p className="mt-2 text-sm text-emerald-100/90">
                        Your customer completed checkout successfully.
                    </p>

                    {estimateNumber ? (
                        <p className="mt-3 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-gray-300">
                            Estimate: <span className="font-mono text-white">{estimateNumber}</span>
                        </p>
                    ) : null}
                    {shortSessionId ? (
                        <p className="mt-2 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-gray-400">
                            Session: <span className="font-mono">{shortSessionId}</span>
                        </p>
                    ) : null}
                </div>

                <div className="glass-card p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-100">
                        <ShieldCheck className="h-4 w-4 text-blue-300" />
                        What happens next
                    </div>
                    <p className="text-sm text-gray-300">
                        Stripe webhook sync may take a moment. If status is not updated yet, reconcile job will backfill it.
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-2">
                    <Button asChild className="h-11 rounded-xl text-sm font-semibold">
                        <Link href="/history">
                            <History className="h-4 w-4" />
                            View estimate history
                        </Link>
                    </Button>
                    <Button asChild variant="outline" className="h-11 rounded-xl text-sm font-semibold">
                        <Link href="/new-estimate">
                            <FileText className="h-4 w-4" />
                            Create new estimate
                        </Link>
                    </Button>
                </div>
            </div>
        </div>
    )
}
