import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Pricing for Plumbing Owner-Operators",
    description: "Compare Starter, Pro, and Team plans for plumbing owner-operators who need faster on-site quoting, follow-up, and payment collection.",
    openGraph: {
        title: "SnapQuote Pricing for Plumbing Owner-Operators",
        description: "Choose the quoting workflow that fits your truck, service-call volume, and crew size.",
    },
}

export default function PricingLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return children
}
