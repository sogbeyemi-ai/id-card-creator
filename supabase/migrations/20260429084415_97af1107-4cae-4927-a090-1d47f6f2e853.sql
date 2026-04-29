-- Soft delete column for trash system
ALTER TABLE public.staff_entries
ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_staff_entries_deleted_at ON public.staff_entries(deleted_at);

-- Update protect trigger to allow admins to set/clear deleted_at,
-- and prevent non-admins from touching it.
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