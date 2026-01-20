import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
    return (
        <div className="container mx-auto px-4 py-8 max-w-3xl">
            <Link href="/profile">
                <Button variant="ghost" className="mb-6 pl-0 hover:pl-0">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Profile
                </Button>
            </Link>

            <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
            <p className="text-sm text-gray-500 mb-8">Last updated: {new Date().toLocaleDateString()}</p>

            <div className="prose dark:prose-invert max-w-none space-y-6">
                <section>
                    <h2 className="text-xl font-semibold mb-2">1. Information We Collect</h2>
                    <p>
                        We collect information you provide directly to us, such as when you create an account, create an estimate, or communicate with us. This may include your business name, email address, and transaction data.
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-2">2. How We Use Information</h2>
                    <p>
                        We use the information we collect to operate, maintain, and improve our services, including AI estimate generation and data synchronization.
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-2">3. Data Sharing</h2>
                    <p>
                        We do not share your personal information with third parties except as described in this policy (e.g., with Stripe for payment processing) or required by law.
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-2">4. Data Security</h2>
                    <p>
                        We take reasonable measures to help protect information about you from loss, theft, misuse and unauthorized access.
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-2">5. Changes to this Policy</h2>
                    <p>
                        We may update this privacy policy from time to time. If we make changes, we will notify you by revising the date at the top of the policy.
                    </p>
                </section>
            </div>
        </div>
    );
}
