import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { exportToXlsx } from "@/lib/dataSync";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { Banknote, Download, FileSpreadsheet, Search, Play, Upload, History, Trash2, Pencil, FolderOpen, RefreshCw, Info, ChevronDown } from "lucide-react";

interface BatchRow {
  id: string;
  row_index: number;
  image_url: string;
  full_name: string | null;
  nin: string | null;
  status: string;
  error_message: string | null;
}

interface SavedBatch {
  id: string;
  sheet_title: string | null;
  sheet_url: string | null;
  image_column: string;
  total_rows: number;
  extracted_count: number;
  failed_count: number;
  created_at: string;
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
  const [mode, setMode] = useState<"url" | "upload">("url");
  const [sheetUrl, setSheetUrl] = useState("");
  const [uploadedRows, setUploadedRows] = useState<string[][] | null>(null);
  const [uploadedName, setUploadedName] = useState<string>("");
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
  const [savedBatches, setSavedBatches] = useState<SavedBatch[]>([]);
  const [historySearch, setHistorySearch] = useState("");
  const stopRef = useRef(false);

  const loadRows = async (bid: string) => {
    const { data } = await supabase
      .from("nin_extraction_rows" as any)
      .select("id,row_index,image_url,full_name,nin,status,error_message")
      .eq("batch_id", bid)
      .order("row_index");
    setRows((data as any) || []);
  };

  const loadSavedBatches = async () => {
    const { data } = await supabase
      .from("nin_extraction_batches" as any)
      .select("id,sheet_title,sheet_url,image_column,total_rows,extracted_count,failed_count,created_at")
      .order("created_at", { ascending: false });
    setSavedBatches((data as any) || []);
  };

  useEffect(() => { loadSavedBatches(); }, []);
  useEffect(() => { if (batchId) loadRows(batchId); }, [batchId]);

  const sourcePayload = () => mode === "upload"
    ? { rows: uploadedRows, source_label: uploadedName }
    : { sheet_url: sheetUrl.trim() };

