"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowRight, Bot, CheckCircle, DollarSign, FileText, Home, MessageCircle, Mic, Moon, PlayCircle, Receipt, WifiOff } from "lucide-react"
import { FreeEstimatorWidget } from "@/components/free-estimator-widget"
import { FREE_PLAN_MARKETING_QUOTE_LIMIT } from "@/lib/free-tier"
import { MARKETING_PLAN_OPTIONS } from "@/lib/marketing-plans"

function AnimatedCounter({ target, suffix = "", prefix = "" }: { target: number, suffix?: string, prefix?: string }) {
    return <div className="leading-[1.3]">{prefix}{target.toLocaleString()}{suffix}</div>
}

function TypewriterText({ texts }: { texts: string[] }) {
    const [currentIndex, setCurrentIndex] = useState(0)

    useEffect(() => {
        const interval = window.setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % texts.length)
        }, 3200)

        return () => window.clearInterval(interval)
    }, [texts.length])

    return (
        <span className="text-blue-400">
            &quot;{texts[currentIndex]}&quot;
        </span>
    )
}

export default function LandingPage() {
    const voiceExamples = [
        "Bano pequeno. Cambiar vanity, reconnect drain, patch wall, 4 hours labor",
        "욕실 타일 50 sqft, new vanity install, haul away debris, 하루 인건비",
        "Cambiar dos luces, add dimmer, test circuit, cleanup included",
        "천장 누수 보수, drywall patch, texture blend, paint touch-up"
    ]

    const appPreviewCards = [
        {
            title: "Owner Dashboard",
            description: "See active quotes, sent jobs, and what still needs a follow-up.",
            accentClassName: "border-amber-400/20 bg-amber-500/10",
            badge: "Today",
            lines: ["4 drafts ready", "2 sent today", "1 follow-up due"],
        },
        {
            title: "On-Site Quote Builder",
            description: "Capture the scope, clean it up, and send before you leave the house.",
            accentClassName: "border-sky-400/20 bg-sky-500/10",
            badge: "Estimate Draft",
            lines: ["Scope", "Materials", "Labor", "Tax + Total"],
        },
        {
            title: "Follow-Up + Payment",
            description: "Keep the quote moving until it becomes an approved job.",
            accentClassName: "border-emerald-400/20 bg-emerald-500/10",
            badge: "Automation",
            lines: ["Sent 48h ago", "Reminder queued", "Deposit link ready"],
        },
    ]

    return (
        <div className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">
            <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0f]/88 backdrop-blur-md border-b border-white/5" data-testid="landing-nav">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
                            SQ
                        </div>
                        <span className="text-lg font-bold">SnapQuote</span>
                    </div>
                    <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
                        <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
                        <a href="#features" className="hover:text-white transition-colors">Features</a>
                        <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
                        <a href="#testimonials" className="hover:text-white transition-colors">Reviews</a>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link href="/login" className="hidden md:block text-sm text-gray-400 hover:text-white transition-colors">
                            Log In
                        </Link>
                        <Link href="/new-estimate" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-500 sm:px-5" data-testid="landing-nav-cta">
                            Try Free
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                </div>
            </nav>

            <section className="relative min-h-[76svh] overflow-hidden px-6 pb-8 pt-24">
                <Image
                    src="/hero-contractor.png"
                    alt="Contractor using SnapQuote at a residential job site"
                    fill
                    className="object-cover object-[65%_center]"
                    priority
                />
                <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,8,14,0.94)_0%,rgba(8,12,18,0.78)_43%,rgba(8,12,18,0.22)_100%)]" />
                <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#0a0a0f] to-transparent" />

                <div className="relative mx-auto flex min-h-[calc(76svh-8rem)] max-w-6xl items-center">
                    <div className="max-w-2xl">
                        <h1 className="mb-4 text-[2.15rem] font-bold leading-[1.28] text-white sm:text-4xl md:text-5xl md:leading-[1.18]" data-testid="landing-hero-title">
                            Speak in Spanish or Korean. Send the quote in English.
                        </h1>

                        <p className="mb-5 max-w-xl text-base text-slate-200 md:text-lg">
                            Say the job naturally on site. SnapQuote turns rough Spanish, Korean, or mixed field notes into a clean English estimate before you drive off.
                        </p>

                        <div className="mb-6 max-w-xl border-l border-blue-300/40 pl-4">
                            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">
                                <Mic className="h-4 w-4" />
                                Multilingual voice input
                            </div>
                            <div className="min-h-10 text-sm text-slate-200">
                                <TypewriterText texts={voiceExamples} />
                            </div>
                            <div className="mt-3 flex items-center gap-2 text-sm font-medium text-emerald-200">
                                <CheckCircle className="h-4 w-4" />
                                English quote draft ready in about 30 seconds
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row">
                            <Link href="/new-estimate" className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-blue-500">
                                <Mic className="h-5 w-5" />
                                Try the Quote Flow
                            </Link>
                            <a href="#how-it-works" className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-black/20 px-7 py-3.5 text-base font-medium text-slate-200 transition-all hover:border-white/25 hover:bg-black/30 hover:text-white">
                                <PlayCircle className="h-5 w-5" />
                                See How It Works
                            </a>
                        </div>

                        <div className="mt-5 flex flex-wrap gap-3 text-xs text-slate-300">
                            <span className="inline-flex items-center gap-1">
                                <CheckCircle className="h-3.5 w-3.5 text-emerald-300" />
                                {FREE_PLAN_MARKETING_QUOTE_LIMIT} free quotes/month
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <CheckCircle className="h-3.5 w-3.5 text-emerald-300" />
                                Review before sending
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <ArrowRight className="h-3.5 w-3.5 text-blue-300" />
                                Built for the truck
                            </span>
                        </div>
                    </div>
                </div>
            </section>

            <section className="py-8 border-y border-white/5 bg-white/[0.02]">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
                        <div>
                            <div className="text-2xl md:text-3xl font-bold text-white">
                                <AnimatedCounter target={30} suffix="sec" />
                            </div>
                            <p className="text-xs text-gray-400 mt-1">Native-language notes to English draft</p>
                        </div>
                        <div>
                            <div className="text-2xl md:text-3xl font-bold text-white">
                                <AnimatedCounter target={10} suffix="hrs" />
                            </div>
                            <p className="text-xs text-gray-400 mt-1">Admin hours reclaimed</p>
                        </div>
                        <div>
                            <div className="text-2xl md:text-3xl font-bold text-white">
                                <AnimatedCounter target={100} suffix="%" />
                            </div>
                            <p className="text-xs text-gray-400 mt-1">Offline-first capture</p>
                        </div>
                        <div>
                            <div className="text-2xl md:text-3xl font-bold text-white">
                                <AnimatedCounter target={2} suffix="min" />
                            </div>
                            <p className="text-xs text-gray-400 mt-1">Draft to sendable quote</p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="py-20 px-6">
                <div className="max-w-4xl mx-auto text-center">
                    <h2 className="text-3xl font-bold leading-[1.28] md:text-4xl md:leading-[1.3] mb-6">
                        The non-English field problem office software ignores.
                    </h2>
                    <div className="grid md:grid-cols-3 gap-6 mt-12">
                        <div className="rounded-lg border border-white/10 bg-white/5 p-6 transition-colors hover:border-red-500/30">
                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-red-500/10 text-red-200">
                                <Moon className="h-6 w-6" />
                            </div>
                            <h3 className="font-semibold text-lg mb-2">Quotes After Dinner</h3>
                            <p className="text-sm text-gray-400">You finished the service call hours ago, but the quote still needs to get written after everyone else is asleep.</p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-white/5 p-6 transition-colors hover:border-red-500/30">
                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10 text-blue-300">
                                <WifiOff className="h-6 w-6" />
                            </div>
                            <h3 className="font-semibold text-lg mb-2">No Signal Below Grade</h3>
                            <p className="text-sm text-gray-400">Basement, crawlspace, rural property, concrete shell. Web-only software dies exactly where field crews do their real work.</p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-white/5 p-6 transition-colors hover:border-red-500/30">
                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-red-500/10 text-red-200">
                                <MessageCircle className="h-6 w-6" />
                            </div>
                            <h3 className="font-semibold text-lg mb-2">You Know the Work. English Slows You Down.</h3>
                            <p className="text-sm text-gray-400">You can explain the job perfectly in Spanish, Korean, or mixed site language. The bottleneck is rewriting it into professional English the customer trusts.</p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="border-y border-white/5 bg-slate-950/35 py-20 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-12">
                        <div className="text-sm text-purple-400 font-medium mb-3 uppercase tracking-wider">Try It Now - No Sign Up</div>
                        <h2 className="text-3xl font-bold leading-[1.28] md:text-4xl md:leading-[1.3] mb-4">
                            Bring the material list in faster.
                            <br />
                            <span className="text-gray-400">See what AI can pull into a quote draft.</span>
                        </h2>
                        <p className="text-gray-400 max-w-xl mx-auto">
                            Snap a photo of a supply-house receipt or material list. SnapQuote extracts line items so you can stop retyping materials and get back to quoting.
                        </p>
                    </div>
                    <FreeEstimatorWidget />
                </div>
            </section>

            <section id="how-it-works" className="py-20 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <div className="text-sm text-blue-400 font-medium mb-3 uppercase tracking-wider">How It Works</div>
                        <h2 className="text-3xl font-bold leading-[1.28] md:text-4xl md:leading-[1.3]">
                            From native-language scope note to English quote.
                            <br />
                            <span className="text-gray-400">Built for the truck, not for back-office typing.</span>
                        </h2>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        <div className="relative">
                            <div className="relative h-full rounded-lg border border-white/10 bg-white/5 p-8 transition-colors hover:border-blue-500/30">
                                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10 text-blue-300">
                                    <Mic className="h-6 w-6" />
                                </div>
                                <div className="text-xs text-blue-400 font-medium mb-2">Step 1</div>
                                <h3 className="text-xl font-bold mb-3">Speak the Job Your Way</h3>
                                <p className="text-gray-400 text-sm leading-relaxed">
                                    Tap the mic and describe the work in Spanish, Korean, English, or a mix of all three: scope, parts, access issues, labor, and what the customer needs to know.
                                </p>
                            </div>
                        </div>

                        <div className="relative">
                            <div className="relative h-full rounded-lg border border-white/10 bg-white/5 p-8 transition-colors hover:border-purple-500/30">
                                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-purple-500/10 text-purple-300">
                                    <Bot className="h-6 w-6" />
                                </div>
                                <div className="text-xs text-purple-400 font-medium mb-2">Step 2</div>
                                <h3 className="text-xl font-bold mb-3">Get a Clean English Draft</h3>
                                <p className="text-gray-400 text-sm leading-relaxed">
                                    SnapQuote rewrites rough field language into clear customer-facing English with scope, parts, labor, tax, and totals you can correct before the customer sees it.
                                </p>
                            </div>
                        </div>

                        <div className="relative">
                            <div className="relative h-full rounded-lg border border-white/10 bg-white/5 p-8 transition-colors hover:border-green-500/30">
                                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-green-500/10 text-green-300">
                                    <DollarSign className="h-6 w-6" />
                                </div>
                                <div className="text-xs text-green-400 font-medium mb-2">Step 3</div>
                                <h3 className="text-xl font-bold mb-3">Send and Get Paid</h3>
                                <p className="text-gray-400 text-sm leading-relaxed">
                                    Send a clean English PDF with your branding and payment request while you are still on site, so approval and deposit happen faster.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section id="features" className="py-20 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <div className="text-sm text-blue-400 font-medium mb-3 uppercase tracking-wider">Why SnapQuote</div>
                        <h2 className="text-3xl font-bold leading-[1.28] md:text-4xl md:leading-[1.3]">
                            Built for multilingual field reality,
                            <br />
                            <span className="text-gray-400">not office-first quoting software.</span>
                        </h2>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="rounded-lg border border-white/10 bg-white/5 p-6 transition-colors hover:border-blue-500/20">
                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10 text-blue-300">
                                <WifiOff className="h-6 w-6" />
                            </div>
                            <h3 className="font-bold text-lg mb-2">Works Offline</h3>
                            <p className="text-sm text-gray-400">Basement? Crawlspace? No signal? No problem. Create estimates anywhere, then sync when you&apos;re back online.</p>
                        </div>

                        <div className="rounded-lg border border-white/10 bg-white/5 p-6 transition-colors hover:border-blue-500/20">
                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10 text-blue-300">
                                <Mic className="h-6 w-6" />
                            </div>
                            <h3 className="font-bold text-lg mb-2">Speak in Spanish or Korean</h3>
                            <p className="text-sm text-gray-400">Dirty hands, wet gloves, moving fast. Talk once in the language that comes naturally and let AI turn it into a sendable English quote.</p>
                        </div>

                        <div className="rounded-lg border border-white/10 bg-white/5 p-6 transition-colors hover:border-blue-500/20">
                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10 text-blue-300">
                                <Receipt className="h-6 w-6" />
                            </div>
                            <h3 className="font-bold text-lg mb-2">Receipt to Line Items</h3>
                            <p className="text-sm text-gray-400">Snap a Ferguson, Home Depot, or supply-house receipt and turn it into estimate line items without retyping everything.</p>
                        </div>

                        <div className="rounded-lg border border-white/10 bg-white/5 p-6 transition-colors hover:border-blue-500/20">
                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10 text-blue-300">
                                <FileText className="h-6 w-6" />
                            </div>
                            <h3 className="font-bold text-lg mb-2">English Customers See Clean English</h3>
                            <p className="text-sm text-gray-400">Turn rough bilingual phrasing into a clean customer-facing quote with your business name, scope, totals, and payment request in one place.</p>
                        </div>

                        <div className="rounded-lg border border-white/10 bg-white/5 p-6 transition-colors hover:border-blue-500/20">
                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10 text-blue-300">
                                <Bot className="h-6 w-6" />
                            </div>
                            <h3 className="font-bold text-lg mb-2">Follow-Up Without Chasing</h3>
                            <p className="text-sm text-gray-400">When the homeowner goes quiet, keep the quote moving without manually rewriting every follow-up from scratch.</p>
                        </div>

                        <div className="rounded-lg border border-white/10 bg-white/5 p-6 transition-colors hover:border-blue-500/20">
                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10 text-blue-300">
                                <DollarSign className="h-6 w-6" />
                            </div>
                            <h3 className="font-bold text-lg mb-2">Deposit-Ready Quotes</h3>
                            <p className="text-sm text-gray-400">Add Stripe, PayPal, or Venmo payment options so the customer can approve and pay while urgency is still high.</p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="border-y border-white/5 bg-slate-950/35 py-20 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <div className="text-sm text-blue-400 font-medium mb-3 uppercase tracking-wider">App Preview</div>
                        <h2 className="text-3xl font-bold leading-[1.28] md:text-4xl md:leading-[1.3]">
                            See it in action
                        </h2>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {appPreviewCards.map((card) => (
                            <div key={card.title} className="text-center">
                                <div className={`mb-4 rounded-lg border border-white/10 bg-white/5 p-5 transition-colors ${card.accentClassName}`}>
                                    <div className="min-h-[17rem] rounded-lg border border-white/10 bg-[#11141b] p-4 text-left">
                                        <div className="flex items-center justify-between border-b border-white/5 pb-3">
                                            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-400">SnapQuote</div>
                                            <div className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-300">{card.badge}</div>
                                        </div>
                                        <div className="space-y-3 pt-4">
                                            {card.lines.map((line) => (
                                                <div key={line} className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-3 text-sm text-gray-200">
                                                    {line}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <h3 className="font-semibold text-lg">{card.title}</h3>
                                <p className="text-sm text-gray-400">{card.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="py-20 px-6">
                <div className="max-w-4xl mx-auto">
                    <div className="relative overflow-hidden rounded-lg border border-blue-500/10 bg-blue-950/25 p-10 text-center md:p-16">
                        <div className="relative">
                            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-lg bg-blue-500/10 text-blue-300">
                                <Home className="h-7 w-7" />
                            </div>
                            <h2 className="text-3xl font-bold leading-[1.28] md:text-4xl md:leading-[1.3] mb-6">
                                The Driveway Rule
                            </h2>
                            <p className="text-lg text-gray-300 mb-4 max-w-2xl mx-auto leading-relaxed">
                                When you pull away from the customer&apos;s house, the quote should already be <strong className="text-white">out</strong>. Not waiting until tonight. Not buried in your notes app.
                            </p>
                            <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto leading-relaxed">
                                <strong className="text-white">Done means done.</strong> Dinner stays dinner. Weekends stay weekends. Quote admin should not follow you home.
                            </p>
                            <p className="text-2xl font-bold text-blue-200">
                                Quote it before you drive off.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <section id="pricing" className="py-20 px-6">
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-16">
                        <div className="text-sm text-blue-400 font-medium mb-3 uppercase tracking-wider">Simple Pricing</div>
                            <h2 className="text-3xl font-bold leading-[1.28] md:text-4xl md:leading-[1.3] mb-4">
                            Priced for multilingual field quoting, not seat bloat.
                        </h2>
                        <p className="text-gray-400">Start with {FREE_PLAN_MARKETING_QUOTE_LIMIT} free quotes per month, then move up based on how often you need to turn Spanish or Korean field talk into clean English estimates from the truck.</p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-6">
                        {MARKETING_PLAN_OPTIONS.map((plan) => {
                            const isTeam = plan.tier === "team"

                            return (
                                <div
                                    key={plan.tier}
                                    className={isTeam
                                        ? "relative rounded-lg border-2 border-blue-500/30 bg-blue-600/10 p-8"
                                        : "rounded-lg border border-white/10 bg-white/5 p-8"}
                                >
                                    {isTeam && (
                                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-lg bg-blue-600 px-4 py-1 text-xs font-bold text-white">
                                            MOST POPULAR
                                        </div>
                                    )}
                                    <h3 className="text-lg font-bold mb-1">{plan.label}</h3>
                                    <p className="text-sm text-gray-400 mb-6">{plan.bestFor}</p>
                                    <div className="text-4xl font-bold leading-[1.25] mb-1">{plan.monthlyPrice}</div>
                                    <p className="text-sm text-gray-400 mb-6">{plan.billingLabel}</p>
                                    <ul className="space-y-3 text-sm text-gray-300">
                                        {plan.includes.map((item) => (
                                            <li key={item} className="flex items-center gap-2">
                                                <CheckCircle className={`h-4 w-4 shrink-0 ${isTeam ? "text-blue-400" : "text-green-400"}`} />
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                    <Link
                                        href={`/pricing?plan=${plan.tier}`}
                                        className={isTeam
                                            ? "mt-8 block rounded-lg bg-blue-600 py-3 text-center text-sm font-semibold transition-colors hover:bg-blue-500"
                                            : "mt-8 block rounded-lg border border-white/10 py-3 text-center text-sm font-medium transition-colors hover:border-white/20"}
                                    >
                                        {plan.pricingCtaLabel}
                                    </Link>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </section>

            <section id="testimonials" className="py-20 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <div className="text-sm text-blue-400 font-medium mb-3 uppercase tracking-wider">Built Around Field Interviews</div>
                        <h2 className="text-3xl font-bold leading-[1.28] md:text-4xl md:leading-[1.3]">
                            The pain patterns this workflow was built around.
                        </h2>
                    </div>

                    <div className="grid md:grid-cols-3 gap-6">
                        <div className="rounded-lg border border-white/10 bg-white/5 p-6">
                            <div className="text-xs uppercase tracking-wider text-blue-400 mb-4">Interview theme</div>
                            <p className="text-sm text-gray-300 mb-4 leading-relaxed">
                                &quot;If the quote does not go out before I leave, it becomes tonight&apos;s problem.&quot;
                            </p>
                            <div className="flex items-center gap-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20 text-sm font-bold text-blue-400">M</div>
                                <div>
                                    <p className="text-sm font-medium">Driveway speed matters</p>
                                    <p className="text-xs text-gray-400">Repeated feedback from owner-operators</p>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-lg border border-white/10 bg-white/5 p-6">
                            <div className="text-xs uppercase tracking-wider text-green-400 mb-4">Interview theme</div>
                            <p className="text-sm text-gray-300 mb-4 leading-relaxed">
                                &quot;I can explain the work in Spanish way faster than I can write it in clean English.&quot;
                            </p>
                            <div className="flex items-center gap-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/20 text-sm font-bold text-green-400">S</div>
                                <div>
                                    <p className="text-sm font-medium">Native-language voice beats English typing</p>
                                    <p className="text-xs text-gray-400">Repeated feedback from multilingual service-call crews</p>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-lg border border-white/10 bg-white/5 p-6">
                            <div className="text-xs uppercase tracking-wider text-purple-400 mb-4">Interview theme</div>
                            <p className="text-sm text-gray-300 mb-4 leading-relaxed">
                                &quot;Weak signal should not kill the quote while the customer is still ready to say yes.&quot;
                            </p>
                            <div className="flex items-center gap-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/20 text-sm font-bold text-purple-400">D</div>
                                <div>
                                    <p className="text-sm font-medium">Offline-first is not optional</p>
                                    <p className="text-xs text-gray-400">Repeated feedback from basement and remodel jobs</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="py-20 px-6">
                <div className="max-w-4xl mx-auto text-center">
                    <h2 className="text-3xl font-bold leading-[1.28] md:text-5xl md:leading-[1.3] mb-6">
                        Your next quote should leave in English,
                        <br />
                        <span className="text-blue-200">even if the job was explained in Spanish or Korean.</span>
                    </h2>
                    <p className="text-lg text-gray-400 mb-10 max-w-2xl mx-auto">
                        Start with {FREE_PLAN_MARKETING_QUOTE_LIMIT} free field quotes. If SnapQuote becomes part of your service-call routine, move up to the plan that matches your truck, quote volume, and crew.
                    </p>
                    <Link href="/new-estimate" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-10 py-5 text-lg font-semibold text-white transition-colors hover:bg-blue-500">
                        <Mic className="h-6 w-6" />
                        Try the English Quote Workflow
                    </Link>
                    <p className="text-xs text-gray-400 mt-4">Works offline · Built for multilingual contractors · Better than typing quotes at night</p>
                </div>
            </section>

            <footer className="py-12 px-6 border-t border-white/5">
                <div className="max-w-6xl mx-auto">
                    <div className="grid md:grid-cols-4 gap-8">
                        <div>
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">SQ</div>
                                <span className="font-bold">SnapQuote</span>
                            </div>
                            <p className="text-sm text-gray-400">Speak in Spanish or Korean. Send in English before you drive off.</p>
                        </div>
                        <div>
                            <h4 className="font-semibold mb-3 text-sm">Product</h4>
                            <ul className="space-y-2 text-sm text-gray-400">
                                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                                <li><a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-semibold mb-3 text-sm">Best Fit</h4>
                            <ul className="space-y-2 text-sm text-gray-400">
                                <li>Residential service calls</li>
                                <li>Small installs</li>
                                <li>Repair work</li>
                                <li>Change orders</li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-semibold mb-3 text-sm">Legal</h4>
                            <ul className="space-y-2 text-sm text-gray-400">
                                <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                                <li><Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
                            </ul>
                        </div>
                    </div>
                    <div className="border-t border-white/5 mt-8 pt-8 text-center text-xs text-gray-400">
                        © {new Date().getFullYear()} SnapQuote. Built for multilingual owner-operators who quote from the field.
                    </div>
                </div>
            </footer>
        </div>
    )
}
