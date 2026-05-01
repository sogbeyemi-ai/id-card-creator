
-- Employees table
CREATE TABLE public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  verified_staff_id UUID,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  hire_date DATE,
  employment_type TEXT NOT NULL DEFAULT 'full_time',
  status TEXT NOT NULL DEFAULT 'active',
  department TEXT,
  role TEXT,
  bank_name TEXT,
  bank_account TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_employees_status ON public.employees(status);
CREATE INDEX idx_employees_verified_staff_id ON public.employees(verified_staff_id);
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage employees"
ON public.employees FOR ALL
TO authenticated
USING (public.is_approved_admin(auth.uid()))
WITH CHECK (public.is_approved_admin(auth.uid()));

CREATE TRIGGER update_employees_updated_at
BEFORE UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Salary structures
CREATE TABLE public.salary_structures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  base_salary NUMERIC(14,2) NOT NULL DEFAULT 0,
  transport_allowance NUMERIC(14,2) NOT NULL DEFAULT 0,
  housing_allowance NUMERIC(14,2) NOT NULL DEFAULT 0,
  other_allowance NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  pension_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_salary_structures_employee_id ON public.salary_structures(employee_id);
ALTER TABLE public.salary_structures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage salary structures"
ON public.salary_structures FOR ALL
TO authenticated
USING (public.is_approved_admin(auth.uid()))
WITH CHECK (public.is_approved_admin(auth.uid()));

-- Payroll runs
CREATE TABLE public.payroll_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_label TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  total_gross NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_net NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at TIMESTAMPTZ
);
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage payroll runs"
ON public.payroll_runs FOR ALL
TO authenticated
USING (public.is_approved_admin(auth.uid()))
WITH CHECK (public.is_approved_admin(auth.uid()));

-- Payroll items
CREATE TABLE public.payroll_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  gross_pay NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_allowances NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_pay NUMERIC(14,2) NOT NULL DEFAULT 0,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payroll_items_run_id ON public.payroll_items(run_id);
CREATE INDEX idx_payroll_items_employee_id ON public.payroll_items(employee_id);
ALTER TABLE public.payroll_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage payroll items"
ON public.payroll_items FOR ALL
TO authenticated
USING (public.is_approved_admin(auth.uid()))
WITH CHECK (public.is_approved_admin(auth.uid()));
