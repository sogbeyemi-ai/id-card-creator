
ALTER TABLE public.sync_master_rows ADD COLUMN IF NOT EXISTS row_order integer;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY workspace_id ORDER BY created_at, id) AS rn
  FROM public.sync_master_rows
  WHERE row_order IS NULL
)
UPDATE public.sync_master_rows m
SET row_order = ordered.rn
FROM ordered
WHERE m.id = ordered.id;

CREATE INDEX IF NOT EXISTS idx_sync_master_rows_workspace_order
  ON public.sync_master_rows (workspace_id, row_order);
