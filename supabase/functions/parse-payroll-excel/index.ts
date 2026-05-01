import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await admin.rpc("is_approved_admin", { _user_id: user.id });
    if (!isAdmin) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });

    const { cycle_id } = await req.json();
    if (!cycle_id) return new Response(JSON.stringify({ error: "cycle_id required" }), { status: 400, headers: corsHeaders });

    const { data: cycle, error: cErr } = await admin.from("payroll_cycles").select("*").eq("id", cycle_id).maybeSingle();
    if (cErr || !cycle) throw new Error("Cycle not found");
    if (!cycle.source_file_url) throw new Error("No Excel uploaded for this cycle");

    // Download the excel
    const fileRes = await fetch(cycle.source_file_url);
    const buf = new Uint8Array(await fileRes.arrayBuffer());
    const wb = XLSX.read(buf, { type: "array" });
    // Require a sheet named "Payslip" (case-insensitive). The spec says the
    // payroll workbook MUST contain a tab called "Payslip" with headings on
    // the first row.
    const targetName =
      wb.SheetNames.find((n) => n.trim().toLowerCase() === "payslip") ||
      wb.SheetNames.find((n) => n.trim().toLowerCase().includes("payslip"));
    if (!targetName) {
      throw new Error(
        'No worksheet named "Payslip" was found. Please upload a payroll Excel file containing a Payslip tab.'
      );
    }
    console.log("Using sheet:", targetName, "of", wb.SheetNames);
    const ws = wb.Sheets[targetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
    if (rows.length === 0) {
      throw new Error('The "Payslip" sheet is empty. Add headings on the first row and one row per employee.');
    }

    // Auto-apply PROTEN default mapping when the cycle/client has no mapping yet.
    // This matches the standard JOSEPDAM/PROTEN April 2026 workbook headers.
    const PROTEN_DEFAULTS: Record<string, string> = {
      staff_name: "EMPLOYEE NAME",
      designation: "DESIGNATION",
      working_days: "Working Days",
      days_worked: "Days Worked",
      month_income: "THIS MONTHLY GROSS",
      month_gross: "MONTHLY GROSS",
      basic: " Basic Salary",
      housing: " Housing Allowance",
      transport: " Transport Allowance",
      other_allowance: " Utility",
      performance: "PERFORMANCE ",
      hazardous: "HARZADOUS",
      overtime: "OVERTIME",
      inlieu: "INLIEU",
      deduction: "DEDUCTIONS",
      final_gross_salary: "MONTH'S INCOME",
      contributory_pension_deduction: "Monthly Employee Pension",
      tax_payable: "Compiled Monthly Tax",
      tax_percentage: "TAX%",
      net_pay: "Net Pay",
    };

    let mapping = (cycle.column_mapping || {}) as Record<string, string>;
    if (!mapping || Object.keys(mapping).filter((k) => mapping[k]).length === 0) {
      mapping = PROTEN_DEFAULTS;
    }

    // Build a normalized lookup of actual headers so we can match even if the
    // workbook has slightly different spacing/casing than the mapping uses.
    const headerKeys = Object.keys(rows[0] || {});
    const normalize = (s: string) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
    const headerByNorm = new Map<string, string>();
    for (const h of headerKeys) headerByNorm.set(normalize(h), h);

    const lookupCell = (row: Record<string, any>, header: string) => {
      if (header in row) return row[header];
      const real = headerByNorm.get(normalize(header));
      return real ? row[real] : undefined;
    };

    // Clear previous rows for this cycle
    await admin.from("payroll_rows").delete().eq("cycle_id", cycle_id);

    const inserts = rows
      .filter((row) => {
        // Skip rows without an employee name (totals row, blank rows)
        const name = lookupCell(row, mapping.staff_name || "EMPLOYEE NAME");
        return name && String(name).trim().length > 0;
      })
      .map((row) => {
      const data: Record<string, any> = {};
      for (const [fieldKey, excelCol] of Object.entries(mapping)) {
        if (!excelCol) continue;
        const v = lookupCell(row, excelCol);
        data[fieldKey] = v === undefined || v === null ? "" : v;
      }
      // Format tax_percentage as "x.xx%" if numeric
      if (data.tax_percentage !== "" && data.tax_percentage !== undefined) {
        const tp = Number(data.tax_percentage);
        if (Number.isFinite(tp)) {
          data.tax_percentage = (tp <= 1 ? tp * 100 : tp).toFixed(2) + "%";
        }
      }
      // Auto-derive totals if missing
      const num = (k: string) => Number(data[k]) || 0;
      if (!data.gross_pay) {
        data.gross_pay = num("basic") + num("housing") + num("transport") + num("other_allowance") + num("bonus");
      }
      if (!data.total_deductions) {
        data.total_deductions = num("tax") + num("pension") + num("nhf") + num("other_deduction");
      }
      if (!data.net_pay) {
        data.net_pay = Number(data.gross_pay) - Number(data.total_deductions);
      }
      return {
        cycle_id,
        staff_name: data.staff_name || "",
        staff_email: data.email || null,
        staff_id_number: data.staff_id || null,
        data,
        status: "pending",
      };
    });

    if (inserts.length > 0) {
      const { error: insErr } = await admin.from("payroll_rows").insert(inserts);
      if (insErr) throw insErr;
    }

    await admin.from("payroll_cycles")
      .update({ total_rows: inserts.length, status: "parsed" })
      .eq("id", cycle_id);

    return new Response(JSON.stringify({ success: true, rows: inserts.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
