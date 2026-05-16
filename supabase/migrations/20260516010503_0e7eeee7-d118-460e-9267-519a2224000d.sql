
CREATE TABLE public.bank_verification_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  uploaded_by uuid,
  total_rows integer NOT NULL DEFAULT 0,
  verified_count integer NOT NULL DEFAULT 0,
  mismatch_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.bank_verification_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.bank_verification_batches(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  account_number text NOT NULL,
  bank_name text,
  bank_code text,
  expected_account_name text,
  resolved_account_name text,
  status text NOT NULL DEFAULT 'pending',
  similarity numeric,
  error_message text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bank_rows_batch ON public.bank_verification_rows(batch_id);
CREATE INDEX idx_bank_rows_status ON public.bank_verification_rows(status);
CREATE UNIQUE INDEX idx_bank_rows_dedupe ON public.bank_verification_rows(batch_id, account_number, bank_code);

ALTER TABLE public.bank_verification_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_verification_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved admins manage bank batches"
  ON public.bank_verification_batches FOR ALL TO authenticated
  USING (public.is_approved_admin(auth.uid()))
  WITH CHECK (public.is_approved_admin(auth.uid()));

CREATE POLICY "Approved admins manage bank rows"
  ON public.bank_verification_rows FOR ALL TO authenticated
  USING (public.is_approved_admin(auth.uid()))
  WITH CHECK (public.is_approved_admin(auth.uid()));

CREATE TRIGGER update_bank_batches_updated_at
  BEFORE UPDATE ON public.bank_verification_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
