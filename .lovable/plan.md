## Goal
Make it obvious to admins which IDs were already part of a previous bulk download, so they don't accidentally re-download them.

## Approach
Tag every bulk download with a **batch number** and stamp each included staff entry. Then surface that batch info clearly across the Admin Entries page: a banner for the last batch, a per-row badge, a new filter, and a pre-download warning when previously batched rows are reselected.

## What changes for the admin (UX)

1. **"Last bulk download" banner** at the top of Admin Entries:
   > Last bulk download: **Batch #12** — 47 IDs, May 14 2026 2:32 PM
   With a "Show only Batch #12" quick filter button.

2. **New "Batch" column** in the table — shows `#12` badge for rows previously included in any bulk download (empty for never-bulk-downloaded). Rows in the most recent batch get a subtle highlight color so they stand out at a glance.

3. **New filter dropdown** "Bulk status":
   - All
   - Not yet bulk-downloaded *(default suggestion)*
   - In last batch
   - In any batch

4. **Pre-download confirmation**: when admin clicks "Download Selected as ZIP", if any selected rows already have a batch number, show a confirmation dialog:
   > 8 of 25 selected IDs were already part of a previous bulk download (Batch #11, #12). Continue anyway?
   With options: *Cancel* / *Skip already-downloaded* / *Download all anyway*.

5. **Saved downloads list** (existing in-session) gets the batch number in its label, e.g. "Batch #12 — 47 IDs.zip".

## Technical implementation

### Database (migration)
- New table `bulk_download_batches`:
  - `batch_number` (int, auto-increment via sequence)
  - `entry_count` (int)
  - `created_by` (uuid, nullable)
  - `created_at` (timestamptz)
  - `label` (text, optional — e.g. ZIP filename)
  - RLS: admins manage / read.
- Add columns on `staff_entries`:
  - `bulk_batch_number` (int, nullable, indexed)
  - `bulk_downloaded_at` (timestamptz, nullable)
- Update `protect_staff_entry_columns` trigger to allow these two new fields to be updated by the public role (same pattern as `download_count` / `downloaded_at`) so the existing "Public can update download tracking only" policy keeps working from the admin client.

### Frontend (`src/pages/AdminEntries.tsx`)
- Extend `StaffEntry` type with `bulk_batch_number` and `bulk_downloaded_at`.
- In the bulk download flow (around line ~533–567), after the ZIP succeeds:
  1. Insert a row into `bulk_download_batches` and read back `batch_number`.
  2. Update all successfully-zipped `staff_entries` with `bulk_batch_number` + `bulk_downloaded_at`.
- Fetch the latest batch on mount for the banner.
- Add the new column, filter, badge styling, and confirm dialog.
- Memoize the "last batch number" so the row highlight is cheap.

### Out of scope
- Single-user (front-end) downloads stay unchanged — only bulk admin ZIPs create batches.
- No changes to staff-side download locking logic.

## Result
Admin can tell at a glance which IDs are "fresh" (never bulk-downloaded) vs. already shipped in batch #N, filter to just the new ones, and gets a safety prompt before re-downloading anything previously batched.