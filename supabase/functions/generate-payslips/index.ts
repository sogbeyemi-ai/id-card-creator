import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "https://esm.sh/pdf-lib@1.17.1";

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

interface ProtenRow {
  key: string;
  label: string;
  format: "text" | "currency" | "number";
  highlight?: boolean;
}

const PROTEN_ROWS: ProtenRow[] = [
  { key: "staff_name", label: "NAME", format: "text" },
  { key: "designation", label: "DESIGNATION", format: "text" },
  { key: "working_days", label: "WORKING DAYS", format: "number" },
  { key: "days_worked", label: "DAYS WORKED", format: "number" },
  { key: "month_income", label: "MONTH'S INCOME", format: "currency", highlight: true },
  { key: "month_gross", label: "MONTH'S GROSS", format: "currency" },
  { key: "basic", label: "BASIC", format: "currency" },
  { key: "housing", label: "HOUSING", format: "currency" },
  { key: "transport", label: "TRANSPORT", format: "currency" },
  { key: "other_allowance", label: "OTHER ALLOWANCE", format: "currency" },
  { key: "performance", label: "PERFORMANCE", format: "currency" },
  { key: "hazardous", label: "HAZARDOUS", format: "currency" },
  { key: "overtime", label: "OVERTIME", format: "currency" },
  { key: "inlieu", label: "INLIEU", format: "currency" },
  { key: "deduction", label: "DEDUCTION", format: "currency" },
  { key: "final_gross_salary", label: "FINAL GROSS SALARY", format: "currency" },
  { key: "contributory_pension_deduction", label: "CONTRIBUTORY PENSION DEDUCTION", format: "currency" },
  { key: "tax_payable", label: "TAX PAYABLE", format: "currency" },
  { key: "tax_percentage", label: "TAX PERCENTAGE", format: "text" },
  { key: "net_pay", label: "NET SALARY", format: "currency", highlight: true },
];

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

// Strip characters Helvetica can't encode (WinAnsi). The Naira sign ₦ falls
// outside WinAnsi, so currencies are formatted with the ISO code instead.
function safeText(s: string): string {
  return s.replace(/[^\x20-\x7E]/g, (ch) => {
    if (ch === "\u20A6") return "NGN ";
    if (ch === "\u20AC") return "EUR ";
    if (ch === "\u00A3") return "GBP ";
    return "";
  });
}

async function tryEmbedImage(pdfDoc: PDFDocument, url: string | null | undefined) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
    return isPng ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
  } catch (e) {
    console.error("logo fetch failed", e);
    return null;
  }
}

function drawWrappedText(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  x: number,
  y: number,
  maxWidth: number,
  color = rgb(0, 0, 0)
): number {
  // Returns the y of the last line baseline.
  const words = text.split(/\s+/);
  let line = "";
  let curY = y;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      page.drawText(line, { x, y: curY, size, font, color });
      curY -= size + 2;
      line = w;
    } else {
      line = test;
    }
  }
  if (line) page.drawText(line, { x, y: curY, size, font, color });
  return curY;
}

