## Goal

Two fixes to **Data Sync** so the master sheet stays stable:

1. **Master row order is fixed.** Rows always appear in the exact order they were uploaded (Excel row 1 stays row 1, row 2 stays row 2, etc.). Never alphabetised, never reshuffled, even after syncs.
2. **Master's staff name is the source of truth.** When syncing another sheet into the master, the name column in the master is **never overwritten** by the source. Other fields (phone, bank, role, etc.) still update normally — only the name is locked.

---

## 1. Fix master row order

**Problem today**: `sync_master_rows` has no explicit ordering column. The UI fetches rows with `.range(...)` and no `.order(...)`, so Postgres can return them in any order — which is why your master appears reshuffled.

**Fix**: add a `row_order` integer column to `sync_master_rows`, populate it on upload in upload order (1, 2, 3, …), and order by it everywhere rows are read or exported.

- **Migration**: add `row_order int` column, backfill existing rows using `created_at` so current masters keep a stable order, add an index on `(workspace_id, row_order)`.
- **Edge function `data-sync-master-upload`**: when inserting rows, set `row_order` to the row's position in the uploaded file (starting at 1). When `replace = true`, ordering restarts from 1.
- **Edge function `data-sync-apply`**: when a `"new"` row is created during a sync, assign `row_order = max(row_order) + 1` for that workspace so it appends to the bottom of the master.
- **Frontend** (`AdminDataSyncWorkspace.tsx`, `AdminDataSyncRun.tsx`): every `sync_master_rows` read uses `.order("row_order", { ascending: true })`. Excel export ("Export" and "Download updated master") iterates in the same order.

Result: whatever order the master was uploaded in is the order you see on screen and in every downloaded `.xlsx` — top to bottom, no alphabetising.

---

## 2. Protect master's staff name during sync

**Problem today**: `data-sync-apply` loops over every mapped header and overwrites the master cell with the source cell — including the name column. So if the source spells the name slightly differently, the master gets rewritten.

**Fix**: in `data-sync-apply`, skip the name column when copying source values onto the matched master row.

- Detect the master's name field using the same alias list already in the file (`full name`, `name`, `staff name`, `employee name`, `fullname`).
- When applying an `apply` / `merge` decision: for each `[sourceHeader → masterHeader]` mapping, **if `masterHeader` is the name field, skip it**. All other fields still update as before.
- The `diff` shown in the review screen (`AdminDataSyncRun.tsx`) should also drop name-column entries so users don't see a "name change" proposed that won't actually happen. Done in `data-sync-match` by skipping the name field when building `diff`.
- `"new"` rows (brand-new staff not in master) are unaffected — they still get the source name, since there's no master name to protect.
- `name_key` on the master row is **not** recomputed during apply (it stays based on the original master name), so future matching keeps using the locked master name.

Result: master's staff name column is read-only from the sync's perspective. Sync only fills in / updates the **other** columns for that person.

---

## Technical notes

- **Schema change**: `ALTER TABLE sync_master_rows ADD COLUMN row_order int;` + backfill + index.
- **Files edited**:
  - `supabase/functions/data-sync-master-upload/index.ts` — write `row_order` on insert.
  - `supabase/functions/data-sync-match/index.ts` — exclude name field from generated `diff`.
  - `supabase/functions/data-sync-apply/index.ts` — exclude name field from updates; assign `row_order` for new rows.
  - `src/pages/AdminDataSyncWorkspace.tsx` — order master query + export by `row_order`.
  - `src/pages/AdminDataSyncRun.tsx` — order master query + "Download updated master" by `row_order`.
- No new secrets, no UI redesign — purely behavioural fixes.

## Out of scope

- Manual reordering / drag-and-drop of master rows (not requested).
- Locking other master columns (only the name is protected, per your request).
- Re-ordering historical masters that were uploaded before this change — they'll be ordered by `created_at` after the backfill, which matches their original upload sequence.
