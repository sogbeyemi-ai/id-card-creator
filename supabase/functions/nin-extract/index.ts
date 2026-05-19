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

async function runOcr(dataUrl: string, model: string): Promise<{ nin: string | null; raw_text: string }> {
  const prompt = `You are extracting the Nigerian National Identification Number (NIN) from this image. The image is one of:
- A NIN slip (paper printout from NIMC)
- A NIN card (plastic ID card)
- A Nigerian international passport (the NIN is printed on the data page, often labelled "NIN" or in the machine-readable zone)
- Any other government document showing an 11-digit NIN

The NIN is ALWAYS exactly 11 digits. It may be printed:
- As a single run: 12345678901
- Spaced in groups: 1234 5678 901 or 123 4567 8901
- With dashes: 1234-5678-901
- Faint, low contrast, rotated, or near the edge of the image
- Labelled "NIN", "NIN No", "National Identification Number", "Identification Number", "ID No"

Look CAREFULLY. Read every number on the document. If you see an 11-digit number anywhere, that is almost certainly the NIN.

Return ONLY a strict JSON object (no markdown, no commentary) in this exact shape:
{"nin": "<11 digits only, no spaces or dashes, or null if truly not present>", "raw_text": "<all visible text on the document>"}`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": LOVABLE_API_KEY,
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      }],
      response_format: { type: "json_object" },
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    if (resp.status === 429) throw new Error("AI rate limit — try again shortly");
    if (resp.status === 402) throw new Error("AI credits exhausted — add credits in workspace settings");
    throw new Error(`OCR failed: ${resp.status} ${t.slice(0, 200)}`);
  }
  const j = await resp.json();
  const content: string = j?.choices?.[0]?.message?.content ?? "";

  let nin: string | null = null;
  let raw_text = content;
  try {
    const cleaned = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object") {
      raw_text = typeof parsed.raw_text === "string" ? parsed.raw_text : content;
      if (typeof parsed.nin === "string") {
        const digits = parsed.nin.replace(/\D/g, "");
        if (digits.length === 11) nin = digits;
      }
    }
  } catch {
    // Not JSON — fall through to regex on full content
  }
  if (!nin) nin = findNIN(raw_text) ?? findNIN(content);
  return { nin, raw_text };
}

function findNIN(text: string): string | null {
  if (!text) return null;
  // Strip whitespace (incl. NBSP), dashes, dots
  const normalized = text.replace(/[\s\u00A0\-\.]/g, "");

  // 1) Prefer labelled matches: "NIN: 12345678901" etc.
  const labelled = text.match(/(?:NIN|National\s*Identification\s*(?:Number|No\.?)|Identification\s*Number|ID\s*No\.?)\s*[:#\-]?\s*([\d\s\-\.]{11,20})/i);
  if (labelled) {
    const digits = labelled[1].replace(/\D/g, "");
    if (digits.length >= 11) {
      const candidate = digits.slice(0, 11);
      if (isPlausibleNIN(candidate)) return candidate;
    }
  }

  // 2) Any standalone 11-digit run (after stripping separators)
  const matches = normalized.match(/(?<!\d)\d{11}(?!\d)/g) || [];
  for (const m of matches) {
    if (isPlausibleNIN(m)) return m;
  }
  return matches[0] ?? null;
}

function isPlausibleNIN(d: string): boolean {
  if (!/^\d{11}$/.test(d)) return false;
  // Reject all-same digit
  if (/^(\d)\1{10}$/.test(d)) return false;
  // Reject obvious sequential
  if (d === "12345678901" || d === "01234567890" || d === "10987654321") return false;
  return true;
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

    // Dedupe by trimmed, case-insensitive name. Keep the LAST row with a non-empty image link.
    // Rows with empty/missing names are kept as-is (not grouped).
    function dedupeByName<T extends { full_name: string | null; image_url: string }>(rows: T[]): { kept: T[]; removed: number } {
      const lastIdxByName = new Map<string, number>();
      rows.forEach((r, i) => {
        const key = (r.full_name || "").trim().toLowerCase();
        if (!key) return;
        if (!r.image_url) return;
        lastIdxByName.set(key, i);
      });
      const kept: T[] = [];
      let removed = 0;
      rows.forEach((r, i) => {
        const key = (r.full_name || "").trim().toLowerCase();
        if (!key) { kept.push(r); return; }
        if (lastIdxByName.get(key) === i) kept.push(r);
        else removed++;
      });
      return { kept, removed };
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

      const rawDataRows = allRows.slice(1).map((r, i) => ({
        row_index: i + 2,
        image_url: (r[imgIdx] || "").trim(),
        full_name: nameIdx >= 0 ? (r[nameIdx] || "").trim() : null,
      })).filter(r => r.image_url);

      const { kept: dataRows, removed: duplicates_removed } = nameIdx >= 0
        ? dedupeByName(rawDataRows)
        : { kept: rawDataRows, removed: 0 };

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
      return new Response(JSON.stringify({ batch_id: batch.id, total: dataRows.length, duplicates_removed }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    if (action === "retry_failed") {
      const { batch_id } = body;
      const { error: ue } = await auth.sb.from("nin_extraction_rows")
        .update({ status: "pending", error_message: null, nin: null, raw_text: null })
        .eq("batch_id", batch_id)
        .in("status", ["failed", "no_nin_found"]);
      if (ue) throw ue;
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "rename_batch") {
      const { batch_id, title } = body;
      const { error: ue } = await auth.sb.from("nin_extraction_batches")
        .update({ sheet_title: title }).eq("id", batch_id);
      if (ue) throw ue;
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "delete_batch") {
      const { batch_id } = body;
      await auth.sb.from("nin_extraction_rows").delete().eq("batch_id", batch_id);
      await auth.sb.from("nin_extraction_batches").delete().eq("id", batch_id);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
