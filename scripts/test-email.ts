
import { Resend } from 'resend';
import fs from 'fs';
import path from 'path';

// Load env from .env.local manually
const envPath = path.resolve(process.cwd(), '.env.local');
let apiKey = process.env.RESEND_API_KEY;

if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    const match = envConfig.match(/RESEND_API_KEY=(.+)/);
    if (match && match[1]) {
        apiKey = match[1].trim();
    }
}

if (!apiKey) {
    console.error("❌ No RESEND_API_KEY found in .env.local or process.env");
    process.exit(1);
}

console.log(`🔑 Using Key: ${apiKey.slice(0, 5)}...`);

const resend = new Resend(apiKey);

(async () => {
    try {
        console.log("📨 Attempting to send email...");
        const data = await resend.emails.send({
            from: 'SnapQuote <onboarding@resend.dev>', // Current setting
            to: ['snapquote_user@example.com'], // Arbitrary email
            subject: 'Test Email from SnapQuote Debugger',
            html: '<p>If you see this, sending works!</p>'
        });

        if (data.error) {
            console.error("❌ API Error:", data.error);
        } else {
            console.log("✅ Success! Data:", data);
        }
    } catch (e: unknown) {
        console.error("❌ Exception caught:", e instanceof Error ? e.message : e);
        const response = typeof e === "object" && e !== null && "response" in e ? e.response : undefined;
        if (typeof response === "object" && response !== null && "data" in response) {
            console.error("Response:", response.data);
        }
    }
})();
