import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import JSZip from "https://esm.sh/jszip@3.10.1";

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

    const { data: cycle } = await admin.from("payroll_cycles").select("*, payroll_clients(slug)").eq("id", cycle_id).maybeSingle();
    if (!cycle) throw new Error("Cycle not found");

    const { data: rows } = await admin.from("payroll_rows").select("*").eq("cycle_id", cycle_id).eq("status", "generated");
    if (!rows || rows.length === 0) throw new Error("No generated payslips to zip");

    const zip = new JSZip();
    for (const row of rows) {
      if (!row.pdf_url) continue;
      const { data: blob, error } = await admin.storage.from("payslips").download(row.pdf_url);
      if (error || !blob) continue;
      const safe = (row.staff_name || row.id).replace(/[^a-zA-Z0-9]+/g, "_");
      zip.file(`${safe}.pdf`, await blob.arrayBuffer());
    }

    const zipBytes = await zip.generateAsync({ type: "uint8array" });
    const slug = cycle.payroll_clients?.slug || "client";
    const period = (cycle.period_label || "cycle").replace(/[^a-zA-Z0-9]+/g, "_");
    const path = `${cycle_id}/payslips_${slug}_${period}.zip`;

    const { error: upErr } = await admin.storage.from("payslips").upload(path, zipBytes, {
      contentType: "application/zip",
      upsert: true,
    });
    if (upErr) throw upErr;

    const { data: signed } = await admin.storage.from("payslips").createSignedUrl(path, 60 * 60);

    await admin.from("payroll_cycles").update({ zip_url: path }).eq("id", cycle_id);

    return new Response(JSON.stringify({ success: true, signed_url: signed?.signedUrl, path }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
