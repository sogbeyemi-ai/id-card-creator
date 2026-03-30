
-- Create enum for company templates
CREATE TYPE public.company_template AS ENUM ('SOTI', 'OPAY', 'Blue Ridge');

-- Create staff_entries table
CREATE TABLE public.staff_entries (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL,
    department TEXT NOT NULL,
    company company_template NOT NULL,
    photo_url TEXT NOT NULL,
    id_card_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.staff_entries ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (public form)
CREATE POLICY "Anyone can submit staff entry" ON public.staff_entries FOR INSERT WITH CHECK (true);

-- Allow anyone to read staff entries
CREATE POLICY "Anyone can read staff entries" ON public.staff_entries FOR SELECT USING (true);

-- Create storage bucket for photos
INSERT INTO storage.buckets (id, name, public) VALUES ('staff-photos', 'staff-photos', true);

-- Storage policies
CREATE POLICY "Anyone can upload staff photos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'staff-photos');
CREATE POLICY "Staff photos are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'staff-photos');

-- Timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_staff_entries_updated_at
    BEFORE UPDATE ON public.staff_entries
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
