-- 1. Fix has_role to require approved status (closes privilege escalation)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND status = 'approved'
  )
$$;

-- 2. Restrict download_logs SELECT to admins only
DROP POLICY IF EXISTS "Anyone can read download logs" ON public.download_logs;

CREATE POLICY "Admins can read download logs"
ON public.download_logs
FOR SELECT
TO authenticated
USING (public.is_approved_admin(auth.uid()));

-- 3. Restrict public UPDATE on staff_entries to only download-tracking columns
DROP POLICY IF EXISTS "Anyone can update download count" ON public.staff_entries;

-- Public can update only download tracking fields, and only to lock (not unlock)
CREATE POLICY "Public can update download tracking only"
ON public.staff_entries
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Trigger to prevent public users from modifying anything other than download tracking columns
CREATE OR REPLACE FUNCTION public.protect_staff_entry_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Allow approved admins to update anything
  IF auth.uid() IS NOT NULL AND public.is_approved_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- For everyone else (including anon), only allow changes to download tracking columns
  IF NEW.full_name IS DISTINCT FROM OLD.full_name
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.department IS DISTINCT FROM OLD.department
     OR NEW.company IS DISTINCT FROM OLD.company
     OR NEW.photo_url IS DISTINCT FROM OLD.photo_url
     OR NEW.id_card_url IS DISTINCT FROM OLD.id_card_url
     OR NEW.state IS DISTINCT FROM OLD.state
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Only admins can modify staff entry details';
  END IF;

  -- Prevent unlocking by non-admins
  IF OLD.download_locked = true AND NEW.download_locked = false THEN
    RAISE EXCEPTION 'Only admins can unlock downloads';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_staff_entry_columns_trigger ON public.staff_entries;
CREATE TRIGGER protect_staff_entry_columns_trigger
BEFORE UPDATE ON public.staff_entries
FOR EACH ROW
EXECUTE FUNCTION public.protect_staff_entry_columns();