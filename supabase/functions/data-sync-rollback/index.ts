import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const { run_id } = await req.json();
    const { data: snaps } = await supabase.from("sync_snapshots").select("*").eq("run_id", run_id);
    if (!snaps) throw new Error("No snapshots");
    for (const s of snaps) {
      if (!s.master_row_id) continue;
      if (Object.keys(s.before as any).length === 0) {
        // was newly created — delete it
        await supabase.from("sync_master_rows").delete().eq("id", s.master_row_id);
      } else {
        await supabase.from("sync_master_rows").update({ data: s.before }).eq("id", s.master_row_id);
      }
    }
    await supabase.from("sync_runs").update({ status: "rolled_back" }).eq("id", run_id);
    return new Response(JSON.stringify({ ok: true, restored: snaps.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
