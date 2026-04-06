-- Allow admins to delete verified_staff records (for batch deletion)
CREATE POLICY "Admins can delete verified staff"
ON public.verified_staff
FOR DELETE
TO authenticated
USING (is_approved_admin(auth.uid()));
