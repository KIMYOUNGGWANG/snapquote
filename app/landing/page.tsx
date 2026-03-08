"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import { FreeEstimatorWidget } from "@/components/free-estimator-widget"

// Animated counter component
function AnimatedCounter({ target, suffix = "", prefix = "" }: { target: number, suffix?: string, prefix?: string }) {
    const [count, setCount] = useState(0)
    const ref = useRef<HTMLDivElement>(null)
    const [isVisible, setIsVisible] = useState(false)

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) setIsVisible(true) },
            { threshold: 0.3 }
        )
        if (ref.current) observer.observe(ref.current)
        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        if (!isVisible) return
        const duration = 2000
        const steps = 60
        const increment = target / steps
        let current = 0
        const timer = setInterval(() => {
            current += increment
            if (current >= target) {
                setCount(target)
                clearInterval(timer)
            } else {
                setCount(Math.floor(current))
            }
        }, duration / steps)
        return () => clearInterval(timer)
    }, [isVisible, target])

    return <div ref={ref}>{prefix}{count.toLocaleString()}{suffix}</div>
}

// Typewriter effect for hero
function TypewriterText({ texts }: { texts: string[] }) {
    const [currentIndex, setCurrentIndex] = useState(0)
    const [displayedText, setDisplayedText] = useState("")
    const [isDeleting, setIsDeleting] = useState(false)

    useEffect(() => {
        const currentFullText = texts[currentIndex]
        const typeSpeed = isDeleting ? 30 : 50

        if (!isDeleting && displayedText === currentFullText) {
            setTimeout(() => setIsDeleting(true), 2000)
            return
        }

        if (isDeleting && displayedText === "") {
            setIsDeleting(false)
            setCurrentIndex((prev) => (prev + 1) % texts.length)
            return
        }

        const timeout = setTimeout(() => {
            setDisplayedText(prev =>
                isDeleting
                    ? currentFullText.substring(0, prev.length - 1)
                    : currentFullText.substring(0, prev.length + 1)
            )
        }, typeSpeed)

        return () => clearTimeout(timeout)
    }, [displayedText, isDeleting, currentIndex, texts])

    return (
        <span className="text-blue-400">
            &quot;{displayedText}&quot;
            <span className="animate-pulse">|</span>
        </span>
    )
}

