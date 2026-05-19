import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function norm(s: string) {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}
function nameKey(name: string) {
  return norm(name).split(" ").filter(Boolean).sort().join(" ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { workspace_id, file_name, headers, rows, replace } = await req.json();
    if (!workspace_id || !Array.isArray(headers) || !Array.isArray(rows)) {
      return new Response(JSON.stringify({ error: "Bad payload" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (replace) {
      await supabase.from("sync_master_rows").delete().eq("workspace_id", workspace_id);
    }

    await supabase.from("sync_master_sheets").insert({
      workspace_id, file_name, headers, uploaded_by: user.id,
    });

    const nameAliases = ["full name", "name", "staff name", "employee name", "fullname"];
    const nameField = (headers as string[]).find((h) => nameAliases.includes(norm(h))) ?? headers[0];

    // Starting row_order: if replacing, restart at 1; otherwise append after current max.
    let startOrder = 1;
    if (!replace) {
      const { data: maxRow } = await supabase
        .from("sync_master_rows")
        .select("row_order")
        .eq("workspace_id", workspace_id)
        .order("row_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      startOrder = ((maxRow?.row_order as number) ?? 0) + 1;
    }

    const toInsert = (rows as Record<string, any>[]).map((r, idx) => ({
      workspace_id,
      data: r,
      name_key: nameKey(String(r[nameField] ?? "")),
      row_order: startOrder + idx,
    }));

    for (let i = 0; i < toInsert.length; i += 500) {
      const { error } = await supabase.from("sync_master_rows").insert(toInsert.slice(i, i + 500));
      if (error) throw error;
    }

    return new Response(JSON.stringify({ ok: true, count: toInsert.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
