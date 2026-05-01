// Canonical fields that can be placed on a payslip template.
// Admins map their Excel columns to these field keys.

export interface PayslipField {
  key: string;
  label: string;
  group: "identity" | "period" | "earnings" | "deductions" | "totals" | "custom";
  format?: "text" | "currency" | "date" | "number";
}

export const PAYSLIP_FIELDS: PayslipField[] = [
  { key: "staff_name", label: "Name", group: "identity", format: "text" },
  { key: "designation", label: "Designation", group: "identity", format: "text" },
  { key: "staff_id", label: "Staff ID", group: "identity", format: "text" },
  { key: "email", label: "Email", group: "identity", format: "text" },
  { key: "department", label: "Department", group: "identity", format: "text" },
  { key: "bank_name", label: "Bank Name", group: "identity", format: "text" },
  { key: "bank_account", label: "Bank Account", group: "identity", format: "text" },

  { key: "period", label: "Pay Period", group: "period", format: "text" },
  { key: "pay_date", label: "Pay Date", group: "period", format: "date" },
  { key: "working_days", label: "Working Days", group: "period", format: "number" },
  { key: "days_worked", label: "Days Worked", group: "period", format: "number" },

  { key: "month_income", label: "Month's Income", group: "earnings", format: "currency" },
  { key: "month_gross", label: "Month's Gross", group: "earnings", format: "currency" },
  { key: "basic", label: "Basic", group: "earnings", format: "currency" },
  { key: "housing", label: "Housing", group: "earnings", format: "currency" },
  { key: "transport", label: "Transport", group: "earnings", format: "currency" },
  { key: "other_allowance", label: "Other Allowance", group: "earnings", format: "currency" },
  { key: "performance", label: "Performance", group: "earnings", format: "currency" },
  { key: "hazardous", label: "Hazardous", group: "earnings", format: "currency" },
  { key: "overtime", label: "Overtime", group: "earnings", format: "currency" },
  { key: "inlieu", label: "Inlieu", group: "earnings", format: "currency" },
  { key: "bonus", label: "Bonus", group: "earnings", format: "currency" },

  { key: "deduction", label: "Deduction", group: "deductions", format: "currency" },
  { key: "final_gross_salary", label: "Final Gross Salary", group: "totals", format: "currency" },
  { key: "contributory_pension_deduction", label: "Contributory Pension Deduction", group: "deductions", format: "currency" },
  { key: "tax_payable", label: "Tax Payable", group: "deductions", format: "currency" },
  { key: "tax_percentage", label: "Tax Percentage", group: "deductions", format: "text" },
  { key: "tax", label: "Tax (PAYE)", group: "deductions", format: "currency" },
  { key: "pension", label: "Pension", group: "deductions", format: "currency" },
  { key: "nhf", label: "NHF", group: "deductions", format: "currency" },
  { key: "other_deduction", label: "Other Deduction", group: "deductions", format: "currency" },

  { key: "gross_pay", label: "Gross Pay", group: "totals", format: "currency" },
  { key: "total_deductions", label: "Total Deductions", group: "totals", format: "currency" },
  { key: "net_pay", label: "Net Salary", group: "totals", format: "currency" },
];

export const PAYSLIP_FIELD_KEYS = PAYSLIP_FIELDS.map((f) => f.key);

// Defaults for the JOSEPDAM/PROTEN structured layout — matches the headings
// on the "Payslip" tab of the standard payroll Excel.
export const PROTEN_DEFAULT_MAPPING: Record<string, string> = {
  staff_name: "Name",
  designation: "Designation",
  working_days: "Working Days",
  days_worked: "Days Worked",
  month_income: "Month's Income",
  month_gross: "Month's Gross",
  basic: "Basic",
  housing: "Housing",
  transport: "Transport",
  other_allowance: "Other Allowance",
  performance: "Performance",
  hazardous: "Hazardous",
  overtime: "Overtime",
  inlieu: "Inlieu",
  deduction: "Deduction",
  final_gross_salary: "Final Gross Salary",
  contributory_pension_deduction: "Contributory Pension Deduction",
  tax_payable: "Tax Payable",
  tax_percentage: "Tax Percentage",
  net_pay: "Net Salary",
};

// Ordered rows for the structured PROTEN payslip table.
// `highlight` rows render with the purple accent.
export interface ProtenRow {
  key: string;
  label: string;
  format: "text" | "currency" | "number";
  highlight?: boolean;
}

export const PROTEN_ROWS: ProtenRow[] = [
  { key: "staff_name", label: "NAME", format: "text" },
  { key: "designation", label: "DESIGNATION", format: "text" },
  { key: "working_days", label: "WORKING DAYS", format: "number" },
  { key: "days_worked", label: "DAYS WORKED", format: "number" },
  { key: "month_income", label: "MONTH'S INCOME", format: "currency", highlight: true },
  { key: "month_gross", label: "MONTH'S GROSS", format: "currency" },
  { key: "basic", label: "BASIC", format: "currency" },
  { key: "housing", label: "HOUSING", format: "currency" },
  { key: "transport", label: "TRANSPORT", format: "currency" },
  { key: "other_allowance", label: "OTHER ALLOWANCE", format: "currency" },
  { key: "performance", label: "PERFORMANCE", format: "currency" },
  { key: "hazardous", label: "HAZARDOUS", format: "currency" },
  { key: "overtime", label: "OVERTIME", format: "currency" },
  { key: "inlieu", label: "INLIEU", format: "currency" },
  { key: "deduction", label: "DEDUCTION", format: "currency" },
  { key: "final_gross_salary", label: "FINAL GROSS SALARY", format: "currency" },
  { key: "contributory_pension_deduction", label: "CONTRIBUTORY PENSION DEDUCTION", format: "currency" },
  { key: "tax_payable", label: "TAX PAYABLE", format: "currency" },
  { key: "tax_percentage", label: "TAX PERCENTAGE", format: "text" },
  { key: "net_pay", label: "NET SALARY", format: "currency", highlight: true },
];

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
