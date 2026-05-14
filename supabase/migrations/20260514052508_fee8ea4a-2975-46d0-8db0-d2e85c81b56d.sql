-- Sequence for batch numbers
CREATE SEQUENCE IF NOT EXISTS public.bulk_download_batch_seq START 1;

-- Batches table
CREATE TABLE IF NOT EXISTS public.bulk_download_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_number integer NOT NULL DEFAULT nextval('public.bulk_download_batch_seq'),
  entry_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  label text
);

CREATE UNIQUE INDEX IF NOT EXISTS bulk_download_batches_batch_number_idx
  ON public.bulk_download_batches(batch_number);

ALTER TABLE public.bulk_download_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved admins manage bulk batches"
  ON public.bulk_download_batches
  FOR ALL
  TO authenticated
  USING (public.is_approved_admin(auth.uid()))
  WITH CHECK (public.is_approved_admin(auth.uid()));

-- Add batch tracking to staff_entries
ALTER TABLE public.staff_entries
  ADD COLUMN IF NOT EXISTS bulk_batch_number integer,
  ADD COLUMN IF NOT EXISTS bulk_downloaded_at timestamptz;

CREATE INDEX IF NOT EXISTS staff_entries_bulk_batch_number_idx
  ON public.staff_entries(bulk_batch_number);

-- Update protection trigger to allow public to update these tracking fields
CREATE OR REPLACE FUNCTION public.protect_staff_entry_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND public.is_approved_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.full_name IS DISTINCT FROM OLD.full_name
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.department IS DISTINCT FROM OLD.department
     OR NEW.company IS DISTINCT FROM OLD.company
     OR NEW.photo_url IS DISTINCT FROM OLD.photo_url
     OR NEW.id_card_url IS DISTINCT FROM OLD.id_card_url
     OR NEW.state IS DISTINCT FROM OLD.state
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'Only admins can modify staff entry details';
  END IF;

  IF OLD.download_locked = true AND NEW.download_locked = false THEN
    RAISE EXCEPTION 'Only admins can unlock downloads';
  END IF;

  RETURN NEW;
END;
$function$;