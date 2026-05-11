import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function authAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) return null;
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role,status")
    .eq("user_id", user.id)
    .in("role", ["admin", "super_admin"]);
  const ok = roles?.some((r: any) => r.role === "super_admin" || (r.role === "admin" && r.status === "approved"));
  if (!ok) return null;
  return { supabase, user };
}

async function parseSheet(file: File | ArrayBuffer | Uint8Array, fileName: string) {
  let buf: ArrayBuffer;
  if (file instanceof File) buf = await file.arrayBuffer();
  else if (file instanceof Uint8Array) buf = file.buffer;
  else buf = file;
  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
  // Prefer a sheet named like Payslip/Master/Sheet1 — fallback to first
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return { fileName, sheetName, headers, rows };
}

async function fetchGoogleSheet(url: string) {
  // Convert sheet URL → export?format=xlsx
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) throw new Error("Invalid Google Sheets URL");
  const id = m[1];
  const exportUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;
  const resp = await fetch(exportUrl);
  if (!resp.ok) throw new Error("Could not fetch Google Sheet — make sure it's public");
  const buf = await resp.arrayBuffer();
  return buf;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await authAdmin(req);
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const body = await req.json();
      if (body.google_sheet_url) {
        const buf = await fetchGoogleSheet(body.google_sheet_url);
        const parsed = await parseSheet(buf, "google-sheet.xlsx");
        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Missing google_sheet_url" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return new Response(JSON.stringify({ error: "No file" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const parsed = await parseSheet(file, file.name);
    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
