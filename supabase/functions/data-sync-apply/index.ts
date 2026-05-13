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

async function fetchAllRunItems(supabase: ReturnType<typeof createClient>, runId: string) {
  const pageSize = 1000;
  const maxRows = 10000;
  const rows: any[] = [];

  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize - 1, maxRows - 1);
    const { data, error } = await supabase
      .from("sync_run_items")
      .select("*")
      .eq("run_id", runId)
      .range(from, to);

    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
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

    const { run_id, item_decisions } = await req.json() as {
      run_id: string;
      // { itemId: { action: 'apply' | 'new' | 'skip' | 'merge', target_master_row_id?: string } }
      item_decisions: Record<string, { action: string; target_master_row_id?: string }>;
    };

    const { data: run } = await supabase.from("sync_runs").select("*").eq("id", run_id).single();
    if (!run) throw new Error("Run not found");
    const headerMapping = run.header_mapping as Record<string, string | null>;

    const items = await fetchAllRunItems(supabase, run_id);
    if (!items) throw new Error("No items");

    const { data: sheet } = await supabase
      .from("sync_master_sheets")
      .select("headers")
      .eq("workspace_id", run.workspace_id)
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const masterHeaders: string[] = (sheet?.headers as string[]) || [];

    // name field
    const nameAliases = ["full name", "name", "staff name", "employee name", "fullname"];
    const mstNameField = masterHeaders.find((h) => nameAliases.includes(norm(h))) ?? masterHeaders[0];

    let applied = 0;
    for (const it of items) {
      const decision = item_decisions[it.id];
      if (!decision || decision.action === "skip") continue;

      if (decision.action === "new") {
        // create master row from source via header mapping
        const newData: Record<string, any> = {};
        for (const [sh, mh] of Object.entries(headerMapping)) {
          if (mh && it.source_row[sh] !== undefined && String(it.source_row[sh]).trim() !== "") {
            newData[mh] = it.source_row[sh];
          }
        }
        const nm = mstNameField ? String(newData[mstNameField] ?? "") : "";
        const { data: inserted } = await supabase
          .from("sync_master_rows")
          .insert({ workspace_id: run.workspace_id, data: newData, name_key: nameKey(nm) })
          .select()
          .single();
        await supabase.from("sync_snapshots").insert({
          run_id, master_row_id: inserted?.id ?? null, before: {}, after: newData,
        });
        await supabase.from("sync_run_items").update({ applied: true, decision: "new" }).eq("id", it.id);
        applied++;
        continue;
      }

      // apply / merge
      const targetId = decision.target_master_row_id ?? it.match_master_row_id;
      if (!targetId) continue;
      const { data: master } = await supabase.from("sync_master_rows").select("*").eq("id", targetId).single();
      if (!master) continue;
      const before = master.data as Record<string, any>;
      const after = { ...before };
      for (const [sh, mh] of Object.entries(headerMapping)) {
        if (!mh) continue;
        const v = it.source_row[sh];
        if (v === null || v === undefined || String(v).trim() === "") continue;
        after[mh] = v;
      }
      const nm = mstNameField ? String(after[mstNameField] ?? "") : "";
      await supabase.from("sync_master_rows").update({ data: after, name_key: nameKey(nm) }).eq("id", targetId);
      await supabase.from("sync_snapshots").insert({
        run_id, master_row_id: targetId, before, after,
      });
      await supabase.from("sync_run_items").update({
        applied: true, match_master_row_id: targetId,
        decision: decision.action === "merge" ? "manual" : "auto_update",
      }).eq("id", it.id);
      applied++;
    }

    await supabase.from("sync_runs").update({ status: "applied", applied_at: new Date().toISOString() }).eq("id", run_id);

    return new Response(JSON.stringify({ applied }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
