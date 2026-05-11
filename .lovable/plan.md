## HR Data Sync — New Admin Module

A standalone enterprise-grade reconciliation tool added to the admin dashboard. It does **not** touch the existing ID Generator, Payroll module, or `verified_staff` data. It lives at `/admin/data-sync`.

### What admins can do

1. **Upload a Master Sheet** (.xlsx/.csv) — becomes the source of truth for a chosen "workspace" (e.g. a company). Headers + all rows are stored.
2. **Upload one or more Source Sheets** — Excel, CSV, or pasted Google Sheets link.
3. **System auto-maps headers** using fuzzy + alias dictionary (e.g. "Employee Name" → "Staff Name", "TIN" → "Tax ID"). Admin can override mappings.
4. **System auto-matches staff rows** by name using order-independent, case-insensitive, accent/space-tolerant fuzzy matching with a confidence score (Exact 100, Strong 80–99, Weak <70).
5. **Preview screen** shows: matched updates (diff per cell), unmatched source rows, and unchanged rows. Confidence badges on every match.
6. **Admin approves** the sync. Only matches ≥ chosen threshold (default 80) auto-apply. Weak matches require manual confirmation. Blank source values never overwrite existing master values.
7. **Unmatched records panel** — admin can pick a master row to merge into, mark as "new staff" (creates row), or skip.
8. **Sync history** with rollback (each sync snapshot keeps a "before" state).
9. **Export** updated master sheet as .xlsx.

### New admin route + nav

- `/admin/data-sync` — workspaces list + "New workspace"
- `/admin/data-sync/:workspaceId` — master grid, upload source, sync history
- `/admin/data-sync/:workspaceId/sync/:syncId` — preview + approve

Sidebar gets a new "Data Sync" entry. Existing nav stays untouched.

### Database (new tables only)

```text
sync_workspaces
  id, name, created_by, created_at, updated_at

sync_master_sheets
  id, workspace_id, file_name, headers jsonb, uploaded_at, uploaded_by

sync_master_rows
  id, workspace_id, data jsonb, name_key text (normalized), created_at, updated_at

sync_runs
  id, workspace_id, source_file_name, status (pending|previewed|applied|rolled_back),
  header_mapping jsonb, threshold int, created_by, created_at, applied_at

sync_run_items
  id, run_id, source_row jsonb, match_master_row_id (nullable),
  confidence numeric, decision text (auto_update|manual|new|skip|unmatched),
  diff jsonb, applied bool

sync_snapshots
  id, run_id, master_row_id, before jsonb, after jsonb
```

All tables protected by `is_approved_admin(auth.uid())` RLS, same pattern as existing admin tables.

### Edge functions

- `data-sync-parse` — receives uploaded file, parses with SheetJS, returns headers + rows.
- `data-sync-match` — given a run's source rows + workspace master, computes header alignment and per-row name matches with confidence. Saves `sync_run_items`.
- `data-sync-apply` — applies approved items, writing snapshots for rollback and updating `sync_master_rows`.
- `data-sync-rollback` — restores from `sync_snapshots`.
- `data-sync-export` — streams master sheet back as .xlsx.

### Matching internals

- **Header mapping**: alias dictionary + Levenshtein/Dice (string-similarity) + AI fallback via Lovable AI (`google/gemini-3-flash-preview`) for unresolved headers only (cheap, headers are <50 strings).
- **Name matching**: reuses the project's existing `normalizeName` + `nameMatchScore` helpers (already in `src/lib/nameMatch.ts`), extended with a token-set Dice fallback for spelling errors. Scores 0–100.
- **Blank protection**: skip source fields where value is empty/null/whitespace.

### Tech notes

- Frontend: React + shadcn, drag/drop via existing pattern, `xlsx` (already installed) for client preview parsing, server re-parses for safety.
- Confidence badges, Excel-style preview built with the existing Table component + virtualization only if a sheet exceeds 1k rows (keep simple first).
- Google Sheets import = "Paste public sheet URL" → server fetches the `export?format=xlsx` URL (no extra connector needed). If user wants private sheets later, we can add the Google Drive connector then.

### What is NOT in this first cut

- Scheduled syncs (cron) — wire later once flow is validated
- Multi-user audit beyond `created_by` per run
- Private Google Sheets via OAuth — only public/exported URLs for now

### Risk to existing system

**None.** New tables, new routes, new edge functions, new sidebar entry. No changes to ID generator, payroll, employees, or verified_staff.

---

Approve and I'll build it. If you want to trim (e.g. skip rollback, skip Google Sheets) say so and I'll cut accordingly.
