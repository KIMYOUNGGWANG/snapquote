import { NextResponse } from 'next/server';
import { Resend } from 'resend';

export async function POST(req: Request) {
    try {
        const { to, subject, pdfBuffer, filename, clientName } = await req.json();

        if (!process.env.RESEND_API_KEY) {
            return NextResponse.json({ error: "RESEND_API_KEY is missing" }, { status: 500 });
        }

        // Initialize Resend lazily to avoid build-time errors
        const resend = new Resend(process.env.RESEND_API_KEY);

        // Since we can't easily pass Buffer/Blob from client to server directly in JSON without base64,
        // we expect 'pdfBuffer' to be a base64 encoded string of the PDF.

        if (!to || !pdfBuffer) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const buffer = Buffer.from(pdfBuffer, 'base64');

        const data = await resend.emails.send({
            from: 'SnapQuote <onboarding@resend.dev>', // Update this with verified domain later
            to: [to],
            subject: subject || 'Your Estimate from SnapQuote',
            html: `
        <h1>Estimate for ${clientName || 'Valued Client'}</h1>
        <p>Please find attached your estimate.</p>
        <p>Thank you for your business!</p>
      `,
            attachments: [
                {
                    filename: filename || 'Estimate.pdf',
                    content: buffer,
                },
            ],
        });

        return NextResponse.json(data);
    } catch (error) {
        console.error('Email send error:', error);
        return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
    }
}
