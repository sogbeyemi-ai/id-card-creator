-- Drop the restrictive policy that only allowed 'admin' role
DROP POLICY IF EXISTS "Admins can manage verified staff" ON public.verified_staff;

-- Recreate using is_approved_admin which accepts both admin and super_admin
CREATE POLICY "Approved admins can manage verified staff"
ON public.verified_staff
FOR ALL
TO authenticated
USING (public.is_approved_admin(auth.uid()))
WITH CHECK (public.is_approved_admin(auth.uid()));