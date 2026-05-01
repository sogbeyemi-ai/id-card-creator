// Canonical fields that can be placed on a payslip template.
// Admins map their Excel columns to these field keys.

export interface PayslipField {
  key: string;
  label: string;
  group: "identity" | "period" | "earnings" | "deductions" | "totals" | "custom";
  format?: "text" | "currency" | "date" | "number";
}

export const PAYSLIP_FIELDS: PayslipField[] = [
  { key: "staff_name", label: "Staff Name", group: "identity", format: "text" },
  { key: "staff_id", label: "Staff ID", group: "identity", format: "text" },
  { key: "email", label: "Email", group: "identity", format: "text" },
  { key: "department", label: "Department", group: "identity", format: "text" },
  { key: "designation", label: "Designation / Role", group: "identity", format: "text" },
  { key: "bank_name", label: "Bank Name", group: "identity", format: "text" },
  { key: "bank_account", label: "Bank Account", group: "identity", format: "text" },

  { key: "period", label: "Pay Period", group: "period", format: "text" },
  { key: "pay_date", label: "Pay Date", group: "period", format: "date" },

  { key: "basic", label: "Basic Salary", group: "earnings", format: "currency" },
  { key: "housing", label: "Housing Allowance", group: "earnings", format: "currency" },
  { key: "transport", label: "Transport Allowance", group: "earnings", format: "currency" },
  { key: "other_allowance", label: "Other Allowance", group: "earnings", format: "currency" },
  { key: "bonus", label: "Bonus", group: "earnings", format: "currency" },

  { key: "tax", label: "Tax (PAYE)", group: "deductions", format: "currency" },
  { key: "pension", label: "Pension", group: "deductions", format: "currency" },
  { key: "nhf", label: "NHF", group: "deductions", format: "currency" },
  { key: "other_deduction", label: "Other Deduction", group: "deductions", format: "currency" },

  { key: "gross_pay", label: "Gross Pay", group: "totals", format: "currency" },
  { key: "total_deductions", label: "Total Deductions", group: "totals", format: "currency" },
  { key: "net_pay", label: "Net Pay", group: "totals", format: "currency" },
];

export const PAYSLIP_FIELD_KEYS = PAYSLIP_FIELDS.map((f) => f.key);

export interface FieldPlacement {
  key: string;          // canonical field key OR a custom label
  label: string;
  x: number;            // 0-1 normalized
  y: number;            // 0-1 normalized
  fontSize: number;     // px relative to template width=800
  align: "left" | "center" | "right";
  bold?: boolean;
  format?: "text" | "currency" | "date" | "number";
}