  const handleFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "" }) as string[][];
      const cleaned = data.filter(r => r.some(c => String(c ?? "").trim().length));
      if (!cleaned.length) return toast.error("File is empty");
      setUploadedRows(cleaned.map(r => r.map(c => String(c ?? ""))));
      setUploadedName(file.name);
      setHeaders(cleaned[0]);
      const guess = cleaned[0].find(h => /image|photo|url|nin|link/i.test(h)) || cleaned[0][0];
      setImageColumn(guess);
      toast.success(`Loaded ${cleaned.length - 1} rows from ${file.name}`);
    } catch (e: any) { toast.error(`Could not read file: ${e.message}`); }
  };

  const preview = async () => {
    if (!sheetUrl.trim()) return toast.error("Paste a Google Sheets URL");
    setPreviewing(true);
    try {
      const r = await call("preview", { sheet_url: sheetUrl.trim() });
      setHeaders(r.headers);
      const guess = r.headers.find((h: string) => /image|photo|url|nin/i.test(h)) || r.headers[0];
      setImageColumn(guess);
      toast.success(`Found ${r.total} rows`);
    } catch (e: any) { toast.error(e.message); }
    finally { setPreviewing(false); }
  };

  const createBatch = async () => {
    if (!imageColumn) return toast.error("Pick an image column");
    if (mode === "upload" && !uploadedRows) return toast.error("Upload a file first");
    setCreating(true);
    try {
      const r = await call("create_batch", { ...sourcePayload(), image_column: imageColumn, name_column: nameColumn || undefined });
      setBatchId(r.batch_id);
      await loadSavedBatches();
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
      await loadSavedBatches();
      toast.success("Processing complete");
    } catch (e: any) { toast.error(e.message); }
    finally { setProcessing(false); }
  };

  const retryFailed = async () => {
    if (!batchId) return;
    try {
      await call("retry_failed", { batch_id: batchId });
      await loadRows(batchId);
      toast.success("Failed rows reset — click Extract NINs to retry.");
    } catch (e: any) { toast.error(e.message); }
  };

  const renameBatch = async (id: string, currentTitle: string | null) => {
    const title = prompt("New label for this extraction:", currentTitle || "");
    if (!title) return;
    try {
      await call("rename_batch", { batch_id: id, title });
      await loadSavedBatches();
      toast.success("Renamed");
    } catch (e: any) { toast.error(e.message); }
  };

  const deleteBatch = async (id: string) => {
    if (!confirm("Delete this extraction and all its rows? This cannot be undone.")) return;
    try {
      await call("delete_batch", { batch_id: id });
      if (batchId === id) { setBatchId(null); setRows([]); }
      await loadSavedBatches();
      toast.success("Deleted");
    } catch (e: any) { toast.error(e.message); }
  };

  const downloadBatchCsv = async (batch: SavedBatch) => {
    const { data } = await supabase
      .from("nin_extraction_rows" as any)
      .select("row_index,full_name,image_url,nin,status,error_message")
      .eq("batch_id", batch.id)
      .order("row_index");
    const list = (data as any[]) || [];
    if (!list.length) return toast.error("No rows to export");
    const hdrs = ["row_index", "full_name", "image_url", "nin", "status", "error_message"];
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [hdrs.join(","), ...list.map(r => hdrs.map(h => esc((r as any)[h])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safe = (batch.sheet_title || `batch-${batch.id.slice(0, 8)}`).replace(/[^a-z0-9-_]+/gi, "_");
    a.download = `nin-${safe}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    if (!rows.length) return;
    const hdrs = ["row_index", "full_name", "image_url", "nin", "status", "error_message"];
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [hdrs.join(","), ...rows.map(r => hdrs.map(h => esc((r as any)[h])).join(","))].join("\n");
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
    noNin: rows.filter(r => r.status === "no_nin_found").length,
    failed: rows.filter(r => r.status === "failed").length,
    pending: rows.filter(r => r.status === "pending").length,
  };

  const filteredHistory = savedBatches.filter(b => {
    if (!historySearch.trim()) return true;
    const q = historySearch.toLowerCase();
    return (b.sheet_title || "").toLowerCase().includes(q)
      || new Date(b.created_at).toLocaleString().toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Banknote className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-display font-bold">NIN Extraction</h1>
      </div>

      <Collapsible defaultOpen>
        <Card>
          <CardHeader>
            <CollapsibleTrigger className="flex items-center justify-between w-full group">
              <CardTitle className="text-base flex items-center gap-2">
                <History className="w-4 h-4" /> Saved extractions
                <Badge variant="secondary" className="ml-2">{savedBatches.length}</Badge>
              </CardTitle>
              <ChevronDown className="w-4 h-4 transition-transform group-data-[state=closed]:-rotate-90" />
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-3">
              <Input
                placeholder="Search by name or date…"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="max-w-sm"
              />
              {filteredHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No saved extractions yet. Create one below.</p>
              ) : (
                <div className="border rounded-md max-h-[40vh] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card">
                      <TableRow>
                        <TableHead>Label</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Extracted</TableHead>
                        <TableHead className="text-right">Failed</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredHistory.map(b => (
                        <TableRow key={b.id} className={batchId === b.id ? "bg-muted/50" : ""}>
                          <TableCell className="font-medium">{b.sheet_title || "Untitled"}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{new Date(b.created_at).toLocaleString()}</TableCell>
                          <TableCell className="text-right">{b.total_rows}</TableCell>
                          <TableCell className="text-right text-emerald-600">{b.extracted_count}</TableCell>
                          <TableCell className="text-right text-destructive">{b.failed_count}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="outline" onClick={() => setBatchId(b.id)} title="Open">
                                <FolderOpen className="w-3 h-3" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => downloadBatchCsv(b)} title="Download CSV">
                                <Download className="w-3 h-3" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => renameBatch(b.id, b.sheet_title)} title="Rename">
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => deleteBatch(b.id)} title="Delete" className="text-destructive hover:text-destructive">
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" /> New extraction</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Tabs value={mode} onValueChange={(v) => { setMode(v as any); setHeaders([]); setImageColumn(""); setNameColumn(""); }}>
            <TabsList>
              <TabsTrigger value="url"><FileSpreadsheet className="w-4 h-4 mr-1" /> Google Sheets URL</TabsTrigger>
              <TabsTrigger value="upload"><Upload className="w-4 h-4 mr-1" /> Upload file</TabsTrigger>
            </TabsList>
            <TabsContent value="url" className="space-y-1 pt-3">
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
              <p className="text-xs text-muted-foreground">Sheet must be shared as "Anyone with the link". If that fails, switch to Upload file.</p>
            </TabsContent>
            <TabsContent value="upload" className="space-y-1 pt-3">
              <Label>Upload CSV or Excel file (.csv, .xlsx, .xls)</Label>
              <Input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              {uploadedName && <p className="text-xs text-muted-foreground">Loaded: <span className="font-mono">{uploadedName}</span> · {uploadedRows ? uploadedRows.length - 1 : 0} data rows</p>}
              <p className="text-xs text-muted-foreground">Image URLs in the file must be publicly accessible (e.g. Google Drive "Anyone with the link").</p>
            </TabsContent>
          </Tabs>

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
            <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
              <span>Batch results</span>
              <div className="flex gap-2 text-xs flex-wrap">
                <Badge variant="outline">Total {stats.total}</Badge>
                <Badge className="bg-emerald-600">Extracted {stats.extracted}</Badge>
                <Badge variant="destructive">Failed {stats.failed}</Badge>
                <Badge className="bg-amber-600">No NIN found {stats.noNin}</Badge>
                <Badge variant="secondary">Pending {stats.pending}</Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(stats.failed > 0 || stats.noNin > 0) && (
              <Alert>
                <Info className="w-4 h-4" />
                <AlertTitle>Why some rows didn't extract</AlertTitle>
                <AlertDescription className="text-xs space-y-1 mt-1">
                  <div><strong>No NIN found</strong> — the image was read, but no 11-digit number was visible. Usually means: wrong document (e.g. driver's licence, voter's card, passport photo), blurry/low-quality scan, NIN digits cut off, or handwritten text.</div>
                  <div><strong>Failed</strong> — the image couldn't be read at all. Usually means: Google Drive link is not shared publicly, broken/404 URL, file isn't an image, or the OCR service was temporarily rate-limited.</div>
                  <div className="pt-1">Fix the source images or sharing permissions, then click <strong>Retry failed</strong>.</div>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap gap-2 items-center">
              <Button onClick={processBatch} disabled={processing || stats.pending === 0}>
                <Play className="w-4 h-4" /> {processing ? "Extracting NINs…" : `Extract NINs (${stats.pending} pending)`}
              </Button>
              {(stats.failed > 0 || stats.noNin > 0) && (
                <Button variant="outline" onClick={retryFailed} disabled={processing}>
                  <RefreshCw className="w-4 h-4" /> Retry failed ({stats.failed + stats.noNin})
                </Button>
              )}
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
                      <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate" title={r.error_message || ""}>{r.error_message || ""}</TableCell>
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
