import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function authAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: { user } } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) return null;
  const { data: roles } = await sb.from("user_roles").select("role,status").eq("user_id", user.id);
  const ok = roles?.some((r: any) => r.role === "super_admin" || (r.role === "admin" && r.status === "approved"));
  if (!ok) return null;
  return { sb, user };
}

function extractSheetId(url: string) {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) throw new Error("Invalid Google Sheets URL");
  return m[1];
}
function extractGid(url: string) {
  const m = url.match(/[?#&]gid=([0-9]+)/);
  return m ? m[1] : "0";
}

// Naive CSV parser (handles quoted fields with commas, escaped quotes, newlines)
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.length));
}

// Convert Google Drive viewer URLs to direct download
function resolveImageUrl(url: string): string {
  const u = url.trim();
  let m = u.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return `https://drive.google.com/uc?export=download&id=${m[1]}`;
  m = u.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (m) return `https://drive.google.com/uc?export=download&id=${m[1]}`;
  m = u.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m && u.includes("drive.google.com")) return `https://drive.google.com/uc?export=download&id=${m[1]}`;
  return u;
}

async function fetchImageAsDataUrl(url: string): Promise<string> {
  const resp = await fetch(url, { redirect: "follow" });
  if (!resp.ok) throw new Error(`Image fetch failed (${resp.status})`);
  const ct = resp.headers.get("content-type") || "image/jpeg";
  if (ct.includes("text/html")) throw new Error("Image URL is not public (Google login page returned)");
  const buf = new Uint8Array(await resp.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  const b64 = btoa(bin);
  return `data:${ct};base64,${b64}`;
}

async function ocrWithGemini(dataUrl: string): Promise<string> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": LOVABLE_API_KEY,
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Read ALL text visible in this image (it's likely a Nigerian National ID). Return the raw text only, no commentary." },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      }],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    if (resp.status === 429) throw new Error("AI rate limit — try again shortly");
    if (resp.status === 402) throw new Error("AI credits exhausted — add credits in workspace settings");
    throw new Error(`OCR failed: ${resp.status} ${t.slice(0, 200)}`);
  }
  const j = await resp.json();
  return j?.choices?.[0]?.message?.content ?? "";
}

function findNIN(text: string): string | null {
  if (!text) return null;
  // 11 consecutive digits not part of a longer number
  const matches = text.replace(/[\s-]/g, "").match(/(?<!\d)\d{11}(?!\d)/g);
  return matches?.[0] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await authAdmin(req);
    if (!auth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const body = await req.json();
    const { action } = body;

    // Helper: load rows from either a Google Sheets URL, a raw CSV text, or pre-parsed rows
    async function loadRows(b: any): Promise<string[][]> {
      if (Array.isArray(b.rows)) return b.rows as string[][];
      if (typeof b.csv_text === "string" && b.csv_text.length) return parseCSV(b.csv_text);
      if (typeof b.sheet_url === "string" && b.sheet_url) {
        const id = extractSheetId(b.sheet_url);
        const gid = extractGid(b.sheet_url);
        const csvUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
        const r = await fetch(csvUrl, { redirect: "follow" });
        if (!r.ok) throw new Error(`Could not read sheet (${r.status}). Open the link in incognito to verify it's shared as 'Anyone with the link'. Or upload the file directly.`);
        const text = await r.text();
        if (text.trim().startsWith("<")) throw new Error("Sheet returned an HTML login page — sharing is not public. Upload the file directly instead.");
        return parseCSV(text);
      }
      throw new Error("Provide sheet_url, csv_text, or rows");
    }

    if (action === "preview") {
      const rows = await loadRows(body);
      const headers = rows[0] || [];
      const sample = rows.slice(1, 4);
      return new Response(JSON.stringify({ headers, sample, total: Math.max(0, rows.length - 1) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "create_batch") {
      const { sheet_url, image_column, name_column, source_label } = body;
      const allRows = await loadRows(body);
      const headers = allRows[0] || [];
      const imgIdx = headers.indexOf(image_column);
      if (imgIdx < 0) throw new Error(`Column not found: ${image_column}`);
      const nameIdx = name_column ? headers.indexOf(name_column) : -1;

      const dataRows = allRows.slice(1).map((r, i) => ({
        row_index: i + 2,
        image_url: (r[imgIdx] || "").trim(),
        full_name: nameIdx >= 0 ? (r[nameIdx] || "").trim() : null,
      })).filter(r => r.image_url);

      const { data: batch, error: be } = await auth.sb.from("nin_extraction_batches").insert({
        sheet_url: sheet_url || null,
        sheet_title: source_label || (sheet_url ? `Sheet ${extractSheetId(sheet_url).slice(0, 8)}` : "Uploaded file"),
        image_column,
        name_column: name_column || null,
        total_rows: dataRows.length,
        created_by: auth.user.id,
      }).select().single();
      if (be) throw be;

      // insert in chunks
      const chunk = 500;
      for (let i = 0; i < dataRows.length; i += chunk) {
        const slice = dataRows.slice(i, i + chunk).map(d => ({
          batch_id: batch.id,
          row_index: d.row_index,
          image_url: d.image_url,
          full_name: d.full_name,
          status: "pending",
        }));
        const { error: ie } = await auth.sb.from("nin_extraction_rows").insert(slice);
        if (ie) throw ie;
      }
      return new Response(JSON.stringify({ batch_id: batch.id, total: dataRows.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "process_row") {
      const { row_id } = body;
      const { data: row, error } = await auth.sb.from("nin_extraction_rows").select("*").eq("id", row_id).single();
      if (error || !row) throw new Error("Row not found");
      try {
        const resolved = resolveImageUrl(row.image_url);
        const dataUrl = await fetchImageAsDataUrl(resolved);
        const text = await ocrWithGemini(dataUrl);
        const nin = findNIN(text);
        const update: any = {
          resolved_image_url: resolved,
          raw_text: text.slice(0, 4000),
          nin,
          status: nin ? "extracted" : "no_nin_found",
          error_message: nin ? null : "No 11-digit NIN detected in OCR text",
        };
        await auth.sb.from("nin_extraction_rows").update(update).eq("id", row_id);
        return new Response(JSON.stringify({ ok: true, nin, status: update.status }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e: any) {
        await auth.sb.from("nin_extraction_rows").update({
          status: "failed",
          error_message: e.message?.slice(0, 500) || "Unknown error",
        }).eq("id", row_id);
        return new Response(JSON.stringify({ ok: false, error: e.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    if (action === "recount") {
      const { batch_id } = body;
      const { data: rows } = await auth.sb.from("nin_extraction_rows").select("status").eq("batch_id", batch_id);
      const extracted = (rows || []).filter((r: any) => r.status === "extracted").length;
      const failed = (rows || []).filter((r: any) => r.status === "failed" || r.status === "no_nin_found").length;
      await auth.sb.from("nin_extraction_batches").update({ extracted_count: extracted, failed_count: failed }).eq("id", batch_id);
      return new Response(JSON.stringify({ extracted, failed }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
