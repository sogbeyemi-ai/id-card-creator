-- Add timestamp tracking for first download
ALTER TABLE public.staff_entries
ADD COLUMN IF NOT EXISTS downloaded_at TIMESTAMP WITH TIME ZONE;

-- Backfill: rows with download_count > 0 but no downloaded_at get updated_at as best estimate
UPDATE public.staff_entries
SET downloaded_at = updated_at
WHERE download_count > 0 AND downloaded_at IS NULL;

-- Index for fast filtering/sorting in admin dashboard
CREATE INDEX IF NOT EXISTS idx_staff_entries_created_at ON public.staff_entries (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_entries_downloaded_at ON public.staff_entries (downloaded_at DESC);

-- Index for fast verified_staff lookups by name
CREATE INDEX IF NOT EXISTS idx_verified_staff_full_name ON public.verified_staff (full_name);