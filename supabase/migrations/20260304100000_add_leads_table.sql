-- TB-23: Leads table for Free AI Estimator Lead Gen Tool

CREATE TABLE IF NOT EXISTS public.leads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL DEFAULT 'free_estimator_v1',
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Allow anonymous inserts (public lead capture form)
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous insert" ON public.leads
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- Allow service role full access
CREATE POLICY "Service role full access" ON public.leads
    FOR ALL
    TO service_role
    USING (true);

-- Index for fast lookups by email
CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads (email);

-- Index for analytics queries by source
CREATE INDEX IF NOT EXISTS idx_leads_source ON public.leads (source);
