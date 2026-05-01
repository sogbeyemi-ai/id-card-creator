## HR & Payroll — Phase 1 (Admin View Only)

Goal: Stand up the HR/Payroll backbone **inside the admin dashboard only**. Staff continue to use the public ID generator exactly as today — no new staff-facing pages, no payslip access for staff. We'll evaluate the admin flow first, then decide later whether to expose anything to staff.

The existing ID generator, verification flow, trash, duplicate protection, and download-lock logic remain **completely untouched**.

### What admins will be able to do

1. **Employees directory** — central list of all employees (seeded from existing `verified_staff`), with HR fields: hire date, employment type, status (active / on leave / terminated), bank details, contact, base salary.
2. **Salary management** — set/update base salary, allowances (transport, housing), and deductions (tax, pension) per employee.
3. **Payroll runs** — create a monthly payroll run (e.g. "May 2026"), auto-calculate net pay for every active employee, review totals, mark as "Finalized".
4. **Payslip generation (admin-only)** — generate downloadable PDF payslips per employee for any finalized run. Admin downloads them; nothing is sent to staff.
5. **Payroll history** — view past runs, totals, and who was paid what.

### New admin pages

- `/admin/employees` — list, search, edit employee HR profile
- `/admin/employees/:id` — single employee detail (HR info + salary structure + payroll history)
- `/admin/payroll` — list of payroll runs, "New Run" button
- `/admin/payroll/:runId` — run detail: line items per employee, totals, finalize, download payslip PDFs

Sidebar gets two new sections: **Employees** and **Payroll**. Existing ID generator nav stays as-is.

### Database changes (new tables only — nothing existing is altered)

```text
employees
  id uuid pk
  verified_staff_id uuid (nullable, link to existing record)
  full_name text
  email text
  phone text
  hire_date date
  employment_type text  -- 'full_time' | 'contract' | 'intern'
  status text           -- 'active' | 'on_leave' | 'terminated'
  department text
  role text
  bank_name text
  bank_account text
  created_at, updated_at

salary_structures
  id uuid pk
  employee_id uuid fk -> employees
  base_salary numeric
  transport_allowance numeric default 0
  housing_allowance numeric default 0
  other_allowance numeric default 0
  tax_rate numeric default 0       -- percentage
  pension_rate numeric default 0   -- percentage
  effective_from date
  created_at

payroll_runs
  id uuid pk
  period_label text     -- e.g. "May 2026"
  period_start date
  period_end date
  status text           -- 'draft' | 'finalized'
  total_gross numeric
  total_net numeric
  created_by uuid       -- admin user
  created_at, finalized_at

payroll_items
  id uuid pk
  run_id uuid fk -> payroll_runs (cascade)
  employee_id uuid fk -> employees
  gross_pay numeric
  total_allowances numeric
  total_deductions numeric
  net_pay numeric
  snapshot jsonb        -- frozen copy of salary structure at run time
  created_at
```

All tables get RLS: **only `is_approved_admin(auth.uid())` can read/write**. No public or staff access.

### Edge function

- `run-payroll` — given a `period_start` / `period_end`, fetches all active employees with their current salary structure, computes gross/net, inserts `payroll_items`, updates run totals. Uses service role; admin-only invocation guard.

### How it touches the existing system

- **`verified_staff`** stays the verification source for the ID generator. We add an "Import to Employees" admin button that copies/links records into the new `employees` table. ID generator behavior is unchanged.
- **`user_roles`** is reused as-is. Only `admin` / `super_admin` can access HR/Payroll routes.
- **`staff_entries`** is unchanged. Optionally we can show "ID generated: yes/no" on the employee detail page later (read-only join).

### What is explicitly NOT in Phase 1

- No staff login, no staff dashboard, no staff payslip downloads
- No leave management, attendance, or time tracking
- No email/notification delivery of payslips
- No tax authority reports
- No multi-currency

These can come in Phase 2+ once you've validated the admin flow.

### Technical notes

- Payroll calculations run server-side in the edge function for consistency and to avoid floating-point drift on the client.
- Each `payroll_items.snapshot` freezes the salary structure used, so historical runs stay accurate even if salaries change later.
- Payslip PDFs generated client-side using the same `jspdf` + `html2canvas` approach already in the project, keeping the stack consistent.
- All new routes guarded by the existing admin auth pattern in `AdminLayout.tsx`.

### Risk to existing ID generator

**None.** New tables, new routes, new edge function. No schema changes to existing tables. No changes to public `/` route or the verification cache.

---

If this looks right, approve and I'll implement it. If you'd like to trim further (e.g. start with just Employees + Salary, defer Payroll Runs to Phase 1B), say the word and I'll revise.