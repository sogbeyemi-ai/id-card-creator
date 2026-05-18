## Goal
Two improvements to **NIN Extraction**:
1. Download results as a **styled Excel file** (same look as Data Sync export), not plain CSV.
2. **Deduplicate by staff name** on upload — keep only the last (most recent) row per name that has an image link.

---

## 1. Styled Excel download

Replace the current CSV download on `/admin/nin-extraction` with a polished `.xlsx` export that matches the Data Sync look:

- Frozen header row, navy header background, white bold text
- Auto-filter on all columns, zebra striping
- NIN column forced to **text format** so the 11 digits never display as scientific notation
- Auto-sized columns
- Filename: `nin-extraction-{label}-{YYYY-MM-DD}.xlsx`

**Columns**: `Row #`, `Full Name`, `NIN`, `Status` (Extracted / No NIN found / Failed / Pending), `Error / Reason`, `Image URL`.

Applies to both the **active batch** download and the **history "Download"** action.

CSV fallback removed (XLSX is the only export). Reuses the existing `exportToXlsx` helper in `src/lib/dataSync.ts` — no new dependency.

---

## 2. Dedupe by staff name (keep last row with a link)

When a sheet is uploaded / pulled from Google Sheets and the user clicks **"Start extraction"**, before creating rows in the database:

- Group rows by **trimmed, case-insensitive full name**
- For each name, keep only the **last row** (bottom-most in the sheet) that has a non-empty image link
- Rows with no name column selected, or with empty names, are kept as-is (no grouping)
- Show a small notice: *"Removed N duplicate name(s). Kept the most recent submission for each staff."*

**Where this happens**: in the edge function `nin-extract` inside the `create_batch` action, right after parsing `dataRows` and before inserting into `nin_extraction_rows`. This keeps the logic server-side so any future ingest path benefits too. The function returns `{ batch_id, total, duplicates_removed }` so the UI can show the notice.

**Preview action** also reports a `duplicates` count so users see the impact before committing.

---

## Technical notes
- Frontend: `src/pages/AdminNinExtraction.tsx` — swap `download CSV` handlers for an `exportToXlsx` call; surface the new `duplicates_removed` toast.
- Backend: `supabase/functions/nin-extract/index.ts` — add a `dedupeByName(rows, nameIdx, imgIdx)` helper, apply in `create_batch` and report counts in `preview`.
- No schema changes, no new secrets.

## Out of scope
- Fuzzy name matching (you chose exact, case-insensitive).
- Dedup on already-saved historical batches (only applies to new uploads).
