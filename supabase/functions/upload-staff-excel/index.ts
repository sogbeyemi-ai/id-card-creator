import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check approved admin or super_admin
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role, status")
      .eq("user_id", user.id)
      .in("role", ["admin", "super_admin"])
      .limit(1);

    const isAuthorized = roleData?.some(
      (r) => r.role === "super_admin" || (r.role === "admin" && r.status === "approved")
    );

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse form data - support multiple files
    const formData = await req.formData();
    const files = formData.getAll("file") as File[];
    if (files.length === 0) {
      return new Response(JSON.stringify({ error: "No files provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const batchId = crypto.randomUUID();
    let totalRecords = 0;
    let allColumns: string[] = [];

    for (const file of files) {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (rows.length === 0) continue;

      if (allColumns.length === 0) allColumns = Object.keys(rows[0] || {});

      const staffRecords = rows.map((row) => {
        const normalized: Record<string, string> = {};
        for (const [key, val] of Object.entries(row)) {
          normalized[key.trim().toLowerCase().replace(/\s+/g, "_")] = String(val).trim();
        }
        return {
          full_name: (normalized["full_name"] || normalized["fullname"] || normalized["name"] || "").toUpperCase(),
          role: (normalized["role"] || normalized["position"] || "").toUpperCase(),
          department: (normalized["department"] || normalized["dept"] || "").toUpperCase(),
          state: (normalized["state"] || normalized["location"] || "").toUpperCase(),
          company: normalized["company"] || normalized["organization"] || "",
          batch_id: batchId,
        };
      }).filter((r) => r.full_name && r.role);

      if (staffRecords.length > 0) {
        // APPEND mode - insert without deleting existing data
        const { error: insertError } = await supabase.from("verified_staff").insert(staffRecords);
        if (insertError) {
          return new Response(JSON.stringify({ error: insertError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        totalRecords += staffRecords.length;
      }
    }

    if (totalRecords === 0) {
      return new Response(
        JSON.stringify({ error: "No valid records found. Ensure columns: Full Name, Role" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        count: totalRecords,
        batch_id: batchId,
        columns: allColumns,
        files_processed: files.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
