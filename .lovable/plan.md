Remove the pre-selected "SOTI" default from the Company field on the public ID card generator so users must actively choose their company.

### What will change

**`src/components/StaffForm.tsx`**
- Change the initial `company` form state from `"SOTI"` to `""`.
- Update the `StaffFormData` interface so `company` accepts `"" | CompanyTemplate`.
- Add a submit-time validation: `if (!formData.company) { setFormError("Please select your company"); return; }`.
- The existing `<Select>` already has `placeholder="Select company"`, so once the default value is empty the dropdown will show the prompt naturally.

**`src/pages/Index.tsx`**
- No changes needed. The parent receives `StaffFormData` only after the form validates, so `data.company` will always be a valid `CompanyTemplate`.

### Result
Users will see an empty Company dropdown with placeholder text (e.g., "Select company") instead of "SOTI" already selected, forcing an active choice and preventing accidental SOTI selections for OPAY or Blue Ridge staff.