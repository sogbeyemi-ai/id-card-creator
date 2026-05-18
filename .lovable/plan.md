## Goal
Make NIN extractions persistent and revisitable, and explain why some rows fail.

## 1. Saved extractions (history)
Batches and rows are already stored in the database — we just don't show past ones. Add a **"Saved extractions"** section to `/admin/nin-extraction` that lists every prior batch.

For each batch row in the list:
- Date, source label (sheet title / uploaded file name), totals: extracted / failed / pending
- **Open** → loads that batch into the existing results table (reuses current UI: re-process pending, re-download CSV, search/filter)
- **Download CSV** → one-click export without opening
- **Rename** → editable label so users can find batches later (e.g. "May payroll NINs")
- **Delete** → removes batch + its rows

Layout: collapsible "Saved extractions" card above the source-sheet card, sorted by newest first, with a search box for label/date.

## 2. Failure reasons (why some didn't extract)
The edge function already writes a reason to `error_message` and uses two statuses (`failed` vs `no_nin_found`), but the UI lumps them together as "Failed". Improve this:

- Split the stats badge into **Failed** (image couldn't be fetched / OCR errored) and **No NIN found** (image was read but no 11-digit number was present — usually means the uploaded image was not an actual NIN slip, was blurry, or was a different ID type).
- Add a **"Why did this fail?"** helper panel at the top of results explaining the common causes in plain English:
  - *No NIN found* → wrong document uploaded (e.g. driver's licence, voter's card, passport photo), low-quality / blurry scan, NIN digits cut off, or handwritten.
  - *Failed* → image URL is private (Google Drive not shared publicly), link broken (404), file is not an image, or OCR service was rate-limited.
- Make each row's error message more specific where possible (already partially done; tweak messages in the edge function for the most common cases).
- Add a **"Retry failed"** button that re-queues only failed + no-NIN rows (useful after fixing sharing permissions).

## Technical notes
- Frontend only for the history list: query `nin_extraction_batches` directly (RLS already restricts to approved admins) and join counts.
- Add a small `DELETE` and `UPDATE` (for label) flow via supabase client — no schema change needed; `sheet_title` already serves as the label field.
- Extend the edge function with a `retry_failed` action that resets matching rows to `pending`, then reuse existing `process_row` loop.
- No new tables, no new secrets.

## Out of scope
- Storing the actual ID images in our own storage (currently we only keep the URL + OCR text). Can be added later if you want offline re-OCR.
