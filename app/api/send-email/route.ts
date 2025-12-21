import { NextResponse } from "next/server"

// Note: For production, you should use Resend, SendGrid, or similar service
// npm install resend && add RESEND_API_KEY to .env.local

export async function POST(req: Request) {
    try {
        const { email, subject, message, pdfBase64, businessName } = await req.json()

        if (!email || !email.includes("@")) {
            return NextResponse.json({ error: "Invalid email address" }, { status: 400 })
        }

        // Check if Resend API key is configured
        const resendApiKey = process.env.RESEND_API_KEY

        if (resendApiKey) {
            // Use Resend to send email with PDF attachment
            const response = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${resendApiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    from: `${businessName || "SnapQuote"} <estimates@snapquote.app>`,
                    to: [email],
                    subject: subject || "Your Estimate",
                    text: message,
                    attachments: pdfBase64 ? [
                        {
                            filename: "estimate.pdf",
                            content: pdfBase64,
                        }
                    ] : [],
                }),
            })

            if (!response.ok) {
                const error = await response.json()
                console.error("Resend error:", error)
                throw new Error("Failed to send email via Resend")
            }

            return NextResponse.json({ success: true, method: "resend" })
        } else {
            // Fallback: Return mailto link for client to open
            // This won't attach the PDF but at least opens the email client
            const mailtoUrl = `mailto:${email}?subject=${encodeURIComponent(subject || "Your Estimate")}&body=${encodeURIComponent(message)}`

            return NextResponse.json({
                success: true,
                method: "mailto",
                mailtoUrl,
                message: "Email client will open. Please attach the PDF manually."
            })
        }
    } catch (error) {
        console.error("Email send error:", error)
        return NextResponse.json(
            { error: "Failed to send email" },
            { status: 500 }
        )
    }
}
