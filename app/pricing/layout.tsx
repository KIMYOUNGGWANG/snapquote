import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Pricing for Trade Owner-Operators",
    description: "Compare Starter, Pro, and Team plans for trade owner-operators who need faster on-site quoting, follow-up, and payment collection.",
    openGraph: {
        title: "SnapQuote Pricing for Trade Owner-Operators",
        description: "Choose the quoting workflow that fits your service-call volume and crew size.",
    },
}

export default function PricingLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return children
}
