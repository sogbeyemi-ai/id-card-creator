import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, Download, ArrowLeft, History, Undo2, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { parseFileLocal, exportToXlsx } from "@/lib/dataSync";
import { Progress } from "@/components/ui/progress";

interface MasterRow { id: string; data: Record<string, any>; }

export default function AdminDataSyncWorkspace() {
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState<any>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<MasterRow[]>([]);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [runs, setRuns] = useState<any[]>([]);
  const [googleUrl, setGoogleUrl] = useState("");
  const masterInputRef = useRef<HTMLInputElement>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data: ws } = await supabase.from("sync_workspaces" as any).select("*").eq("id", workspaceId).single();
    setWorkspace(ws);
    const { data: sheet } = await supabase
      .from("sync_master_sheets" as any).select("headers").eq("workspace_id", workspaceId)
      .order("uploaded_at", { ascending: false }).limit(1).maybeSingle();
    setHeaders(((sheet as any)?.headers as string[]) || []);
    const { data: mr } = await supabase
      .from("sync_master_rows" as any).select("id, data").eq("workspace_id", workspaceId).limit(5000);
    setRows((mr as any) || []);
    const { data: rs } = await supabase
      .from("sync_runs" as any).select("*").eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    setRuns((rs as any) || []);
  };

  useEffect(() => { if (workspaceId) load(); }, [workspaceId]);

  const uploadMaster = async (file: File, replace = true) => {
    setBusy(true); setProgress(20);
    try {
      const parsed = await parseFileLocal(file);
      setProgress(60);
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/data-sync-master-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          workspace_id: workspaceId,
          file_name: parsed.fileName,
          headers: parsed.headers,
          rows: parsed.rows,
          replace,
        }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || "Upload failed");
      setProgress(100);
      toast.success(`Master updated: ${result.count} rows`);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); setTimeout(() => setProgress(0), 600); }
  };

  const startSync = async (file?: File, gUrl?: string) => {
    setBusy(true); setProgress(15);
    try {
      let parsed: { fileName: string; headers: string[]; rows: any[] };
      const { data: { session } } = await supabase.auth.getSession();
      if (gUrl) {
        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/data-sync-parse`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ google_sheet_url: gUrl }),
        });
        const r = await resp.json();
        if (!resp.ok) throw new Error(r.error);
        parsed = { fileName: r.fileName, headers: r.headers, rows: r.rows };
      } else if (file) {
        parsed = await parseFileLocal(file);
      } else return;
      setProgress(50);
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/data-sync-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          workspace_id: workspaceId,
          source_file_name: parsed.fileName,
          source_headers: parsed.headers,
          source_rows: parsed.rows,
          threshold: 80,
        }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || "Match failed");
      setProgress(100);
      toast.success("Sync prepared — review changes");
      navigate(`/admin/data-sync/${workspaceId}/run/${result.run_id}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); setTimeout(() => setProgress(0), 600); }
  };

  const rollback = async (runId: string) => {
    if (!confirm("Restore master to its state before this sync?")) return;
    const { data: { session } } = await supabase.auth.getSession();
    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/data-sync-rollback`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ run_id: runId }),
    });
    const r = await resp.json();
    if (!resp.ok) toast.error(r.error || "Rollback failed");
    else { toast.success(`Rolled back ${r.restored} changes`); await load(); }
  };

  const filtered = filter
    ? rows.filter((r) => JSON.stringify(r.data).toLowerCase().includes(filter.toLowerCase()))
    : rows;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild><Link to="/admin/data-sync"><ArrowLeft className="w-4 h-4" /> Back</Link></Button>
        <h1 className="text-2xl font-display font-bold">{workspace?.name || "Workspace"}</h1>
      </div>

      {busy && <Progress value={progress} />}

      <Tabs defaultValue="master">
        <TabsList>
          <TabsTrigger value="master">Master ({rows.length})</TabsTrigger>
          <TabsTrigger value="sync">New Sync</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="master" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={masterInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadMaster(e.target.files[0])} />
            <Button onClick={() => masterInputRef.current?.click()} disabled={busy}>
              <Upload className="w-4 h-4" /> {rows.length ? "Replace master" : "Upload master"}
            </Button>
            <Button variant="outline" onClick={() => exportToXlsx(headers, rows.map(r => r.data), `${workspace?.name || "master"}.xlsx`)} disabled={!rows.length}>
              <Download className="w-4 h-4" /> Export
            </Button>
            <Input placeholder="Search…" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs ml-auto" />
          </div>
          {rows.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
              <FileSpreadsheet className="w-10 h-10 mx-auto mb-2 opacity-50" />
              No master sheet yet. Upload one to get started.
            </CardContent></Card>
          ) : (
            <div className="border rounded-md max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>{headers.map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, 500).map((r) => (
                    <TableRow key={r.id}>
                      {headers.map((h) => <TableCell key={h} className="whitespace-nowrap">{String(r.data[h] ?? "")}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filtered.length > 500 && (
                <div className="p-2 text-xs text-muted-foreground text-center">Showing first 500 of {filtered.length} rows.</div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sync" className="space-y-4">
          {!rows.length ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">Upload a master sheet first.</CardContent></Card>
          ) : (
            <>
              <Card>
                <CardHeader><CardTitle className="text-base">Upload source file</CardTitle></CardHeader>
                <CardContent>
                  <input ref={sourceInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                    onChange={(e) => e.target.files?.[0] && startSync(e.target.files[0])} />
                  <Button onClick={() => sourceInputRef.current?.click()} disabled={busy}>
                    <Upload className="w-4 h-4" /> Choose Excel/CSV
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">Drop-in Excel (.xlsx), CSV. Headers will be auto-aligned.</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><LinkIcon className="w-4 h-4" /> Or paste Google Sheets link</CardTitle></CardHeader>
                <CardContent className="flex gap-2">
                  <Input placeholder="https://docs.google.com/spreadsheets/d/…" value={googleUrl} onChange={(e) => setGoogleUrl(e.target.value)} />
                  <Button onClick={() => startSync(undefined, googleUrl)} disabled={busy || !googleUrl.trim()}>Sync</Button>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-2">
          {runs.length === 0 ? <p className="text-sm text-muted-foreground">No sync runs yet.</p> : runs.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <History className="w-4 h-4 text-muted-foreground" />
                <div className="flex-1">
                  <div className="font-medium text-sm">{r.source_file_name}</div>
                  <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
                </div>
                <Badge variant="outline">{r.status}</Badge>
                <Button variant="ghost" size="sm" asChild><Link to={`/admin/data-sync/${workspaceId}/run/${r.id}`}>Open</Link></Button>
                {r.status === "applied" && (
                  <Button variant="ghost" size="sm" onClick={() => rollback(r.id)}><Undo2 className="w-4 h-4" /></Button>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
