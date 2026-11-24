import type { Metadata } from "next"
import Link from "next/link"
import { AlertCircle } from "lucide-react"
import { CustomerRequestFlow } from "@/components/customer-request/customer-request-flow"
import { publicSlugSchema } from "@/lib/customer-requests"
import { loadPublicContractor } from "@/lib/server/customer-requests"
import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"

export const dynamic = "force-dynamic"
// Contractor links are shared by hand (truck, card, text); they should not show up in search.
export const metadata: Metadata = { title: "Get a quote", robots: { index: false, follow: false } }

type RequestPageProps = { params: Promise<{ slug: string }> }

function UnavailableLink() {
    return (
        <main className="field-app flex min-h-screen items-center justify-center px-4 py-10 text-white">
            <section className="field-panel w-full max-w-md p-5 text-center" data-testid="request-link-unavailable">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-amber-300/20 bg-amber-400/10 text-amber-100">
                    <AlertCircle className="h-6 w-6" />
                </div>
                <h1 className="mt-4 text-2xl font-semibold">Link not found</h1>
                <p className="mt-2 text-sm leading-6 text-slate-400">Check the link with your contractor. It may have changed.</p>
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

export default async function CustomerRequestPage({ params }: RequestPageProps) {
    const slug = publicSlugSchema.safeParse((await params).slug)
    if (!slug.success) return <UnavailableLink />

    const supabase = createServiceSupabaseClient()
    const contractor = supabase ? await loadPublicContractor(supabase, slug.data) : null
    if (!contractor) return <UnavailableLink />

    const initials = contractor.businessName
        .split(/\s+/)
        .map((word) => word[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()

    return (
        <main className="field-app min-h-screen px-4 py-5 text-white sm:py-10" data-testid="customer-request-page">
            <div className="mx-auto grid max-w-xl gap-4">
                <header className="flex items-center gap-3">
                    {contractor.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- contractor logo is a data URL or arbitrary host
                        <img src={contractor.logoUrl} alt="" className="h-12 w-12 rounded-lg border border-white/10 bg-white object-contain" />
                    ) : (
                        <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-white/10 bg-white text-base font-black text-slate-950">
                            {initials}
                        </span>
                    )}
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-300" data-testid="request-business-name">{contractor.businessName}</p>
                        <h1 className="text-2xl font-semibold leading-tight sm:text-3xl">Send a photo, get a first read</h1>
                    </div>
                </header>
                <p className="text-sm leading-6 text-slate-400">
                    See the likely cause and what it may cost before anyone visits. Then send it to {contractor.businessName} for a quote.
                </p>
                <CustomerRequestFlow slug={slug.data} businessName={contractor.businessName} />
                <p className="pb-4 text-center text-xs text-slate-500">Powered by SnapQuote</p>
            </div>
        </main>
    )
}
