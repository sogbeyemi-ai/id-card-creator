
-- Add status column to user_roles
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';

-- Drop old RLS policies on user_roles and recreate
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;

-- Create a function to check super_admin (will use text comparison until enum is ready)
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = 'super_admin'
  )
$$;

-- Create a function to check approved admin
CREATE OR REPLACE FUNCTION public.is_approved_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text IN ('admin', 'super_admin') AND status = 'approved'
  )
$$;

-- Super admin or approved admin can view roles
CREATE POLICY "Approved admins can view roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.is_approved_admin(auth.uid()));

-- Only super admin can update/delete roles
CREATE POLICY "Super admin can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Anyone authenticated can insert their own pending role request
CREATE POLICY "Users can request admin role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() AND role = 'admin' AND status = 'pending');