export default function LandingPage() {
    const [isMenuOpen, setIsMenuOpen] = useState(false)

    const voiceExamples = [
        "Replace damaged entry door, new hardware, haul away old unit, 5 hours labor",
        "Install customer-supplied vanity, reconnect fixture, patch minor drywall, 4 hours labor",
        "Swap two light fixtures, add dimmer switch, test circuits, cleanup included",
        "Repair ceiling drywall after leak, texture blend, prime and paint, 1 day labor"
    ]

    return (
        <div className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">
            {/* Navigation */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/5">
                <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center text-white font-bold text-sm">
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
                        <Link href="/new-estimate" className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-full text-sm font-medium transition-all hover:shadow-lg hover:shadow-blue-500/25">
                            Try Free →
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative pt-32 pb-20 px-6">
                {/* Background glow */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />

                <div className="max-w-6xl mx-auto relative">
                    <div className="grid lg:grid-cols-2 gap-12 items-center">
                        <div>
                            {/* Badge */}
                            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-400 text-xs font-medium mb-6">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                </span>
                                For Owner-Operators and Small Trade Teams
                            </div>

                            <h1 className="text-4xl md:text-6xl font-bold leading-tight mb-6">
                                Send the field quote
                                <br />
                                <span className="bg-gradient-to-r from-blue-400 via-blue-500 to-purple-500 bg-clip-text text-transparent">
                                    before you leave the job site.
                                </span>
                            </h1>

                            <p className="text-lg text-gray-400 mb-4 max-w-lg">
                                Record 30 seconds of scope notes on-site. SnapQuote turns them into a professional estimate you can review, send, and get approved before the customer cools off.
                            </p>

                            {/* Voice Input Demo */}
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-8 max-w-lg">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                                    <span className="text-xs text-gray-400 uppercase tracking-wider">Voice Input</span>
                                </div>
                                <div className="text-sm text-gray-300 h-12 flex items-center">
                                    <TypewriterText texts={voiceExamples} />
                                </div>
                                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/5">
                                    <span className="text-xs text-gray-500">↓ 30 seconds later</span>
                                </div>
                                <div className="flex items-center gap-2 mt-2 bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                                    <svg className="w-5 h-5 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span className="text-sm text-green-400 font-medium">Quote draft ready - parts, labor, tax, and payment request</span>
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3">
                                <Link href="/new-estimate" className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-2xl text-base font-semibold transition-all hover:shadow-2xl hover:shadow-blue-500/25 hover:-translate-y-0.5 flex items-center justify-center gap-2">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                    </svg>
                                    Create Your First Field Quote
                                </Link>
                                <a href="#how-it-works" className="border border-white/10 hover:border-white/20 text-gray-300 hover:text-white px-8 py-4 rounded-2xl text-base font-medium transition-all flex items-center justify-center gap-2">
                                    See How It Works
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </a>
                            </div>

                            <p className="text-xs text-gray-500 mt-4">
                                ✓ No credit card required &nbsp;·&nbsp; ✓ Works offline in weak-signal job sites &nbsp;·&nbsp; ✓ 10 free estimates
                            </p>
                        </div>

                        {/* Hero Image / App Preview */}
                        <div className="relative hidden lg:block">
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 to-purple-600/10 rounded-3xl blur-2xl" />
                            <div className="relative bg-white/5 border border-white/10 rounded-3xl p-2 shadow-2xl shadow-blue-900/20">
                                <Image
                                    src="/hero-contractor.png"
                                    alt="Contractor using SnapQuote at a residential job site"
                                    width={600}
                                    height={600}
                                    className="rounded-2xl w-full h-auto object-cover"
                                    priority
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Social Proof Bar */}
            <section className="py-8 border-y border-white/5 bg-white/[0.02]">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
                        <div>
                            <div className="text-2xl md:text-3xl font-bold text-white">
                                <AnimatedCounter target={30} suffix="sec" />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Average estimate time</p>
                        </div>
                        <div>
                            <div className="text-2xl md:text-3xl font-bold text-white">
                                <AnimatedCounter target={10} suffix="hrs" />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Saved per week</p>
                        </div>
                        <div>
                            <div className="text-2xl md:text-3xl font-bold text-white">
                                <AnimatedCounter target={100} suffix="%" />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Offline capable</p>
                        </div>
                        <div>
                            <div className="text-2xl md:text-3xl font-bold text-white">
                                <AnimatedCounter target={2} suffix="min" />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">From scope note to sent quote</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Pain Point Section */}
            <section className="py-20 px-6">
                <div className="max-w-4xl mx-auto text-center">
                    <h2 className="text-3xl md:text-4xl font-bold mb-6">
                        Sound familiar for a field owner?
                    </h2>
                    <div className="grid md:grid-cols-3 gap-6 mt-12">
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-red-500/30 transition-colors">
                            <div className="text-4xl mb-4">🌙</div>
                            <h3 className="font-semibold text-lg mb-2">Quotes After Dinner</h3>
                            <p className="text-sm text-gray-400">You finished the service call hours ago, but the quote still needs to get written after everyone else is asleep.</p>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-red-500/30 transition-colors">
                            <div className="text-4xl mb-4">📱</div>
                            <h3 className="font-semibold text-lg mb-2">No Signal Below Grade</h3>
                            <p className="text-sm text-gray-400">Basement, crawlspace, rural property, concrete shell. Web-only software dies exactly where field crews do their real work.</p>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-red-500/30 transition-colors">
                            <div className="text-4xl mb-4">🗣️</div>
                            <h3 className="font-semibold text-lg mb-2">Scope Stuck in Your Head</h3>
                            <p className="text-sm text-gray-400">You already know the parts, labor, and risk. The slow part is typing it cleanly enough to send before the customer moves on.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Free AI Estimator Tool (Lead Gen) */}
            <section className="py-20 px-6 bg-gradient-to-b from-transparent via-purple-950/10 to-transparent">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-12">
                        <div className="text-sm text-purple-400 font-medium mb-3 uppercase tracking-wider">Try It Now — No Sign Up</div>
                        <h2 className="text-3xl md:text-4xl font-bold mb-4">
                            Upload a receipt or material list.
                            <br />
                            <span className="text-gray-400">See what AI can pull into an estimate.</span>
                        </h2>
                        <p className="text-gray-400 max-w-xl mx-auto">
                            Snap a photo of a supply-house receipt or material list. SnapQuote extracts line items so you can review material costs faster.
                        </p>
                    </div>
                    <FreeEstimatorWidget />
                </div>
            </section>

            {/* How It Works */}
            <section id="how-it-works" className="py-20 px-6 bg-gradient-to-b from-transparent via-blue-950/10 to-transparent">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <div className="text-sm text-blue-400 font-medium mb-3 uppercase tracking-wider">How It Works</div>
                        <h2 className="text-3xl md:text-4xl font-bold">
                            From truck to quote in under two minutes.
                            <br />
                            <span className="text-gray-400">Built for service calls, not office days.</span>
                        </h2>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {/* Step 1 */}
                        <div className="relative group">
                            <div className="absolute -inset-1 bg-gradient-to-br from-blue-600/20 to-transparent rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="relative bg-white/5 border border-white/10 rounded-2xl p-8 h-full hover:border-blue-500/30 transition-colors">
                                <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-6">
                                    <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                    </svg>
                                </div>
                                <div className="text-xs text-blue-400 font-medium mb-2">Step 1</div>
                                <h3 className="text-xl font-bold mb-3">Talk Through the Job</h3>
                                <p className="text-gray-400 text-sm leading-relaxed">
                                    Tap the mic and describe the work the way you already think: leak source, parts needed, access issues, labor, and anything the homeowner should know.
                                </p>
                            </div>
                        </div>

                        {/* Step 2 */}
                        <div className="relative group">
                            <div className="absolute -inset-1 bg-gradient-to-br from-purple-600/20 to-transparent rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="relative bg-white/5 border border-white/10 rounded-2xl p-8 h-full hover:border-purple-500/30 transition-colors">
                                <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center mb-6">
                                    <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                </div>
                                <div className="text-xs text-purple-400 font-medium mb-2">Step 2</div>
                                <h3 className="text-xl font-bold mb-3">Review the Draft</h3>
                                <p className="text-gray-400 text-sm leading-relaxed">
                                    SnapQuote turns rough field notes into parts, labor, tax, and totals you can edit quickly before you send it.
                                </p>
                            </div>
                        </div>

                        {/* Step 3 */}
                        <div className="relative group">
                            <div className="absolute -inset-1 bg-gradient-to-br from-green-600/20 to-transparent rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="relative bg-white/5 border border-white/10 rounded-2xl p-8 h-full hover:border-green-500/30 transition-colors">
                                <div className="w-12 h-12 bg-green-500/10 rounded-2xl flex items-center justify-center mb-6">
                                    <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <div className="text-xs text-green-400 font-medium mb-2">Step 3</div>
                                <h3 className="text-xl font-bold mb-3">Send and Collect</h3>
                                <p className="text-gray-400 text-sm leading-relaxed">
                                    Send a clean PDF with your branding and payment request while you are still on site, so approval and deposit happen faster.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Grid */}
            <section id="features" className="py-20 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <div className="text-sm text-blue-400 font-medium mb-3 uppercase tracking-wider">Why SnapQuote</div>
                        <h2 className="text-3xl md:text-4xl font-bold">
                            Built for field jobs,
                            <br />
                            <span className="text-gray-400">not office workflows.</span>
                        </h2>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* Feature 1 */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-blue-500/20 transition-all hover:-translate-y-1">
                            <div className="text-3xl mb-4">🔇</div>
                            <h3 className="font-bold text-lg mb-2">Works Offline</h3>
                            <p className="text-sm text-gray-400">Basement? Crawlspace? No signal? No problem. Create estimates anywhere — syncs when you&apos;re back online.</p>
                        </div>

                        {/* Feature 2 */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-blue-500/20 transition-all hover:-translate-y-1">
                            <div className="text-3xl mb-4">🎤</div>
                            <h3 className="font-bold text-lg mb-2">Voice-First Capture</h3>
                            <p className="text-sm text-gray-400">Dirty hands, wet gloves, moving fast. Talk once and let AI organize the scope into something sendable.</p>
                        </div>

                        {/* Feature 3 */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-blue-500/20 transition-all hover:-translate-y-1">
                            <div className="text-3xl mb-4">🧾</div>
                            <h3 className="font-bold text-lg mb-2">Receipt to Line Items</h3>
                            <p className="text-sm text-gray-400">Snap a Ferguson, Home Depot, or supply-house receipt and turn it into estimate line items without retyping everything.</p>
                        </div>

                        {/* Feature 4 */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-blue-500/20 transition-all hover:-translate-y-1">
                            <div className="text-3xl mb-4">📄</div>
                            <h3 className="font-bold text-lg mb-2">Clean Customer PDF</h3>
                            <p className="text-sm text-gray-400">Your business name, tax, scope, totals, and payment request in one professional document that feels bigger than a text message quote.</p>
                        </div>

                        {/* Feature 5 */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-blue-500/20 transition-all hover:-translate-y-1">
                            <div className="text-3xl mb-4">🤖</div>
                            <h3 className="font-bold text-lg mb-2">Follow-Up Without Chasing</h3>
                            <p className="text-sm text-gray-400">When the homeowner goes quiet, SnapQuote helps you follow up so quotes do not die in your inbox.</p>
                        </div>

                        {/* Feature 6 */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-blue-500/20 transition-all hover:-translate-y-1">
                            <div className="text-3xl mb-4">💰</div>
                            <h3 className="font-bold text-lg mb-2">Deposit-Ready Quotes</h3>
                            <p className="text-sm text-gray-400">Add Stripe, PayPal, or Venmo payment options so the customer can approve and pay while urgency is still high.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* App Screenshots Carousel */}
            <section className="py-20 px-6 bg-gradient-to-b from-transparent via-blue-950/10 to-transparent">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <div className="text-sm text-blue-400 font-medium mb-3 uppercase tracking-wider">App Preview</div>
                        <h2 className="text-3xl md:text-4xl font-bold">
                            See it in action
                        </h2>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        <div className="text-center">
                            <div className="bg-white/5 border border-white/10 rounded-3xl p-3 mb-4 hover:border-blue-500/30 transition-colors shadow-2xl shadow-blue-900/10">
                                <Image src="/app-screenshot-home.png" alt="SnapQuote Home" width={400} height={800} className="rounded-2xl w-full h-auto" />
                            </div>
                            <h3 className="font-semibold text-lg">Owner Dashboard</h3>
                            <p className="text-sm text-gray-400">See active quotes, sent jobs, and what still needs a follow-up.</p>
                        </div>
                        <div className="text-center">
                            <div className="bg-white/5 border border-white/10 rounded-3xl p-3 mb-4 hover:border-purple-500/30 transition-colors shadow-2xl shadow-purple-900/10">
                                <Image src="/app-screenshot-estimate.png" alt="SnapQuote Estimate" width={400} height={800} className="rounded-2xl w-full h-auto" />
                            </div>
                            <h3 className="font-semibold text-lg">On-Site Quote Builder</h3>
                            <p className="text-sm text-gray-400">Capture the scope, clean it up, and send before you leave the house.</p>
                        </div>
                        <div className="text-center">
                            <div className="bg-white/5 border border-white/10 rounded-3xl p-3 mb-4 hover:border-green-500/30 transition-colors shadow-2xl shadow-green-900/10">
                                <Image src="/app-screenshot-automation.png" alt="SnapQuote Automation" width={400} height={800} className="rounded-2xl w-full h-auto" />
                            </div>
                            <h3 className="font-semibold text-lg">Follow-Up + Payment</h3>
                            <p className="text-sm text-gray-400">Keep the quote moving until it becomes an approved job.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* The Parking Lot Rule */}
            <section className="py-20 px-6">
                <div className="max-w-4xl mx-auto">
                    <div className="bg-gradient-to-br from-blue-950/50 to-purple-950/30 border border-blue-500/10 rounded-3xl p-10 md:p-16 text-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl" />
                        <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl" />
                        <div className="relative">
                            <div className="text-5xl mb-6">🏡</div>
                            <h2 className="text-3xl md:text-4xl font-bold mb-6">
                                The Driveway Rule
                            </h2>
                            <p className="text-lg text-gray-300 mb-4 max-w-2xl mx-auto leading-relaxed">
                                When you pull away from the customer&apos;s house, the quote should already be <strong className="text-white">out</strong>. Not waiting until tonight. Not buried in your notes app.
                            </p>
                            <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto leading-relaxed">
                                <strong className="text-white">Done means done.</strong> Dinner stays dinner. Weekends stay weekends. Quote admin should not follow you home.
                            </p>
                            <p className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                                Quote it before you drive off.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Pricing */}
            <section id="pricing" className="py-20 px-6 bg-gradient-to-b from-transparent via-blue-950/10 to-transparent">
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-16">
                        <div className="text-sm text-blue-400 font-medium mb-3 uppercase tracking-wider">Simple Pricing</div>
                        <h2 className="text-3xl md:text-4xl font-bold mb-4">
                            Priced for owner-operators first.
                        </h2>
                        <p className="text-gray-400">Start with 10 free estimates, then choose the plan that fits your truck, volume, and crew.</p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-6">
                        {/* Starter */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
                            <h3 className="text-lg font-bold mb-1">Starter</h3>
                            <p className="text-sm text-gray-400 mb-6">For solo contractors building a quoting habit</p>
                            <div className="text-4xl font-bold mb-1">CAD $29</div>
                            <p className="text-sm text-gray-400 mb-6">per month</p>
                            <ul className="space-y-3 text-sm text-gray-300">
                                <li className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    80 estimates per month
                                </li>
                                <li className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    60 transcription minutes
                                </li>
                                <li className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    60 emails per month
                                </li>
                                <li className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    Voice input and offline mode
                                </li>
                            </ul>
                            <Link href="/new-estimate" className="block mt-8 border border-white/10 hover:border-white/20 text-center py-3 rounded-xl text-sm font-medium transition-colors">
                                Start With Starter
                            </Link>
                        </div>

                        {/* Pro */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
                            <h3 className="text-lg font-bold mb-1">Pro</h3>
                            <p className="text-sm text-gray-400 mb-6">For owner-operators who want faster approvals and deposits</p>
                            <div className="text-4xl font-bold mb-1">CAD $59</div>
                            <p className="text-sm text-gray-400 mb-6">per month</p>
                            <ul className="space-y-3 text-sm text-gray-300">
                                <li className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    250 estimates per month
                                </li>
                                <li className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    180 transcription minutes
                                </li>
                                <li className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    200 emails per month
                                </li>
                                <li className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    Receipt scan and payment-ready quotes
                                </li>
                            </ul>
                            <Link href="/new-estimate" className="block mt-8 border border-white/10 hover:border-white/20 text-center py-3 rounded-xl text-sm font-medium transition-colors">
                                Try Pro Workflow
                            </Link>
                        </div>

                        {/* Team */}
                        <div className="relative bg-gradient-to-br from-blue-600/10 to-purple-600/10 border-2 border-blue-500/30 rounded-2xl p-8">
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-4 py-1 rounded-full">
                                MOST POPULAR
                            </div>
                            <h3 className="text-lg font-bold mb-1">Team</h3>
                            <p className="text-sm text-gray-400 mb-6">For small crews that need shared workflows and higher volume</p>
                            <div className="text-4xl font-bold mb-1">CAD $129</div>
                            <p className="text-sm text-gray-400 mb-6">per month</p>
                            <ul className="space-y-3 text-sm text-gray-300">
                                <li className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    800 estimates per month
                                </li>
                                <li className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    Shared workflows for multi-user teams
                                </li>
                                <li className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    Automation included
                                </li>
                                <li className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    Higher-volume quoting for multiple techs
                                </li>
                                <li className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    Priority support
                                </li>
                            </ul>
                            <Link href="/new-estimate" className="block mt-8 bg-blue-600 hover:bg-blue-500 text-center py-3 rounded-xl text-sm font-semibold transition-all hover:shadow-lg hover:shadow-blue-500/25">
                                Explore Team →
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Testimonials */}
            <section id="testimonials" className="py-20 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <div className="text-sm text-blue-400 font-medium mb-3 uppercase tracking-wider">From Real Contractors</div>
                        <h2 className="text-3xl md:text-4xl font-bold">
                            Built for the way field owners actually work.
                        </h2>
                    </div>

                    <div className="grid md:grid-cols-3 gap-6">
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                            <div className="flex items-center gap-1 mb-4">
                                {[...Array(5)].map((_, i) => (
                                    <svg key={i} className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                    </svg>
                                ))}
                            </div>
                            <p className="text-sm text-gray-300 mb-4 leading-relaxed">
                                &quot;I quoted the job from the driveway and had approval before I hit the next red light. That never used to happen.&quot;
                            </p>
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center text-sm font-bold text-blue-400">M</div>
                                <div>
                                    <p className="text-sm font-medium">Mike R.</p>
                                    <p className="text-xs text-gray-500">Contractor, 12 years</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                            <div className="flex items-center gap-1 mb-4">
                                {[...Array(5)].map((_, i) => (
                                    <svg key={i} className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                    </svg>
                                ))}
                            </div>
                            <p className="text-sm text-gray-300 mb-4 leading-relaxed">
                                &quot;I do not want to type scope notes after every crawlspace call. I talk once, clean the draft, and send a quote that looks professional.&quot;
                            </p>
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-green-500/20 rounded-full flex items-center justify-center text-sm font-bold text-green-400">S</div>
                                <div>
                                    <p className="text-sm font-medium">Sarah T.</p>
                                    <p className="text-xs text-gray-500">Owner-operator, 9 years</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                            <div className="flex items-center gap-1 mb-4">
                                {[...Array(5)].map((_, i) => (
                                    <svg key={i} className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                    </svg>
                                ))}
                            </div>
                            <p className="text-sm text-gray-300 mb-4 leading-relaxed">
                                &quot;Basements kill signal. SnapQuote still lets me build the quote on site and send it the second I get service back. That alone saves me hours.&quot;
                            </p>
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-purple-500/20 rounded-full flex items-center justify-center text-sm font-bold text-purple-400">D</div>
                                <div>
                                    <p className="text-sm font-medium">David L.</p>
                                    <p className="text-xs text-gray-500">Remodeler, 15 years</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Final CTA */}
            <section className="py-20 px-6">
                <div className="max-w-4xl mx-auto text-center">
                    <h2 className="text-3xl md:text-5xl font-bold mb-6">
                        Your next quote should be sent
                        <br />
                        <span className="bg-gradient-to-r from-blue-400 via-blue-500 to-purple-500 bg-clip-text text-transparent">before you start the truck.</span>
                    </h2>
                    <p className="text-lg text-gray-400 mb-10 max-w-2xl mx-auto">
                        Start with 10 free estimates. If SnapQuote becomes part of your service-call routine, move up to Starter, Pro, or Team.
                    </p>
                    <Link href="/new-estimate" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-10 py-5 rounded-2xl text-lg font-semibold transition-all hover:shadow-2xl hover:shadow-blue-500/30 hover:-translate-y-1">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                        Create Your First Field Quote
                    </Link>
                    <p className="text-xs text-gray-600 mt-4">Works offline · Built for owner-operators · Review before sending</p>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-12 px-6 border-t border-white/5">
                <div className="max-w-6xl mx-auto">
                    <div className="grid md:grid-cols-4 gap-8">
                        <div>
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center text-white font-bold text-sm">SQ</div>
                                <span className="font-bold">SnapQuote</span>
                            </div>
                            <p className="text-sm text-gray-500">Dirty hands. Fast field quotes.</p>
                        </div>
                        <div>
                            <h4 className="font-semibold mb-3 text-sm">Product</h4>
                            <ul className="space-y-2 text-sm text-gray-500">
                                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                                <li><a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-semibold mb-3 text-sm">Best Fit</h4>
                            <ul className="space-y-2 text-sm text-gray-500">
                                <li>Residential service calls</li>
                                <li>Small installs</li>
                                <li>Repair work</li>
                                <li>Change orders</li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-semibold mb-3 text-sm">Legal</h4>
                            <ul className="space-y-2 text-sm text-gray-500">
                                <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                                <li><Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
                            </ul>
                        </div>
                    </div>
                    <div className="border-t border-white/5 mt-8 pt-8 text-center text-xs text-gray-600">
                        © {new Date().getFullYear()} SnapQuote. Built for owner-operators who quote from the field.
                    </div>
                </div>
            </footer>
        </div>
    )
}
