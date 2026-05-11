
CREATE TABLE public.sync_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sync_workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage sync workspaces" ON public.sync_workspaces
  FOR ALL TO authenticated
  USING (is_approved_admin(auth.uid()))
  WITH CHECK (is_approved_admin(auth.uid()));

CREATE TABLE public.sync_master_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sync_workspaces(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  headers jsonb NOT NULL DEFAULT '[]'::jsonb,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid
);
ALTER TABLE public.sync_master_sheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage sync master sheets" ON public.sync_master_sheets
  FOR ALL TO authenticated
  USING (is_approved_admin(auth.uid()))
  WITH CHECK (is_approved_admin(auth.uid()));

CREATE TABLE public.sync_master_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sync_workspaces(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  name_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sync_master_rows_workspace ON public.sync_master_rows(workspace_id);
CREATE INDEX idx_sync_master_rows_name_key ON public.sync_master_rows(name_key);
ALTER TABLE public.sync_master_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage sync master rows" ON public.sync_master_rows
  FOR ALL TO authenticated
  USING (is_approved_admin(auth.uid()))
  WITH CHECK (is_approved_admin(auth.uid()));

CREATE TABLE public.sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sync_workspaces(id) ON DELETE CASCADE,
  source_file_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  header_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  threshold integer NOT NULL DEFAULT 80,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);
CREATE INDEX idx_sync_runs_workspace ON public.sync_runs(workspace_id);
ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage sync runs" ON public.sync_runs
  FOR ALL TO authenticated
  USING (is_approved_admin(auth.uid()))
  WITH CHECK (is_approved_admin(auth.uid()));

CREATE TABLE public.sync_run_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.sync_runs(id) ON DELETE CASCADE,
  source_row jsonb NOT NULL DEFAULT '{}'::jsonb,
  match_master_row_id uuid,
  confidence numeric NOT NULL DEFAULT 0,
  decision text NOT NULL DEFAULT 'unmatched',
  diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sync_run_items_run ON public.sync_run_items(run_id);
ALTER TABLE public.sync_run_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage sync run items" ON public.sync_run_items
  FOR ALL TO authenticated
  USING (is_approved_admin(auth.uid()))
  WITH CHECK (is_approved_admin(auth.uid()));

CREATE TABLE public.sync_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.sync_runs(id) ON DELETE CASCADE,
  master_row_id uuid,
  before jsonb NOT NULL DEFAULT '{}'::jsonb,
  after jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sync_snapshots_run ON public.sync_snapshots(run_id);
ALTER TABLE public.sync_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage sync snapshots" ON public.sync_snapshots
  FOR ALL TO authenticated
  USING (is_approved_admin(auth.uid()))
  WITH CHECK (is_approved_admin(auth.uid()));

CREATE TRIGGER trg_sync_workspaces_updated
  BEFORE UPDATE ON public.sync_workspaces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_sync_master_rows_updated
  BEFORE UPDATE ON public.sync_master_rows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
