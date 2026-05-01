
-- Clients
CREATE TABLE public.payroll_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  currency TEXT NOT NULL DEFAULT 'NGN',
  default_column_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payroll_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage clients" ON public.payroll_clients
  FOR ALL TO authenticated
  USING (is_approved_admin(auth.uid()))
  WITH CHECK (is_approved_admin(auth.uid()));
CREATE TRIGGER trg_payroll_clients_updated
  BEFORE UPDATE ON public.payroll_clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Templates (one active per client, but allow versions)
CREATE TABLE public.payroll_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.payroll_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default',
  background_url TEXT NOT NULL,
  width INTEGER NOT NULL DEFAULT 800,
  height INTEGER NOT NULL DEFAULT 1100,
  field_layout JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payroll_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage templates" ON public.payroll_templates
  FOR ALL TO authenticated
  USING (is_approved_admin(auth.uid()))
  WITH CHECK (is_approved_admin(auth.uid()));
CREATE TRIGGER trg_payroll_templates_updated
  BEFORE UPDATE ON public.payroll_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_payroll_templates_client ON public.payroll_templates(client_id);

-- Cycles
CREATE TABLE public.payroll_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.payroll_clients(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.payroll_templates(id) ON DELETE SET NULL,
  period_label TEXT NOT NULL,
  period_start DATE,
  period_end DATE,
  status TEXT NOT NULL DEFAULT 'draft',
  source_file_url TEXT,
  column_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_rows INTEGER NOT NULL DEFAULT 0,
  total_generated INTEGER NOT NULL DEFAULT 0,
  zip_url TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payroll_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage cycles" ON public.payroll_cycles
  FOR ALL TO authenticated
  USING (is_approved_admin(auth.uid()))
  WITH CHECK (is_approved_admin(auth.uid()));
CREATE TRIGGER trg_payroll_cycles_updated
  BEFORE UPDATE ON public.payroll_cycles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_payroll_cycles_client ON public.payroll_cycles(client_id);

-- Rows
CREATE TABLE public.payroll_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES public.payroll_cycles(id) ON DELETE CASCADE,
  staff_name TEXT,
  staff_email TEXT,
  staff_id_number TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  pdf_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payroll_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage rows" ON public.payroll_rows
  FOR ALL TO authenticated
  USING (is_approved_admin(auth.uid()))
  WITH CHECK (is_approved_admin(auth.uid()));
CREATE TRIGGER trg_payroll_rows_updated
  BEFORE UPDATE ON public.payroll_rows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_payroll_rows_cycle ON public.payroll_rows(cycle_id);

-- Storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES ('payroll-templates', 'payroll-templates', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('payslips', 'payslips', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: payroll-templates (public read, admin write)
CREATE POLICY "Public can read template images"
ON storage.objects FOR SELECT
USING (bucket_id = 'payroll-templates');

CREATE POLICY "Admins can upload templates"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'payroll-templates' AND is_approved_admin(auth.uid()));

CREATE POLICY "Admins can update templates"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'payroll-templates' AND is_approved_admin(auth.uid()));

CREATE POLICY "Admins can delete templates"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'payroll-templates' AND is_approved_admin(auth.uid()));

-- Storage policies: payslips (admin-only)
CREATE POLICY "Admins can read payslips"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'payslips' AND is_approved_admin(auth.uid()));

CREATE POLICY "Admins can upload payslips"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'payslips' AND is_approved_admin(auth.uid()));

CREATE POLICY "Admins can update payslips"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'payslips' AND is_approved_admin(auth.uid()));

CREATE POLICY "Admins can delete payslips"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'payslips' AND is_approved_admin(auth.uid()));
