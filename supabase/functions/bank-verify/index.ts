import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const PAYSTACK = "https://api.paystack.co";

function normalize(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Token-set similarity (0..1)
function similarity(a: string, b: string): number {
  const A = new Set(normalize(a).split(" ").filter(Boolean));
  const B = new Set(normalize(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((t) => B.has(t) && inter++);
  return inter / Math.max(A.size, B.size);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const key = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!key) {
    return new Response(JSON.stringify({ error: "PAYSTACK_SECRET_KEY not set" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Auth: only approved admins
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role,status")
    .eq("user_id", userRes.user.id);
  const ok = roles?.some(
    (r: any) =>
      r.role === "super_admin" || (r.role === "admin" && r.status === "approved"),
  );
  if (!ok) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const rowIds: string[] = body.rowIds || [];
    const batchId: string = body.batchId;
    if (!batchId || !rowIds.length) {
      return new Response(JSON.stringify({ error: "batchId and rowIds required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: rows } = await supabase
      .from("bank_verification_rows")
      .select("*")
      .in("id", rowIds);

    if (!rows?.length) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Dedup cache for identical account+bank within one request
    const cache = new Map<string, any>();
    let verified = 0,
      mismatch = 0,
      failed = 0;
    let warning: string | null = null;

    for (const row of rows) {
      if (row.status === "verified" || row.status === "mismatch") {
        // Skip already-resolved rows
        if (row.status === "verified") verified++;
        else mismatch++;
        continue;
      }
      const acct = String(row.account_number || "").replace(/\D/g, "");
      const bank = row.bank_code;
      if (!acct || !bank) {
        failed++;
        await supabase
          .from("bank_verification_rows")
          .update({
            status: "failed",
            error_message: "Missing account number or bank code",
            verified_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        continue;
      }
      const cacheKey = `${acct}|${bank}`;
      let result = cache.get(cacheKey);
      if (!result) {
        try {
          const r = await fetch(
            `${PAYSTACK}/bank/resolve?account_number=${acct}&bank_code=${bank}`,
            { headers: { Authorization: `Bearer ${key}` } },
          );
          const json = await r.json();
          result = { ...json, http_status: r.status };
        } catch (e) {
          result = { status: false, message: (e as Error).message };
        }
        cache.set(cacheKey, result);
        // Rate-limit politely
        await new Promise((res) => setTimeout(res, 350));
      }

      if (result?.status && result.data?.account_name) {
        const resolved = result.data.account_name as string;
        const compareName = row.expected_account_name || row.full_name;
        const sim = similarity(compareName, resolved);
        const status = sim >= 0.6 ? "verified" : "mismatch";
        if (status === "verified") verified++;
        else mismatch++;
        await supabase
          .from("bank_verification_rows")
          .update({
            resolved_account_name: resolved,
            similarity: sim,
            status,
            error_message: null,
            verified_at: new Date().toISOString(),
          })
          .eq("id", row.id);
      } else {
        failed++;
        const message = result?.message || "Could not resolve account";
        if (
          !warning &&
          (String(message).toLowerCase().includes("test mode daily limit") ||
            result?.http_status === 401 ||
            result?.http_status === 429)
        ) {
          warning = String(message).toLowerCase().includes("test mode daily limit")
            ? "Bank verification is hitting Paystack test-mode limits. Switch PAYSTACK_SECRET_KEY to a live key to verify real accounts."
            : result?.http_status === 401
              ? "Bank verification could not authenticate with Paystack. Check the PAYSTACK_SECRET_KEY runtime secret."
              : "Bank verification is being rate-limited by Paystack. Please retry in a moment or reduce batch size.";
        }
        await supabase
          .from("bank_verification_rows")
          .update({
            status: "failed",
            error_message: message,
            verified_at: new Date().toISOString(),
          })
          .eq("id", row.id);
      }
    }

    // Update batch counts (full recount)
    const { data: allRows } = await supabase
      .from("bank_verification_rows")
      .select("status")
      .eq("batch_id", batchId);
    const counts = { verified: 0, mismatch: 0, failed: 0 };
    allRows?.forEach((r: any) => {
      if (r.status === "verified") counts.verified++;
      else if (r.status === "mismatch") counts.mismatch++;
      else if (r.status === "failed") counts.failed++;
    });
    await supabase
      .from("bank_verification_batches")
      .update({
        verified_count: counts.verified,
        mismatch_count: counts.mismatch,
        failed_count: counts.failed,
      })
      .eq("id", batchId);

    return new Response(
      JSON.stringify({ processed: rows.length, verified, mismatch, failed, warning }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
