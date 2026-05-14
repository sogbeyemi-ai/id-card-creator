-- Tighten staff_entries UPDATE access: split admin path from public-anon path.
DROP POLICY IF EXISTS "Public can update download tracking only" ON public.staff_entries;

-- Admins (authenticated, approved) can update freely; trigger still allows full edits.
CREATE POLICY "Approved admins can update staff entries"
  ON public.staff_entries
  FOR UPDATE
  TO authenticated
  USING (public.is_approved_admin(auth.uid()))
  WITH CHECK (public.is_approved_admin(auth.uid()));

-- Anonymous staff can update only their own row's download tracking columns.
-- Column-level protection is enforced by the protect_staff_entry_columns trigger,
-- because RLS WITH CHECK cannot compare NEW vs OLD.
CREATE POLICY "Anon can update download tracking"
  ON public.staff_entries
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);