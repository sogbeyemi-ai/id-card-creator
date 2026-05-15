import * as XLSX from "xlsx";
import ExcelJS from "exceljs";

export interface ParsedSheet {
  fileName: string;
  headers: string[];
  rows: Record<string, any>[];
}

export async function parseFileLocal(file: File): Promise<ParsedSheet> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true, cellNF: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "", raw: false, dateNF: "yyyy-mm-dd" });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return { fileName: file.name, headers, rows };
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

function detectType(values: any[]): "number" | "date" | "text" {
  let nums = 0, dates = 0, nonEmpty = 0;
  for (const v of values) {
    if (v === null || v === undefined || v === "") continue;
    nonEmpty++;
    if (v instanceof Date) { dates++; continue; }
    if (typeof v === "number" && Number.isFinite(v)) { nums++; continue; }
    if (typeof v === "string") {
      const s = v.trim();
      if (ISO_DATE_RE.test(s)) { dates++; continue; }
      const n = Number(s.replace(/,/g, ""));
      if (s !== "" && Number.isFinite(n)) { nums++; continue; }
    }
  }
  if (nonEmpty === 0) return "text";
  if (dates / nonEmpty >= 0.7) return "date";
  if (nums / nonEmpty >= 0.7) return "number";
  return "text";
}

function coerce(value: any, type: "number" | "date" | "text"): any {
  if (value === null || value === undefined || value === "") return null;
  if (type === "number") {
    if (typeof value === "number") return value;
    const n = Number(String(value).replace(/,/g, ""));
    return Number.isFinite(n) ? n : value;
  }
  if (type === "date") {
    if (value instanceof Date) return value;
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d;
  }
  return value;
}

export async function exportToXlsx(headers: string[], rows: Record<string, any>[], fileName: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PROTEN ID Generator";
  wb.created = new Date();
  const ws = wb.addWorksheet("Master", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  // Detect column types
  const types = headers.map((h) => detectType(rows.map((r) => r[h])));

  // Columns with width estimation
  ws.columns = headers.map((h, i) => {
    const sampleLen = Math.max(
      h.length,
      ...rows.slice(0, 200).map((r) => {
        const v = r[h];
        if (v === null || v === undefined) return 0;
        if (v instanceof Date) return 10;
        return String(v).length;
      }),
    );
    const width = Math.min(50, Math.max(12, sampleLen + 2));
    return { header: h, key: h, width };
  });

  // Add data rows with coercion
  rows.forEach((r) => {
    const row: Record<string, any> = {};
    headers.forEach((h, i) => { row[h] = coerce(r[h], types[i]); });
    ws.addRow(row);
  });

  // Style header row
  const header = ws.getRow(1);
  header.height = 24;
  header.eachCell((cell) => {
    cell.font = { name: "Calibri", bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2A47" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF0F2A47" } },
      bottom: { style: "thin", color: { argb: "FF0F2A47" } },
      left: { style: "thin", color: { argb: "FF0F2A47" } },
      right: { style: "thin", color: { argb: "FF0F2A47" } },
    };
  });

  // Style body rows
  const lastRow = ws.rowCount;
  const thin = { style: "thin" as const, color: { argb: "FFE2E8F0" } };
  for (let r = 2; r <= lastRow; r++) {
    const row = ws.getRow(r);
    const zebra = r % 2 === 0;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const type = types[colNumber - 1];
      cell.font = { name: "Calibri", size: 10, color: { argb: "FF1A202C" } };
      cell.alignment = {
        vertical: "middle",
        horizontal: type === "number" ? "right" : "left",
        wrapText: type === "text",
      };
      cell.border = { top: thin, bottom: thin, left: thin, right: thin };
      if (zebra) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7FAFC" } };
      }
      if (type === "number" && cell.value !== null && cell.value !== undefined) {
        cell.numFmt = "#,##0.##";
      } else if (type === "date" && cell.value instanceof Date) {
        cell.numFmt = "yyyy-mm-dd";
      }
    });
  }

  // Auto-filter across header range
  if (headers.length > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: headers.length },
    };
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function confidenceBadge(score: number) {
  if (score >= 100) return { label: "Exact 100%", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" };
  if (score >= 80) return { label: `Strong ${score}%`, className: "bg-blue-500/15 text-blue-600 border-blue-500/30" };
  if (score >= 60) return { label: `Weak ${score}%`, className: "bg-amber-500/15 text-amber-700 border-amber-500/30" };
  return { label: `${score}%`, className: "bg-destructive/15 text-destructive border-destructive/30" };
}
