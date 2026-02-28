-- Add default_tax_rate column to profiles for Setup Wizard (TB-17)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_tax_rate numeric DEFAULT 0;
