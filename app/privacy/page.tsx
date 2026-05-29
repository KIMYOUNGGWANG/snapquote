import Link from "next/link"
import { ArrowLeft, Database, Lock, RefreshCw, ShieldCheck, Users } from "lucide-react"

import { Button } from "@/components/ui/button"

const privacySections = [
    {
        icon: Database,
        title: "1. Information We Collect",
        body: "We collect information you provide directly, including account details, business profile data, estimate content, transaction metadata, and support messages.",
    },
    {
        icon: RefreshCw,
        title: "2. How We Use Information",
        body: "We use this information to operate SnapQuote, generate estimates, sync local and cloud data, deliver PDFs, process payments, and improve field quoting workflows.",
    },
    {
        icon: Users,
        title: "3. Data Sharing",
        body: "We do not sell personal information. We share data only with service providers needed to run SnapQuote, such as Supabase, Stripe, email delivery, or as required by law.",
    },
    {
        icon: Lock,
        title: "4. Data Security",
        body: "We use reasonable technical and organizational measures to protect information from unauthorized access, misuse, loss, or disclosure.",
    },
    {
        icon: ShieldCheck,
        title: "5. Changes to this Policy",
        body: "We may update this policy from time to time. Material changes will be reflected by revising the date shown on this page.",
    },
]

export default function PrivacyPage() {
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
                        <ShieldCheck className="h-5 w-5" />
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">SnapQuote legal</p>
                    <h1 className="mt-2 text-3xl font-bold leading-[1.3] tracking-tight text-white" data-testid="legal-page-title">Privacy Policy</h1>
                    <p className="mt-3 text-sm text-slate-400">Last updated: May 23, 2026</p>
                </div>

                <div className="divide-y divide-white/10">
                    {privacySections.map((section) => {
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
