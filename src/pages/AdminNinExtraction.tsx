import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Banknote, Download, FileSpreadsheet, Search, Play } from "lucide-react";

interface BatchRow {
  id: string;
  row_index: number;
  image_url: string;
  full_name: string | null;
  nin: string | null;
  status: string;
  error_message: string | null;
}

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/nin-extract`;

async function call(action: string, payload: Record<string, any> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify({ action, ...payload }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Request failed");
  return j;
}

export default function AdminNinExtraction() {
  const [sheetUrl, setSheetUrl] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [imageColumn, setImageColumn] = useState("");
  const [nameColumn, setNameColumn] = useState<string>("");
  const [previewing, setPreviewing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [filter, setFilter] = useState("");
  const stopRef = useRef(false);

  const loadRows = async (bid: string) => {
    const { data } = await supabase
      .from("nin_extraction_rows" as any)
      .select("id,row_index,image_url,full_name,nin,status,error_message")
      .eq("batch_id", bid)
      .order("row_index");
    setRows((data as any) || []);
  };

  useEffect(() => { if (batchId) loadRows(batchId); }, [batchId]);

  const preview = async () => {
    if (!sheetUrl.trim()) return toast.error("Paste a Google Sheets URL");
    setPreviewing(true);
    try {
      const r = await call("preview", { sheet_url: sheetUrl.trim() });
      setHeaders(r.headers);
      // best-guess image column
      const guess = r.headers.find((h: string) => /image|photo|url|nin/i.test(h)) || r.headers[0];
      setImageColumn(guess);
      toast.success(`Found ${r.total} rows`);
    } catch (e: any) { toast.error(e.message); }
    finally { setPreviewing(false); }
  };

  const createBatch = async () => {
    if (!imageColumn) return toast.error("Pick an image column");
    setCreating(true);
    try {
      const r = await call("create_batch", { sheet_url: sheetUrl.trim(), image_column: imageColumn, name_column: nameColumn || undefined });
      setBatchId(r.batch_id);
      toast.success(`Batch created (${r.total} rows). Click Process to start.`);
    } catch (e: any) { toast.error(e.message); }
    finally { setCreating(false); }
  };

  const processBatch = async () => {
    if (!batchId) return;
    setProcessing(true);
    setProgress(0);
    stopRef.current = false;
    try {
      const pending = rows.filter(r => r.status === "pending");
      const PARALLEL = 4;
      let i = 0; let done = 0;
      const worker = async () => {
        while (true) {
          if (stopRef.current) return;
          const idx = i++;
          if (idx >= pending.length) return;
          const row = pending[idx];
          try {
            await call("process_row", { row_id: row.id });
          } catch (e) { /* row will be marked failed in fn */ }
          done++;
          setProgress(Math.round((done / pending.length) * 100));
        }
      };
      await Promise.all(Array.from({ length: PARALLEL }, worker));
      await call("recount", { batch_id: batchId });
      await loadRows(batchId);
      toast.success("Processing complete");
    } catch (e: any) { toast.error(e.message); }
    finally { setProcessing(false); }
  };

  const exportCsv = () => {
    if (!rows.length) return;
    const headers = ["row_index", "full_name", "image_url", "nin", "status", "error_message"];
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [headers.join(","), ...rows.map(r => headers.map(h => esc((r as any)[h])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nin-extraction-${batchId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = filter
    ? rows.filter(r => JSON.stringify(r).toLowerCase().includes(filter.toLowerCase()))
    : rows;

  const stats = {
    total: rows.length,
    extracted: rows.filter(r => r.status === "extracted").length,
    failed: rows.filter(r => r.status === "failed" || r.status === "no_nin_found").length,
    pending: rows.filter(r => r.status === "pending").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Banknote className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-display font-bold">NIN Extraction</h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" /> Source sheet</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Public Google Sheets URL</Label>
            <div className="flex gap-2">
              <Input
                placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=0"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
              />
              <Button onClick={preview} disabled={previewing}>
                <Search className="w-4 h-4" /> {previewing ? "Reading…" : "Preview"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Sheet must be shared as “Anyone with the link”. Drive image URLs must also be public.</p>
          </div>

          {headers.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Image URL column *</Label>
                <Select value={imageColumn} onValueChange={setImageColumn}>
                  <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                  <SelectContent>{headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Name column (optional)</Label>
                <Select value={nameColumn} onValueChange={setNameColumn}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          )}

          {headers.length > 0 && (
            <Button onClick={createBatch} disabled={creating || !imageColumn}>
              {creating ? "Creating batch…" : "Create batch"}
            </Button>
          )}
        </CardContent>
      </Card>

      {batchId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Batch results</span>
              <div className="flex gap-2 text-xs">
                <Badge variant="outline">Total {stats.total}</Badge>
                <Badge className="bg-emerald-600">Extracted {stats.extracted}</Badge>
                <Badge variant="destructive">Failed {stats.failed}</Badge>
                <Badge variant="secondary">Pending {stats.pending}</Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <Button onClick={processBatch} disabled={processing || stats.pending === 0}>
                <Play className="w-4 h-4" /> {processing ? "Extracting NINs…" : `Extract NINs (${stats.pending} pending)`}
              </Button>
              {processing && <Button variant="outline" onClick={() => { stopRef.current = true; }}>Stop</Button>}
              <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
                <Download className="w-4 h-4" /> Export CSV
              </Button>
              <Input placeholder="Search…" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs ml-auto" />
            </div>
            {processing && <Progress value={progress} />}

            <div className="border rounded-md max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Image</TableHead>
                    <TableHead>NIN</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, 500).map(r => (
                    <TableRow key={r.id}>
                      <TableCell>{r.row_index}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.full_name || "—"}</TableCell>
                      <TableCell><a className="text-primary underline truncate inline-block max-w-[180px] align-middle" href={r.image_url} target="_blank" rel="noreferrer">{r.image_url}</a></TableCell>
                      <TableCell className="font-mono">{r.nin || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "extracted" ? "default" : r.status === "pending" ? "secondary" : "destructive"}>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate">{r.error_message || ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filtered.length > 500 && (
                <div className="p-2 text-xs text-muted-foreground text-center">Showing first 500 of {filtered.length} rows.</div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
