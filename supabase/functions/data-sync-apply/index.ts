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
  const maxRows = 20000;
  const rows: any[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize - 1, maxRows - 1);
    const { data, error } = await supabase
      .from("sync_run_items").select("*").eq("run_id", runId).range(from, to);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function fetchMastersByIds(supabase: ReturnType<typeof createClient>, ids: string[]) {
  const out: Record<string, any> = {};
  const chunk = 500;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const { data, error } = await supabase
      .from("sync_master_rows").select("id, data, name_key").in("id", slice);
    if (error) throw error;
    for (const r of data ?? []) out[(r as any).id] = r;
  }
  return out;
}

async function bulkInsert(supabase: ReturnType<typeof createClient>, table: string, rows: any[]) {
  if (!rows.length) return [] as any[];
  const chunk = 500;
  const inserted: any[] = [];
  for (let i = 0; i < rows.length; i += chunk) {
    const { data, error } = await supabase.from(table).insert(rows.slice(i, i + chunk)).select();
    if (error) throw error;
    inserted.push(...(data ?? []));
  }
  return inserted;
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
      item_decisions: Record<string, { action: string; target_master_row_id?: string }>;
    };

    const { data: run } = await supabase.from("sync_runs").select("*").eq("id", run_id).single();
    if (!run) throw new Error("Run not found");
    const headerMapping = run.header_mapping as Record<string, string | null>;

    const items = await fetchAllRunItems(supabase, run_id);

    const { data: sheet } = await supabase
      .from("sync_master_sheets").select("headers")
      .eq("workspace_id", run.workspace_id)
      .order("uploaded_at", { ascending: false }).limit(1).maybeSingle();
    const masterHeaders: string[] = (sheet?.headers as string[]) || [];

    const nameAliases = ["full name", "name", "staff name", "employee name", "fullname"];
    const mstNameField = masterHeaders.find((h) => nameAliases.includes(norm(h))) ?? masterHeaders[0];

    const { data: maxRow } = await supabase
      .from("sync_master_rows").select("row_order")
      .eq("workspace_id", run.workspace_id)
      .order("row_order", { ascending: false }).limit(1).maybeSingle();
    let nextOrder = ((maxRow?.row_order as number) ?? 0) + 1;

    // Partition items by decision.
    const newItems: any[] = [];
    const updateItems: { it: any; targetId: string; action: string }[] = [];
    for (const it of items) {
      const d = item_decisions[it.id];
      if (!d || d.action === "skip") continue;
      if (d.action === "new") { newItems.push(it); continue; }
      const targetId = d.target_master_row_id ?? it.match_master_row_id;
      if (!targetId) continue;
      updateItems.push({ it, targetId, action: d.action });
    }

    // Batch fetch all target masters.
    const targetIds = Array.from(new Set(updateItems.map((u) => u.targetId)));
    const masters = await fetchMastersByIds(supabase, targetIds);

    // Build snapshots + master upserts for updates.
    const masterUpdates: any[] = [];
    const snapshotsForUpdates: any[] = [];
    const autoUpdateItemIds: string[] = [];
    const manualItemIds: string[] = [];
    const itemTargetUpdates: { id: string; target: string }[] = [];

    for (const u of updateItems) {
      const master = masters[u.targetId];
      if (!master) continue;
      const before = (master.data ?? {}) as Record<string, any>;
      const after = { ...before };
      for (const [sh, mh] of Object.entries(headerMapping)) {
        if (!mh) continue;
        if (mstNameField && mh === mstNameField) continue;
        const v = u.it.source_row?.[sh];
        if (v === null || v === undefined || String(v).trim() === "") continue;
        after[mh] = v;
      }
      masterUpdates.push({
        id: u.targetId,
        workspace_id: run.workspace_id,
        data: after,
        name_key: master.name_key,
      });
      snapshotsForUpdates.push({ run_id, master_row_id: u.targetId, before, after });
      if (u.action === "merge") manualItemIds.push(u.it.id);
      else autoUpdateItemIds.push(u.it.id);
      itemTargetUpdates.push({ id: u.it.id, target: u.targetId });
    }

    // Dedupe master updates by id — multiple source rows can map to the same master row,
    // and Postgres ON CONFLICT cannot touch the same row twice in one statement.
    // Merge sequentially so later writes win on overlapping fields.
    const dedupedMap = new Map<string, any>();
    for (const u of masterUpdates) {
      const prev = dedupedMap.get(u.id);
      if (prev) {
        dedupedMap.set(u.id, { ...prev, ...u, data: { ...prev.data, ...u.data } });
      } else {
        dedupedMap.set(u.id, u);
      }
    }
    const dedupedUpdates = Array.from(dedupedMap.values());

    // Bulk upsert master updates (one round-trip per chunk instead of per-row).
    if (dedupedUpdates.length) {
      const chunk = 500;
      for (let i = 0; i < dedupedUpdates.length; i += chunk) {
        const { error } = await supabase
          .from("sync_master_rows")
          .upsert(dedupedUpdates.slice(i, i + chunk), { onConflict: "id" });
        if (error) throw error;
      }
    }

    // Bulk insert "new" master rows with pre-assigned row_order.
    const newMasterRows = newItems.map((it) => {
      const newData: Record<string, any> = {};
      for (const [sh, mh] of Object.entries(headerMapping)) {
        if (mh && it.source_row?.[sh] !== undefined && String(it.source_row[sh]).trim() !== "") {
          newData[mh] = it.source_row[sh];
        }
      }
      const nm = mstNameField ? String(newData[mstNameField] ?? "") : "";
      return {
        workspace_id: run.workspace_id,
        data: newData,
        name_key: nameKey(nm),
        row_order: nextOrder++,
        _src_item_id: it.id,
        _src_data: newData,
      };
    });
    const insertPayload = newMasterRows.map(({ _src_item_id, _src_data, ...r }) => r);
    const insertedNew = await bulkInsert(supabase, "sync_master_rows", insertPayload);

    // Snapshots for new rows — pair by index (insert returns in order for each chunk).
    const snapshotsForNew = insertedNew.map((row: any, i: number) => ({
      run_id, master_row_id: row.id, before: {}, after: newMasterRows[i]._src_data,
    }));

    await bulkInsert(supabase, "sync_snapshots", [...snapshotsForUpdates, ...snapshotsForNew]);

    // Bulk update sync_run_items in three groups: new, auto_update, manual.
    const newItemIds = newItems.map((it) => it.id);
    const updIn = async (ids: string[], patch: any) => {
      if (!ids.length) return;
      const chunk = 500;
      for (let i = 0; i < ids.length; i += chunk) {
        const { error } = await supabase
          .from("sync_run_items").update(patch).in("id", ids.slice(i, i + chunk));
        if (error) throw error;
      }
    };
    await updIn(newItemIds, { applied: true, decision: "new" });
    await updIn(autoUpdateItemIds, { applied: true, decision: "auto_update" });
    await updIn(manualItemIds, { applied: true, decision: "manual" });

    // Per-row target id sync (needed when decision overrode the match). Batch upsert by id.
    if (itemTargetUpdates.length) {
      const chunk = 500;
      for (let i = 0; i < itemTargetUpdates.length; i += chunk) {
        const slice = itemTargetUpdates.slice(i, i + chunk);
        await Promise.all(slice.map((p) =>
          supabase.from("sync_run_items").update({ match_master_row_id: p.target }).eq("id", p.id)
        ));
      }
    }

    await supabase.from("sync_runs").update({
      status: "applied", applied_at: new Date().toISOString(),
    }).eq("id", run_id);

    const applied = newItemIds.length + autoUpdateItemIds.length + manualItemIds.length;
    return new Response(JSON.stringify({ applied }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
