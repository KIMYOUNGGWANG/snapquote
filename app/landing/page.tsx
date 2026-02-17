"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import Image from "next/image"

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
        "Bathroom renovation, 50 sqft tile, new faucet, labor 4 hours",
        "Replace water heater, 40 gallon, copper pipes, 3 hours",
        "Kitchen remodel, 12 cabinets, granite counters, demo included",
        "Fix leaking pipe under sink, replace P-trap, 1 hour"
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
                                For Contractors & Tradespeople
                            </div>

                            <h1 className="text-4xl md:text-6xl font-bold leading-tight mb-6">
                                Stop doing
                                <br />
                                <span className="bg-gradient-to-r from-blue-400 via-blue-500 to-purple-500 bg-clip-text text-transparent">
                                    estimates at home.
                                </span>
                            </h1>

                            <p className="text-lg text-gray-400 mb-4 max-w-lg">
                                Speak your job details on-site. Get a professional PDF estimate in <strong className="text-white">30 seconds</strong>. Send it to your client before you start your truck.
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
                                    <span className="text-sm text-green-400 font-medium">Professional PDF Ready — Email to client instantly</span>
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3">
                                <Link href="/new-estimate" className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-2xl text-base font-semibold transition-all hover:shadow-2xl hover:shadow-blue-500/25 hover:-translate-y-0.5 flex items-center justify-center gap-2">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                    </svg>
                                    Create Your First Estimate — Free
                                </Link>
                                <a href="#how-it-works" className="border border-white/10 hover:border-white/20 text-gray-300 hover:text-white px-8 py-4 rounded-2xl text-base font-medium transition-all flex items-center justify-center gap-2">
                                    Watch Demo
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </a>
                            </div>

                            <p className="text-xs text-gray-500 mt-4">
                                ✓ No credit card required &nbsp;·&nbsp; ✓ Works offline &nbsp;·&nbsp; ✓ 3 free estimates
                            </p>
                        </div>

                        {/* Hero Image / App Preview */}
                        <div className="relative hidden lg:block">
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 to-purple-600/10 rounded-3xl blur-2xl" />
                            <div className="relative bg-white/5 border border-white/10 rounded-3xl p-2 shadow-2xl shadow-blue-900/20">
                                <Image
                                    src="/hero-contractor.png"
                                    alt="Contractor using SnapQuote on a job site"
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
                                <AnimatedCounter prefix="$" target={1} suffix=".99" />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Per estimate (pay-as-you-go)</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Pain Point Section */}
            <section className="py-20 px-6">
                <div className="max-w-4xl mx-auto text-center">
                    <h2 className="text-3xl md:text-4xl font-bold mb-6">
                        Sound familiar?
                    </h2>
                    <div className="grid md:grid-cols-3 gap-6 mt-12">
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-red-500/30 transition-colors">
                            <div className="text-4xl mb-4">🌙</div>
                            <h3 className="font-semibold text-lg mb-2">10 PM Paperwork</h3>
                            <p className="text-sm text-gray-400">Kids are asleep. You&apos;re still writing estimates on the kitchen table. Every. Single. Night.</p>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-red-500/30 transition-colors">
                            <div className="text-4xl mb-4">📱</div>
                            <h3 className="font-semibold text-lg mb-2">No Signal on Site</h3>
                            <p className="text-sm text-gray-400">Basement. Crawlspace. Rural job. Your &quot;cloud-based&quot; estimating app? Useless without WiFi.</p>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-red-500/30 transition-colors">
                            <div className="text-4xl mb-4">🗣️</div>
                            <h3 className="font-semibold text-lg mb-2">Lost in Translation</h3>
                            <p className="text-sm text-gray-400">Your skills are world-class. But writing professional English estimates? That&apos;s a different trade entirely.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* How It Works */}
            <section id="how-it-works" className="py-20 px-6 bg-gradient-to-b from-transparent via-blue-950/10 to-transparent">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <div className="text-sm text-blue-400 font-medium mb-3 uppercase tracking-wider">How It Works</div>
                        <h2 className="text-3xl md:text-4xl font-bold">
                            Three steps. Thirty seconds.
                            <br />
                            <span className="text-gray-400">That&apos;s it.</span>
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
                                <h3 className="text-xl font-bold mb-3">Speak</h3>
                                <p className="text-gray-400 text-sm leading-relaxed">
                                    Tap the mic. Describe the job in your own words — any language, any accent. Our AI understands plumbing, electrical, HVAC, and general contracting terms.
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
                                <h3 className="text-xl font-bold mb-3">AI Generates</h3>
                                <p className="text-gray-400 text-sm leading-relaxed">
                                    AI transforms your rough notes into a professional, itemized estimate — parts, labor, tax, totals — all formatted perfectly. Even with broken English.
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
                                <h3 className="text-xl font-bold mb-3">Send PDF</h3>
                                <p className="text-gray-400 text-sm leading-relaxed">
                                    Professional PDF with your logo, estimate number, and payment link — sent to your client via email or SMS. They see a pro. You get paid faster.
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
                            Built for dirty hands,
                            <br />
                            <span className="text-gray-400">not desk workers.</span>
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
                            <h3 className="font-bold text-lg mb-2">Voice-First</h3>
                            <p className="text-sm text-gray-400">Dirty hands? Just talk. Our AI understands trade terms, accents, and even broken English. No typing needed.</p>
                        </div>

                        {/* Feature 3 */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-blue-500/20 transition-all hover:-translate-y-1">
                            <div className="text-3xl mb-4">🌍</div>
                            <h3 className="font-bold text-lg mb-2">Any Language → Pro English</h3>
                            <p className="text-sm text-gray-400">Speak in Korean, Spanish, or any language. AI generates a perfect English estimate your clients will trust.</p>
                        </div>

                        {/* Feature 4 */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-blue-500/20 transition-all hover:-translate-y-1">
                            <div className="text-3xl mb-4">📄</div>
                            <h3 className="font-bold text-lg mb-2">Branded PDF</h3>
                            <p className="text-sm text-gray-400">Your logo. Your business name. Tax calculations. Payment link. Look like a $1M company without the $1M overhead.</p>
                        </div>

                        {/* Feature 5 */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-blue-500/20 transition-all hover:-translate-y-1">
                            <div className="text-3xl mb-4">🤖</div>
                            <h3 className="font-bold text-lg mb-2">Auto Follow-Up</h3>
                            <p className="text-sm text-gray-400">Clients ghost your estimate? SnapQuote reminds them automatically. Boost your close rate without lifting a finger.</p>
                        </div>

                        {/* Feature 6 */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-blue-500/20 transition-all hover:-translate-y-1">
                            <div className="text-3xl mb-4">💰</div>
                            <h3 className="font-bold text-lg mb-2">Payment Link on PDF</h3>
                            <p className="text-sm text-gray-400">Venmo, PayPal, Stripe — add your payment link and a &quot;PAY NOW&quot; button appears right on the estimate PDF.</p>
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
                            <h3 className="font-semibold text-lg">Dashboard</h3>
                            <p className="text-sm text-gray-400">Your command center. One tap to create.</p>
                        </div>
                        <div className="text-center">
                            <div className="bg-white/5 border border-white/10 rounded-3xl p-3 mb-4 hover:border-purple-500/30 transition-colors shadow-2xl shadow-purple-900/10">
                                <Image src="/app-screenshot-estimate.png" alt="SnapQuote Estimate" width={400} height={800} className="rounded-2xl w-full h-auto" />
                            </div>
                            <h3 className="font-semibold text-lg">Voice Estimate</h3>
                            <p className="text-sm text-gray-400">Tap, speak, done. 30 seconds or less.</p>
                        </div>
                        <div className="text-center">
                            <div className="bg-white/5 border border-white/10 rounded-3xl p-3 mb-4 hover:border-green-500/30 transition-colors shadow-2xl shadow-green-900/10">
                                <Image src="/app-screenshot-automation.png" alt="SnapQuote Automation" width={400} height={800} className="rounded-2xl w-full h-auto" />
                            </div>
                            <h3 className="font-semibold text-lg">Auto-Pilot</h3>
                            <p className="text-sm text-gray-400">AI bots follow up on your behalf.</p>
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
                                The Parking Lot Rule
                            </h2>
                            <p className="text-lg text-gray-300 mb-4 max-w-2xl mx-auto leading-relaxed">
                                When you park your truck at the end of the day, your work should be <strong className="text-white">done</strong>. Not &quot;mostly done.&quot; Not &quot;just a few estimates to write.&quot;
                            </p>
                            <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto leading-relaxed">
                                <strong className="text-white">Done.</strong> Dinner with your family. Bedtime with your kids. Weekend at the park. That&apos;s what SnapQuote is really about.
                            </p>
                            <p className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                                Don&apos;t take your work home.
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
                            Less than a cup of coffee.
                        </h2>
                        <p className="text-gray-400">Start free. Pay only when you love it.</p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-6">
                        {/* Free Tier */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
                            <h3 className="text-lg font-bold mb-1">Free</h3>
                            <p className="text-sm text-gray-400 mb-6">Try before you buy</p>
                            <div className="text-4xl font-bold mb-6">$0</div>
                            <ul className="space-y-3 text-sm text-gray-300">
                                <li className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    3 free estimates
                                </li>
                                <li className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    Voice input
                                </li>
                                <li className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    PDF generation
                                </li>
                                <li className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    Offline mode
                                </li>
                            </ul>
                            <Link href="/new-estimate" className="block mt-8 border border-white/10 hover:border-white/20 text-center py-3 rounded-xl text-sm font-medium transition-colors">
                                Get Started
                            </Link>
                        </div>

                        {/* Pay As You Go */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
                            <h3 className="text-lg font-bold mb-1">Pay As You Go</h3>
                            <p className="text-sm text-gray-400 mb-6">Perfect for occasional use</p>
                            <div className="text-4xl font-bold mb-1">$1.99</div>
                            <p className="text-sm text-gray-400 mb-6">per estimate</p>
                            <ul className="space-y-3 text-sm text-gray-300">
                                <li className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    Everything in Free
                                </li>
                                <li className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    Unlimited estimates
                                </li>
                                <li className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    Custom branding
                                </li>
                                <li className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    No commitment
                                </li>
                            </ul>
                            <Link href="/new-estimate" className="block mt-8 border border-white/10 hover:border-white/20 text-center py-3 rounded-xl text-sm font-medium transition-colors">
                                Start Now
                            </Link>
                        </div>

                        {/* Pro */}
                        <div className="relative bg-gradient-to-br from-blue-600/10 to-purple-600/10 border-2 border-blue-500/30 rounded-2xl p-8">
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-4 py-1 rounded-full">
                                MOST POPULAR
                            </div>
                            <h3 className="text-lg font-bold mb-1">Pro</h3>
                            <p className="text-sm text-gray-400 mb-6">For serious contractors</p>
                            <div className="text-4xl font-bold mb-1">$19</div>
                            <p className="text-sm text-gray-400 mb-6">per month</p>
                            <ul className="space-y-3 text-sm text-gray-300">
                                <li className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    Everything in PAYG
                                </li>
                                <li className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    <strong>Unlimited</strong> estimates
                                </li>
                                <li className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    Auto follow-ups
                                </li>
                                <li className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    Reputation Manager
                                </li>
                                <li className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    Priority support
                                </li>
                            </ul>
                            <Link href="/new-estimate" className="block mt-8 bg-blue-600 hover:bg-blue-500 text-center py-3 rounded-xl text-sm font-semibold transition-all hover:shadow-lg hover:shadow-blue-500/25">
                                Try Pro Free →
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
                            They get it.
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
                                &quot;I used to spend 2 hours every night on estimates. Now I do them in the parking lot before I drive home. My wife thinks I got a raise.&quot;
                            </p>
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center text-sm font-bold text-blue-400">M</div>
                                <div>
                                    <p className="text-sm font-medium">Mike R.</p>
                                    <p className="text-xs text-gray-500">Plumber, 12 years</p>
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
                                &quot;English is my second language. SnapQuote makes my estimates look like they were written by a native speaker. Clients trust me more now.&quot;
                            </p>
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-green-500/20 rounded-full flex items-center justify-center text-sm font-bold text-green-400">J</div>
                                <div>
                                    <p className="text-sm font-medium">Jin S.</p>
                                    <p className="text-xs text-gray-500">Electrician, 8 years</p>
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
                                &quot;I work in basements all day — no WiFi, no signal. SnapQuote is the only app that actually works where I work. Game changer.&quot;
                            </p>
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-purple-500/20 rounded-full flex items-center justify-center text-sm font-bold text-purple-400">D</div>
                                <div>
                                    <p className="text-sm font-medium">David L.</p>
                                    <p className="text-xs text-gray-500">HVAC Tech, 15 years</p>
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
                        Your estimate should take
                        <br />
                        <span className="bg-gradient-to-r from-blue-400 via-blue-500 to-purple-500 bg-clip-text text-transparent">30 seconds, not 30 minutes.</span>
                    </h2>
                    <p className="text-lg text-gray-400 mb-10 max-w-2xl mx-auto">
                        Join thousands of contractors who stopped taking work home. Your first 3 estimates are free.
                    </p>
                    <Link href="/new-estimate" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-10 py-5 rounded-2xl text-lg font-semibold transition-all hover:shadow-2xl hover:shadow-blue-500/30 hover:-translate-y-1">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                        Start Free — No Credit Card
                    </Link>
                    <p className="text-xs text-gray-600 mt-4">Works offline · Any language · 30-second setup</p>
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
                            <p className="text-sm text-gray-500">Dirty hands. Clean quotes.</p>
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
                            <h4 className="font-semibold mb-3 text-sm">Trades</h4>
                            <ul className="space-y-2 text-sm text-gray-500">
                                <li>Plumbing</li>
                                <li>Electrical</li>
                                <li>HVAC</li>
                                <li>General Contracting</li>
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
                        © {new Date().getFullYear()} SnapQuote. Built by a contractor, for contractors.
                    </div>
                </div>
            </footer>
        </div>
    )
}
