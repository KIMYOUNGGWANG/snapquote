import Link from "next/link"
import { AlertTriangle, ArrowLeft, CreditCard, FileText, Scale, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"

const termsSections = [
    {
        icon: Scale,
        title: "1. Introduction",
        body: "By using SnapQuote, you agree to these Terms of Service and any policies referenced here.",
    },
    {
        icon: FileText,
        title: "2. Use of Service",
        body: "SnapQuote helps tradespeople generate, manage, and send estimates. You are responsible for reviewing all job details, pricing, taxes, and customer-facing language before sending.",
    },
    {
        icon: CreditCard,
        title: "3. Payments",
        body: "Paid features and customer payment links may be processed through Stripe or other payment providers. SnapQuote does not store full card details.",
    },
    {
        icon: AlertTriangle,
        title: "4. AI Disclaimer",
        body: "AI output may contain mistakes. You must verify generated estimates, line items, scope notes, and totals before relying on them or sending them to a customer.",
    },
    {
        icon: ShieldCheck,
        title: "5. Termination and Contact",
        body: "We may suspend access when necessary to protect the service. If you have questions about these terms, contact SnapQuote support.",
    },
]

export default function TermsPage() {
    return (
        <div className="mx-auto max-w-3xl px-4 pb-28 pt-6">
            <Button asChild variant="ghost" className="mb-6 rounded-lg pl-0 text-slate-300 hover:bg-transparent hover:text-white">
                <Link href="/profile">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Profile
                </Link>
            </Button>

            <section className="field-panel overflow-hidden">
                <div className="border-b border-white/10 bg-slate-950/60 p-5">
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-blue-400/25 bg-blue-500/10 text-blue-200">
                        <Scale className="h-5 w-5" />
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">SnapQuote legal</p>
                    <h1 className="mt-2 text-3xl font-bold leading-[1.3] tracking-tight text-white" data-testid="legal-page-title">Terms of Service</h1>
                    <p className="mt-3 text-sm text-slate-400">Last updated: May 23, 2026</p>
                </div>

                <div className="divide-y divide-white/10">
                    {termsSections.map((section) => {
                        const Icon = section.icon
                        return (
                            <section key={section.title} className="flex gap-4 p-5">
                                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-slate-950 text-slate-300">
                                    <Icon className="h-4 w-4" />
                                </span>
                                <div>
                                    <h2 className="text-base font-semibold text-white">{section.title}</h2>
                                    <p className="mt-2 text-sm leading-6 text-slate-400">{section.body}</p>
                                </div>
                            </section>
                        )
                    })}
                </div>
            </section>
        </div>
    )
}
