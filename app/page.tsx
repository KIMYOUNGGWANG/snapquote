"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Mic, FileText, History, Zap, ArrowRight, Shield, Clock, Send, DollarSign } from "lucide-react"

export default function Home() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-80px)] pb-20">
      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center text-center px-4 py-8 bg-gradient-to-b from-primary/5 to-transparent">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full text-primary text-xs font-medium mb-4">
          <Zap className="h-3 w-3" />
          For Contractors & Tradespeople
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
          SnapQuote
        </h1>

        <p className="text-muted-foreground text-sm max-w-xs mb-6">
          Speak your job details, get a <span className="text-primary font-semibold">professional estimate PDF</span> in seconds.
        </p>

        {/* Example Voice Input */}
        <div className="w-full max-w-sm mb-6">
          <p className="text-xs text-muted-foreground mb-2">💡 Just say something like:</p>
          <div className="bg-muted/50 border border-border rounded-xl p-4 text-left">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded-full shrink-0">
                <Mic className="h-4 w-4 text-primary" />
              </div>
              <p className="text-sm text-foreground italic">
                "Bathroom renovation, 50 sqft tile, toilet replacement, new faucet installation, labor 4 hours"
              </p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 mt-3 text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs">↓ 30 seconds later</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="mt-3 bg-green-500/10 border border-green-500/20 rounded-xl p-3">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <FileText className="h-4 w-4" />
              <span className="text-sm font-medium">Professional PDF Ready!</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Itemized parts, labor, taxes • Email to client instantly
            </p>
          </div>
        </div>

        <Link href="/new-estimate" className="w-full max-w-xs">
          <Button size="lg" className="w-full h-14 text-lg font-semibold gap-2 rounded-xl shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all">
            <Mic className="h-5 w-5" />
            Create Estimate
            <ArrowRight className="h-5 w-5 ml-auto" />
          </Button>
        </Link>
      </section>

      {/* How It Works - Simplified */}
      <section className="px-4 py-6">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">How It Works</h2>
        <div className="grid grid-cols-3 gap-2">
          <StepCard step="1" icon={<Mic className="h-4 w-4" />} label="Speak" />
          <StepCard step="2" icon={<Zap className="h-4 w-4" />} label="AI Generates" />
          <StepCard step="3" icon={<Send className="h-4 w-4" />} label="Send PDF" />
        </div>
      </section>

      {/* What You Get */}
      <section className="px-4 py-4">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">What You Get</h2>
        <div className="grid grid-cols-1 gap-2">
          <FeatureCard
            icon={<DollarSign className="h-5 w-5 text-green-500" />}
            title="Itemized Estimate"
            description="Parts, Labor, Service - clearly separated"
            color="green"
          />
          <FeatureCard
            icon={<FileText className="h-5 w-5 text-blue-500" />}
            title="Professional PDF"
            description="Your logo, tax calculation, estimate number"
            color="blue"
          />
          <FeatureCard
            icon={<Send className="h-5 w-5 text-amber-500" />}
            title="Instant Email"
            description="Send to clients with one tap"
            color="amber"
          />
        </div>
      </section>

      {/* Quick Start */}
      <section className="px-4 py-4 mt-auto">
        <Link href="/new-estimate" className="block">
          <Card className="border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary rounded-full">
                  <Mic className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <p className="font-semibold">Ready to create an estimate?</p>
                  <p className="text-sm text-muted-foreground">Tap here to start</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-primary" />
            </CardContent>
          </Card>
        </Link>
      </section>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
  color
}: {
  icon: React.ReactNode
  title: string
  description: string
  color: "blue" | "green" | "amber"
}) {
  const bgColors = {
    blue: "bg-blue-500/10",
    green: "bg-green-500/10",
    amber: "bg-amber-500/10"
  }

  return (
    <Card className="border-0 shadow-none bg-muted/30">
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`p-2.5 rounded-lg ${bgColors[color]}`}>
          {icon}
        </div>
        <div>
          <p className="font-medium text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function StepCard({
  step,
  icon,
  label
}: {
  step: string
  icon: React.ReactNode
  label: string
}) {
  return (
    <Card className="border-0 shadow-none bg-muted/30">
      <CardContent className="flex flex-col items-center justify-center p-3 gap-1">
        <div className="text-xs text-muted-foreground">Step {step}</div>
        <div className="p-2 bg-primary/10 rounded-full text-primary">{icon}</div>
        <span className="text-xs font-medium text-foreground">{label}</span>
      </CardContent>
    </Card>
  )
}
