
CREATE TABLE public.nin_extraction_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_url text NOT NULL,
  sheet_title text,
  image_column text NOT NULL,
  name_column text,
  total_rows integer NOT NULL DEFAULT 0,
  extracted_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.nin_extraction_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.nin_extraction_batches(id) ON DELETE CASCADE,
  row_index integer NOT NULL,
  image_url text NOT NULL,
  resolved_image_url text,
  full_name text,
  nin text,
  raw_text text,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_nin_rows_batch ON public.nin_extraction_rows(batch_id);
CREATE INDEX idx_nin_rows_status ON public.nin_extraction_rows(status);

ALTER TABLE public.nin_extraction_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nin_extraction_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved admins manage nin batches"
  ON public.nin_extraction_batches FOR ALL TO authenticated
  USING (public.is_approved_admin(auth.uid()))
  WITH CHECK (public.is_approved_admin(auth.uid()));

CREATE POLICY "Approved admins manage nin rows"
  ON public.nin_extraction_rows FOR ALL TO authenticated
  USING (public.is_approved_admin(auth.uid()))
  WITH CHECK (public.is_approved_admin(auth.uid()));

CREATE TRIGGER nin_batches_updated_at
  BEFORE UPDATE ON public.nin_extraction_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER nin_rows_updated_at
  BEFORE UPDATE ON public.nin_extraction_rows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
