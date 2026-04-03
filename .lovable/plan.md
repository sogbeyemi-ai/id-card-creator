## System Security Upgrade Plan

### 1. Database Changes
- **`verified_staff`** table: stores Excel data (full_name, role, department, state, company) — the source of truth for verification
- **`user_roles`** table: admin role management (supports multiple admins)
- **`download_logs`** table: tracks who downloaded, prevents re-downloads
- Add `download_count` column to `staff_entries`

### 2. Admin Authentication
- Email/password login for admins
- Protected admin routes
- Role-based access using `user_roles` table

### 3. Admin Dashboard (`/admin`)
- **Login page** for admin access
- **Upload Excel** page: upload/replace verified staff list
- **Staff entries** page: view all generated IDs, re-enable downloads
- **User management**: invite/manage admin users
- Sidebar navigation, mobile-friendly

### 4. Staff Verification Flow
- User enters name + role on form
- On submit, system checks `verified_staff` table for matching name + role
- If NO match → error: "You are not authorized to generate an ID"
- If match → proceed with ID generation

### 5. Download Restriction
- First download is allowed
- Subsequent attempts show: "Download already completed. Contact admin."
- Admin can reset download status from dashboard

### 6. UI Changes
- Remove live preview from user-facing page
- Add camera capture option alongside file upload
- Add loading states: "Verifying…", "Generating ID…"

### 7. Edge Function
- Parse uploaded Excel files server-side and insert into `verified_staff` table
