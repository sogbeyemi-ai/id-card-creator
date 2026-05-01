ALTER TABLE public.payroll_templates
  ADD COLUMN IF NOT EXISTS template_kind text NOT NULL DEFAULT 'coordinate';

ALTER TABLE public.payroll_cycles
  ADD COLUMN IF NOT EXISTS pay_date date;