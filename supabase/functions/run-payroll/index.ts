// Edge function: run-payroll
// Computes payroll for all active employees server-side and writes line items.
// Admin-only via JWT validation against user_roles.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Body {
  period_label?: string;
  period_start?: string;
  period_end?: string;
  run_id?: string; // optional: re-run an existing draft
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Validate caller is an approved admin
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: isAdmin, error: adminErr } = await admin.rpc(
      "is_approved_admin",
      { _user_id: userRes.user.id }
    );
    if (adminErr || !isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: Body = await req.json().catch(() => ({}));

    // Resolve or create the run
    let runId = body.run_id;
    let runRow: any = null;

    if (runId) {
      const { data, error } = await admin
        .from("payroll_runs")
        .select("*")
        .eq("id", runId)
        .single();
      if (error || !data)
        throw new Error("Run not found");
      if (data.status === "finalized")
        throw new Error("Run already finalized");
      runRow = data;
    } else {
      if (!body.period_label || !body.period_start || !body.period_end) {
        return new Response(
          JSON.stringify({ error: "period_label, period_start, period_end required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { data, error } = await admin
        .from("payroll_runs")
        .insert({
          period_label: body.period_label,
          period_start: body.period_start,
          period_end: body.period_end,
          status: "draft",
          created_by: userRes.user.id,
        })
        .select()
        .single();
      if (error) throw error;
      runRow = data;
      runId = data.id;
    }

    // Clear any existing items for this run (re-run support)
    await admin.from("payroll_items").delete().eq("run_id", runId);

    // Fetch active employees with most recent salary structure
    const { data: employees, error: empErr } = await admin
      .from("employees")
      .select("id, full_name")
      .eq("status", "active");
    if (empErr) throw empErr;

    let totalGross = 0;
    let totalNet = 0;
    const items: any[] = [];

    for (const emp of employees ?? []) {
      const { data: salaries } = await admin
        .from("salary_structures")
        .select("*")
        .eq("employee_id", emp.id)
        .order("effective_from", { ascending: false })
        .limit(1);

      const s = salaries?.[0];
      if (!s) continue; // skip employees without a salary structure

      const base = Number(s.base_salary) || 0;
      const allowances =
        (Number(s.transport_allowance) || 0) +
        (Number(s.housing_allowance) || 0) +
        (Number(s.other_allowance) || 0);
      const gross = base + allowances;
      const tax = (gross * (Number(s.tax_rate) || 0)) / 100;
      const pension = (base * (Number(s.pension_rate) || 0)) / 100;
      const deductions = tax + pension;
      const net = gross - deductions;

      totalGross += gross;
      totalNet += net;

      items.push({
        run_id: runId,
        employee_id: emp.id,
        gross_pay: gross.toFixed(2),
        total_allowances: allowances.toFixed(2),
        total_deductions: deductions.toFixed(2),
        net_pay: net.toFixed(2),
        snapshot: {
          base_salary: base,
          transport_allowance: Number(s.transport_allowance) || 0,
          housing_allowance: Number(s.housing_allowance) || 0,
          other_allowance: Number(s.other_allowance) || 0,
          tax_rate: Number(s.tax_rate) || 0,
          pension_rate: Number(s.pension_rate) || 0,
          tax_amount: tax,
          pension_amount: pension,
          full_name: emp.full_name,
        },
      });
    }

    if (items.length > 0) {
      const { error: insErr } = await admin.from("payroll_items").insert(items);
      if (insErr) throw insErr;
    }

    const { error: updErr } = await admin
      .from("payroll_runs")
      .update({
        total_gross: totalGross.toFixed(2),
        total_net: totalNet.toFixed(2),
      })
      .eq("id", runId);
    if (updErr) throw updErr;

    return new Response(
      JSON.stringify({
        run_id: runId,
        items_count: items.length,
        total_gross: totalGross,
        total_net: totalNet,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("run-payroll error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