async function renderStructuredProten(
  admin: any,
  client: any,
  cycle: any,
  template: any,
  row: any,
  currency: string
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  // A4 in points: 595.28 x 841.89
  const W = 595.28;
  const H = 841.89;
  const page = pdfDoc.addPage([W, H]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const green = rgb(0.486, 0.722, 0.275); // #7CB846 left labels
  const purple = rgb(0.553, 0.31, 0.71); // #8D4FB5 highlight
  const ink = rgb(0.1, 0.1, 0.1);
  const lineCol = rgb(0.85, 0.85, 0.85);

  const M = 36; // page margin

  // === Header: client logo (left) and PROTEN logo (right) ===
  const clientLogo = await tryEmbedImage(pdfDoc, client?.logo_url);
  const protenLogo = await tryEmbedImage(pdfDoc, template?.background_url);
  // Note: we treat template.background_url as the optional PROTEN/right logo URL when in structured mode.
  // We also fall back to a saved client.logo_url for the left.

  const logoH = 48;
  if (clientLogo) {
    const ratio = clientLogo.width / clientLogo.height;
    page.drawImage(clientLogo, { x: M, y: H - M - logoH, width: logoH * ratio, height: logoH });
  } else if (client?.name) {
    page.drawText(safeText(client.name), { x: M, y: H - M - 22, size: 14, font: fontBold, color: ink });
  }
  if (protenLogo) {
    const ratio = protenLogo.width / protenLogo.height;
    const w = logoH * ratio;
    page.drawImage(protenLogo, { x: W - M - w, y: H - M - logoH, width: w, height: logoH });
  }

  // === Title and date ===
  const period = (cycle.period_label || "").toUpperCase();
  const title = `PAYSLIP – ${period}`;
  const titleSize = 16;
  const titleW = fontBold.widthOfTextAtSize(safeText(title), titleSize);
  let cursorY = H - M - logoH - 24;
  page.drawText(safeText(title), { x: (W - titleW) / 2, y: cursorY, size: titleSize, font: fontBold, color: ink });

  cursorY -= 18;
  let dateText = "";
  if (cycle.pay_date) {
    const d = new Date(cycle.pay_date);
    if (!isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yy = d.getFullYear();
      dateText = `DATE: ${dd}/${mm}/${yy}`;
    }
  }
  if (dateText) {
    const dW = font.widthOfTextAtSize(dateText, 10);
    page.drawText(dateText, { x: (W - dW) / 2, y: cursorY, size: 10, font, color: ink });
    cursorY -= 16;
  } else {
    cursorY -= 6;
  }

  // === Table ===
  const tableX = M;
  const tableW = W - M * 2;
  const labelW = tableW * 0.55;
  const valueW = tableW - labelW;
  const rowH = 20;
  let y = cursorY - 8;
  const data = row.data || {};

  for (const r of PROTEN_ROWS) {
    const rowTop = y;
    const rowBottom = y - rowH;
    // Left cell — green for normal rows, purple for highlight
    const leftFill = r.highlight ? purple : green;
    page.drawRectangle({ x: tableX, y: rowBottom, width: labelW, height: rowH, color: leftFill });
    // Right cell — white with purple fill on highlight
    if (r.highlight) {
      page.drawRectangle({ x: tableX + labelW, y: rowBottom, width: valueW, height: rowH, color: rgb(0.949, 0.910, 0.973) });
    }
    // Borders
    page.drawRectangle({ x: tableX, y: rowBottom, width: tableW, height: rowH, borderColor: lineCol, borderWidth: 0.5, color: undefined as any });

    // Label text (white on green/purple)
    const labelSize = 9;
    const labelText = safeText(r.label);
    page.drawText(labelText, {
      x: tableX + 8,
      y: rowBottom + (rowH - labelSize) / 2 + 1,
      size: labelSize,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    // Value (right cell, right-aligned)
    const raw = data[r.key];
    const valStr = safeText(fmt(raw, r.format, currency));
    const valSize = 9;
    const valW = font.widthOfTextAtSize(valStr, valSize);
    page.drawText(valStr, {
      x: tableX + labelW + valueW - 8 - valW,
      y: rowBottom + (rowH - valSize) / 2 + 1,
      size: valSize,
      font: r.highlight ? fontBold : font,
      color: ink,
    });

    y -= rowH;
  }

  // === Signature footer ===
  y -= 32;
  const sigLineW = 180;
  page.drawLine({ start: { x: tableX, y }, end: { x: tableX + sigLineW, y }, thickness: 0.7, color: ink });
  page.drawLine({ start: { x: W - M - sigLineW, y }, end: { x: W - M, y }, thickness: 0.7, color: ink });
  page.drawText("Authorised Signatory", { x: tableX, y: y - 12, size: 9, font, color: ink });
  page.drawText("Employee Signature", { x: W - M - sigLineW, y: y - 12, size: 9, font, color: ink });

  // Footer note
  drawWrappedText(
    page,
    "This payslip is computer-generated and does not require a physical signature.",
    font,
    8,
    M,
    M + 6,
    W - M * 2,
    rgb(0.5, 0.5, 0.5)
  );

  return await pdfDoc.save();
}

async function renderCoordinate(
  admin: any,
  cycle: any,
  template: any,
  row: any,
  currency: string
): Promise<Uint8Array> {
  const placements = (template.field_layout || []) as Placement[];
  const bgRes = await fetch(template.background_url);
  const bgBytes = new Uint8Array(await bgRes.arrayBuffer());
  const isPdf = bgBytes[0] === 0x25 && bgBytes[1] === 0x50 && bgBytes[2] === 0x44 && bgBytes[3] === 0x46;
  const isPng = bgBytes[0] === 0x89 && bgBytes[1] === 0x50 && bgBytes[2] === 0x4e && bgBytes[3] === 0x47;

  let pdfDoc: PDFDocument;
  let page: any;
  let pageW: number;
  let pageH: number;

  if (isPdf) {
    const tplDoc = await PDFDocument.load(bgBytes);
    pdfDoc = await PDFDocument.create();
    const [copied] = await pdfDoc.copyPages(tplDoc, [0]);
    page = pdfDoc.addPage(copied);
    pageW = page.getWidth();
    pageH = page.getHeight();
  } else {
    pdfDoc = await PDFDocument.create();
    pageW = template.width;
    pageH = template.height;
    page = pdfDoc.addPage([pageW, pageH]);
    const img = isPng ? await pdfDoc.embedPng(bgBytes) : await pdfDoc.embedJpg(bgBytes);
    page.drawImage(img, { x: 0, y: 0, width: pageW, height: pageH });
  }

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (const p of placements) {
    const raw = (row.data as any)?.[p.key];
    const text = safeText(fmt(raw, p.format, currency));
    if (!text) continue;
    const f = p.bold ? fontBold : font;
    const size = p.fontSize;
    const tw = f.widthOfTextAtSize(text, size);
    let x = p.x * pageW;
    const y = pageH - p.y * pageH - size;
    if (p.align === "center") x -= tw / 2;
    if (p.align === "right") x -= tw;
    page.drawText(text, { x, y, size, font: f, color: rgb(0, 0, 0) });
  }

  return await pdfDoc.save();
}

function buildFileName(client: any, row: any, period: string): string {
  const clean = (s: string) => (s || "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const parts = (period || "").trim().split(/\s+/);
  const month = parts[0] || "Period";
  const year = parts[1] || "";
  const clientPart = clean(client?.name || client?.slug || "Client");
  const namePart = clean(row.staff_name || row.id);
  return [clientPart, namePart, month, year, "Payslip"].filter(Boolean).join("_") + ".pdf";
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

    const { data: cycle } = await admin
      .from("payroll_cycles")
      .select("*, payroll_clients(*), payroll_templates(*)")
      .eq("id", cycle_id)
      .maybeSingle();
    if (!cycle) throw new Error("Cycle not found");
    const tpl = cycle.payroll_templates;
    const client = cycle.payroll_clients;
    if (!tpl) throw new Error("No active template for this client");

    const currency = client?.currency || "NGN";
    const kind = tpl.template_kind || "coordinate";

    if (kind === "coordinate" && !tpl.background_url) {
      throw new Error("This template has no background image. Either upload one or switch to the structured layout.");
    }

    const { data: rows } = await admin.from("payroll_rows").select("*").eq("cycle_id", cycle_id);
    if (!rows || rows.length === 0) throw new Error("No rows to generate. Parse Excel first.");

    let generated = 0;
    for (const row of rows) {
      try {
        let pdfBytes: Uint8Array;
        if (kind === "structured_proten") {
          if (!row.staff_name || !String(row.staff_name).trim()) {
            throw new Error("Employee name is empty for this row");
          }
          pdfBytes = await renderStructuredProten(admin, client, cycle, tpl, row, currency);
        } else {
          pdfBytes = await renderCoordinate(admin, cycle, tpl, row, currency);
        }

        const fileName = buildFileName(client, row, cycle.period_label || "");
        const path = `${cycle_id}/${fileName}`;
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
