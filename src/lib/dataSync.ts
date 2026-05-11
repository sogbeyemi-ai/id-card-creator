import * as XLSX from "xlsx";

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

export function exportToXlsx(headers: string[], rows: Record<string, any>[], fileName: string) {
  const ordered = rows.map((r) => {
    const o: Record<string, any> = {};
    headers.forEach((h) => (o[h] = r[h] ?? ""));
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(ordered, { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Master");
  XLSX.writeFile(wb, fileName);
}

export function confidenceBadge(score: number) {
  if (score >= 100) return { label: "Exact 100%", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" };
  if (score >= 80) return { label: `Strong ${score}%`, className: "bg-blue-500/15 text-blue-600 border-blue-500/30" };
  if (score >= 60) return { label: `Weak ${score}%`, className: "bg-amber-500/15 text-amber-700 border-amber-500/30" };
  return { label: `${score}%`, className: "bg-destructive/15 text-destructive border-destructive/30" };
}
