-- Allow approved admins to delete staff entries (e.g. for removing duplicates)
CREATE POLICY "Approved admins can delete staff entries"
ON public.staff_entries
FOR DELETE
TO authenticated
USING (public.is_approved_admin(auth.uid()));