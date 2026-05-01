import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Placement {
  key: string;
  label: string;
  x: number;
  y: number;
  fontSize: number;
  align: "left" | "center" | "right";
  bold?: boolean;
  format?: "text" | "currency" | "date" | "number";
}

function fmt(value: any, format: string | undefined, currency: string): string {
  if (value === null || value === undefined || value === "") return "";
  if (format === "currency") {
    const n = Number(value);
    if (Number.isFinite(n)) {
      try {
        return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
      } catch {
        return `${currency} ${n.toFixed(2)}`;
      }
    }
  }
  if (format === "number") {
    const n = Number(value);
    if (Number.isFinite(n)) return n.toLocaleString();
  }
  return String(value);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await admin.rpc("is_approved_admin", { _user_id: user.id });
    if (!isAdmin) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });

    const { cycle_id } = await req.json();

    const { data: cycle } = await admin.from("payroll_cycles").select("*, payroll_clients(*), payroll_templates(*)").eq("id", cycle_id).maybeSingle();
    if (!cycle) throw new Error("Cycle not found");
    const tpl = cycle.payroll_templates;
    const client = cycle.payroll_clients;
    if (!tpl) throw new Error("No active template for this client");

    const placements = (tpl.field_layout || []) as Placement[];
    const currency = client?.currency || "NGN";

    // Fetch background bytes (PDF, PNG, or JPG)
    const bgRes = await fetch(tpl.background_url);
    const bgBytes = new Uint8Array(await bgRes.arrayBuffer());
    // Detect format by magic bytes
    const isPdf = bgBytes[0] === 0x25 && bgBytes[1] === 0x50 && bgBytes[2] === 0x44 && bgBytes[3] === 0x46; // %PDF
    const isPng = bgBytes[0] === 0x89 && bgBytes[1] === 0x50 && bgBytes[2] === 0x4e && bgBytes[3] === 0x47;
    console.log("Template format:", isPdf ? "PDF" : isPng ? "PNG" : "JPG", "size:", bgBytes.length);

    // For PDF templates, pre-load source doc to copy first page each time
    let templatePdf: PDFDocument | null = null;
    let tplPageWidth = tpl.width;
    let tplPageHeight = tpl.height;
    if (isPdf) {
      templatePdf = await PDFDocument.load(bgBytes);
      const firstPage = templatePdf.getPage(0);
      tplPageWidth = firstPage.getWidth();
      tplPageHeight = firstPage.getHeight();
    }

    // Fetch rows
    const { data: rows } = await admin.from("payroll_rows").select("*").eq("cycle_id", cycle_id);
    if (!rows || rows.length === 0) throw new Error("No rows to generate. Parse Excel first.");

    let generated = 0;
    for (const row of rows) {
      try {
        let pdfDoc: PDFDocument;
        let page: any;
        let pageW: number;
        let pageH: number;

        if (isPdf && templatePdf) {
          // Copy first page of the template PDF as the base
          pdfDoc = await PDFDocument.create();
          const [copied] = await pdfDoc.copyPages(templatePdf, [0]);
          page = pdfDoc.addPage(copied);
          pageW = tplPageWidth;
          pageH = tplPageHeight;
        } else {
          pdfDoc = await PDFDocument.create();
          pageW = tpl.width;
          pageH = tpl.height;
          page = pdfDoc.addPage([pageW, pageH]);
          const img = isPng ? await pdfDoc.embedPng(bgBytes) : await pdfDoc.embedJpg(bgBytes);
          page.drawImage(img, { x: 0, y: 0, width: pageW, height: pageH });
        }

        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        for (const p of placements) {
          const raw = (row.data as any)?.[p.key];
          const text = fmt(raw, p.format, currency);
          if (!text) continue;
          const f = p.bold ? fontBold : font;
          const size = p.fontSize;
          const textWidth = f.widthOfTextAtSize(text, size);
          let x = p.x * pageW;
          const y = pageH - p.y * pageH - size;
          if (p.align === "center") x -= textWidth / 2;
          if (p.align === "right") x -= textWidth;
          page.drawText(text, { x, y, size, font: f, color: rgb(0, 0, 0) });
        }

        const pdfBytes = await pdfDoc.save();
        const safeName = (row.staff_name || row.id).replace(/[^a-zA-Z0-9]+/g, "_");
        const path = `${cycle_id}/${safeName}_${row.id}.pdf`;
        const { error: upErr } = await admin.storage.from("payslips").upload(path, pdfBytes, {
          contentType: "application/pdf",
          upsert: true,
        });
        if (upErr) throw upErr;

        await admin.from("payroll_rows").update({ pdf_url: path, status: "generated", error_message: null }).eq("id", row.id);
        generated++;
      } catch (rowErr: any) {
        console.error("row error", row.id, rowErr.message);
        await admin.from("payroll_rows").update({ status: "error", error_message: rowErr.message }).eq("id", row.id);
      }
    }

    await admin.from("payroll_cycles").update({ total_generated: generated, status: "generated" }).eq("id", cycle_id);

    return new Response(JSON.stringify({ success: true, generated, total: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
