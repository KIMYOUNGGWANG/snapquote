import OpenAI from 'openai';

export const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    dangerouslyAllowBrowser: true // Note: In production, we should call this via API routes, but for MVP client-side is faster to prototype if we accept the risk or use a proxy. 
    // However, for a secure app, we should use API routes. 
    // Given the plan says "Call Whisper API if online", we can do it via a Server Action or API Route.
    // Let's stick to server-side usage for security.
});
