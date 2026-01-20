import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function TermsPage() {
    return (
        <div className="container mx-auto px-4 py-8 max-w-3xl">
            <Link href="/profile">
                <Button variant="ghost" className="mb-6 pl-0 hover:pl-0">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Profile
                </Button>
            </Link>

            <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
            <p className="text-sm text-gray-500 mb-8">Last updated: {new Date().toLocaleDateString()}</p>

            <div className="prose dark:prose-invert max-w-none space-y-6">
                <section>
                    <h2 className="text-xl font-semibold mb-2">1. Introduction</h2>
                    <p>
                        Welcome to SnapQuote. By using our application, you agree to these Terms of Service.
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-2">2. Use of Service</h2>
                    <p>
                        SnapQuote allows tradespeople to generate and manage estimates. You are responsible for the accuracy of the data entered and the estimates generated.
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-2">3. Payments</h2>
                    <p>
                        Some features may require payment. Payments are processed securely via Stripe. We do not store your full credit card information.
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-2">4. AI disclaimer</h2>
                    <p>
                        Estimates are generated using Artificial Intelligence. While we strive for accuracy, you must always review and verify estimates before sending them to clients. SnapQuote is not liable for errors in AI-generated content.
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-2">5. Termination</h2>
                    <p>
                        We reserve the right to terminate or suspend access to our service immediately, without prior notice or liability, for any reason whatsoever.
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-2">6. Contact Us</h2>
                    <p>
                        If you have any questions about these Terms, please contact us.
                    </p>
                </section>
            </div>
        </div>
    );
}
