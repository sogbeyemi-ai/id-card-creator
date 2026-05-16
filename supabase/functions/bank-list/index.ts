import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const key = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!key) {
    return new Response(JSON.stringify({ error: "PAYSTACK_SECRET_KEY not set" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const res = await fetch("https://api.paystack.co/bank?country=nigeria&perPage=200", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const json = await res.json();
    const banks = (json?.data || []).map((b: any) => ({ name: b.name, code: b.code, slug: b.slug }));
    return new Response(JSON.stringify({ banks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
