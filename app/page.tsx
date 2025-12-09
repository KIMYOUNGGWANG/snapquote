"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Camera, FileText, History, Zap, ArrowRight, Shield, Clock } from "lucide-react"

export default function Home() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-80px)] pb-20">
      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center text-center px-4 py-12 bg-gradient-to-b from-primary/5 to-transparent">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full text-primary text-sm font-medium mb-6">
          <Zap className="h-4 w-4" />
          AI-Powered Estimates
        </div>

        <h1 className="text-4xl font-bold tracking-tight text-foreground mb-4">
          SnapQuote
        </h1>

        <p className="text-muted-foreground text-lg max-w-md mb-8">
          Take a photo. Get a professional estimate in <span className="text-primary font-semibold">30 seconds</span>.
        </p>

        <Link href="/new-estimate" className="w-full max-w-xs">
          <Button size="lg" className="w-full h-14 text-lg font-semibold gap-2 rounded-xl shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all">
            <Camera className="h-5 w-5" />
            New Estimate
            <ArrowRight className="h-5 w-5 ml-auto" />
          </Button>
        </Link>
      </section>

      {/* Features Section */}
      <section className="px-4 py-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">How It Works</h2>
        <div className="grid grid-cols-1 gap-3">
          <FeatureCard
            icon={<Camera className="h-5 w-5 text-blue-500" />}
            title="1. Snap a Photo"
            description="Take a picture of the job site or issue"
            color="blue"
          />
          <FeatureCard
            icon={<FileText className="h-5 w-5 text-green-500" />}
            title="2. Add Notes (Optional)"
            description="Type or record a quick voice memo"
            color="green"
          />
          <FeatureCard
            icon={<Zap className="h-5 w-5 text-amber-500" />}
            title="3. Generate & Share"
            description="AI creates a professional PDF estimate"
            color="amber"
          />
        </div>
      </section>

      {/* Stats Section */}
      <section className="px-4 py-6">
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={<Clock className="h-5 w-5" />} value="30s" label="Avg. Time" />
          <StatCard icon={<FileText className="h-5 w-5" />} value="PDF" label="Export" />
          <StatCard icon={<Shield className="h-5 w-5" />} value="Pro" label="Quality" />
        </div>
      </section>

      {/* Quick Actions */}
      <section className="px-4 py-4 mt-auto">
        <div className="grid grid-cols-2 gap-3">
          <Link href="/new-estimate">
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
              <CardContent className="flex flex-col items-center justify-center p-4 gap-2">
                <div className="p-3 bg-primary/10 rounded-full">
                  <Camera className="h-6 w-6 text-primary" />
                </div>
                <span className="font-medium text-sm">New Estimate</span>
              </CardContent>
            </Card>
          </Link>
          <Link href="/history">
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
              <CardContent className="flex flex-col items-center justify-center p-4 gap-2">
                <div className="p-3 bg-muted rounded-full">
                  <History className="h-6 w-6 text-muted-foreground" />
                </div>
                <span className="font-medium text-sm">History</span>
              </CardContent>
            </Card>
          </Link>
        </div>
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

function StatCard({
  icon,
  value,
  label
}: {
  icon: React.ReactNode
  value: string
  label: string
}) {
  return (
    <Card className="border-0 shadow-none bg-muted/30">
      <CardContent className="flex flex-col items-center justify-center p-4 gap-1">
        <div className="text-muted-foreground mb-1">{icon}</div>
        <span className="text-xl font-bold text-foreground">{value}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </CardContent>
    </Card>
  )
}
