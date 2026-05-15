## Goal
Make the Data Sync "Download updated master" (and workspace master export) produce a polished, well-structured Excel file instead of a plain dump.

## Approach
Replace the current `xlsx` based `exportToXlsx` in `src/lib/dataSync.ts` with an **ExcelJS**-powered version. `xlsx` (SheetJS CE) has no real styling support; `exceljs` gives us colored headers, borders, alignment, frozen panes, auto-filter, and proper column widths — all client-side, no backend changes.

## What the new export will include

1. **Branded header row**
   - Bold white text on a deep navy fill (matches the app's corporate theme).
   - Centered, taller row height, thin border.
2. **Auto-sized columns**
   - Width based on the longest value in each column (capped, e.g. min 12 / max 50) so nothing is clipped and nothing is absurdly wide.
3. **Alignment & formatting**
   - Text columns: left-aligned, vertical middle, wrap text on.
   - Numeric columns (auto-detected): right-aligned with `#,##0.##` format.
   - Date-like values (ISO strings / Date objects): formatted as `yyyy-mm-dd`.
4. **Readability**
   - Frozen header row (`views: [{ state: 'frozen', ySplit: 1 }]`).
   - Auto-filter across the header range.
   - Subtle zebra striping on alternate body rows.
   - Thin light-gray borders on all used cells.
5. **Sheet metadata**
   - Sheet renamed to `Master` with a sensible workbook title/creator (`PROTEN ID Generator`).
   - File still saved via a Blob + `URL.createObjectURL` download (no behavior change for the caller).

## Files to change

- `src/lib/dataSync.ts` — rewrite `exportToXlsx` to use ExcelJS; keep the same signature `(headers, rows, fileName)` so `AdminDataSyncRun.tsx` and `AdminDataSyncWorkspace.tsx` keep working unchanged.
- `package.json` — add `exceljs` dependency.

## Out of scope
- Payroll export (the user noted payroll separately; not touching it here).
- Backend / edge functions.
- Any change to how data is fetched or matched.

## Acceptance
- Downloading the updated master from a Data Sync run yields an `.xlsx` that opens with: navy header bar, frozen + filterable header row, auto-sized columns, right-aligned numbers, formatted dates, zebra striping, and no clipped content.
