import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const PAYSTACK = "https://api.paystack.co";

async function fetchBanks(key: string) {
  const r = await fetch(`${PAYSTACK}/bank?country=nigeria&perPage=100`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const j = await r.json();
  return (j?.data || []) as Array<{ name: string; code: string }>;
}

async function tryResolve(key: string, account: string, code: string) {
  try {
    const r = await fetch(
      `${PAYSTACK}/bank/resolve?account_number=${account}&bank_code=${code}`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    if (r.status === 429) return { rateLimited: true };
    if (r.status === 401) return { authError: true };
    const j = await r.json();
    if (j?.status && j?.data?.account_name) {
      return { ok: true, account_name: j.data.account_name as string };
    }
    return { ok: false, msg: j?.message as string | undefined };
  } catch (e) {
    return { ok: false, msg: (e as Error).message };
  }
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
    const accountNumber: string = String(body.accountNumber || "").replace(/\D/g, "");
    if (!accountNumber || accountNumber.length < 10) {
      return new Response(
        JSON.stringify({ error: "Valid 10-digit account number required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const banks = await fetchBanks(key);
    if (!banks.length) {
      return new Response(JSON.stringify({ error: "Could not load banks" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try banks in concurrent batches; abort on first success
    const CONCURRENCY = 12;
    let found:
      | { bank_name: string; bank_code: string; account_name: string }
      | null = null;

    for (let i = 0; i < banks.length && !found; i += CONCURRENCY) {
      const slice = banks.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        slice.map((b) => tryResolve(key, accountNumber, b.code).then((r) => ({ r, b }))),
      );
      // Handle rate limits with a short backoff
      if (results.some((x) => (x.r as any).rateLimited)) {
        await new Promise((res) => setTimeout(res, 1500));
        i -= CONCURRENCY; // retry this slice
        continue;
      }
      const hit = results.find((x) => (x.r as any).ok);
      if (hit) {
        found = {
          bank_name: hit.b.name,
          bank_code: hit.b.code,
          account_name: (hit.r as any).account_name,
        };
      }
      // Gentle pacing between batches
      await new Promise((res) => setTimeout(res, 120));
    }

    if (!found) {
      return new Response(
        JSON.stringify({ status: "not_found", message: "No bank matched this account number" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ status: "ok", account_number: accountNumber, ...found }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
