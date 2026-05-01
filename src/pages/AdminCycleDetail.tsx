import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Upload, FileSpreadsheet, FileText, Download, Loader2, RefreshCw, Eye } from "lucide-react";
import { toast } from "sonner";

export default function AdminCycleDetail() {
  const { id } = useParams();
  const [cycle, setCycle] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [zipping, setZipping] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data: cy } = await supabase
      .from("payroll_cycles")
      .select("*, payroll_clients(name, slug, currency), payroll_templates(name, field_layout, background_url)")
      .eq("id", id)
      .maybeSingle();
    setCycle(cy);
    const { data: rs } = await supabase.from("payroll_rows").select("*").eq("cycle_id", id).order("created_at");
    setRows(rs || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const handleExcelUpload = async (file: File) => {
    if (!id) return;
    setUploading(true);
    try {
      const path = `${id}/source_${Date.now()}_${file.name}`;
      const { error: upErr } = await supabase.storage.from("payroll-templates").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("payroll-templates").getPublicUrl(path);
      const { error } = await supabase.from("payroll_cycles").update({ source_file_url: pub.publicUrl, status: "uploaded" }).eq("id", id);
      if (error) throw error;
      toast.success("Excel uploaded. Now parse it.");
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const callFn = async (name: string) => {
    const { data, error } = await supabase.functions.invoke(name, { body: { cycle_id: id } });
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    return data;
  };

  const handleParse = async () => {
    setParsing(true);
    try { const d = await callFn("parse-payroll-excel"); toast.success(`Parsed ${(d as any).rows} rows`); load(); }
    catch (e: any) { toast.error(e.message); }
    finally { setParsing(false); }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try { const d = await callFn("generate-payslips"); toast.success(`Generated ${(d as any).generated}/${(d as any).total} payslips`); load(); }
    catch (e: any) { toast.error(e.message); }
    finally { setGenerating(false); }
  };

  const handleZip = async () => {
    setZipping(true);
    try {
      const d: any = await callFn("zip-payslips");
      if (d.signed_url) {
        window.open(d.signed_url, "_blank");
        toast.success("ZIP ready");
      }
    } catch (e: any) { toast.error(e.message); }
    finally { setZipping(false); }
  };

  const previewPdf = async (path: string) => {
    const { data, error } = await supabase.storage.from("payslips").createSignedUrl(path, 600);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank");
  };

  if (loading || !cycle) return <div className="p-6">Loading...</div>;
  const clientId = cycle.client_id;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link to={`/admin/clients/${clientId}`}><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold">{cycle.payroll_clients?.name} — {cycle.period_label}</h1>
          <p className="text-sm text-muted-foreground">Status: <Badge variant="secondary">{cycle.status}</Badge></p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-xs">Source Excel</CardTitle></CardHeader>
          <CardContent>
            <input type="file" accept=".xlsx,.xls" id="excel-up" className="hidden"
              onChange={(e) => e.target.files?.[0] && handleExcelUpload(e.target.files[0])} />
            <label htmlFor="excel-up">
              <Button asChild size="sm" disabled={uploading} className="w-full">
                <span><Upload className="w-3.5 h-3.5 mr-1.5" />{uploading ? "Uploading..." : cycle.source_file_url ? "Replace" : "Upload"}</span>
              </Button>
            </label>
          </CardContent></Card>

        <Card><CardHeader><CardTitle className="text-xs">Parse Rows</CardTitle></CardHeader>
          <CardContent>
            <Button size="sm" className="w-full" disabled={!cycle.source_file_url || parsing} onClick={handleParse}>
              {parsing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />}
              {parsing ? "Parsing..." : `Parse (${cycle.total_rows})`}
            </Button>
          </CardContent></Card>

        <Card><CardHeader><CardTitle className="text-xs">Generate PDFs</CardTitle></CardHeader>
          <CardContent>
            <Button size="sm" className="w-full" disabled={cycle.total_rows === 0 || generating} onClick={handleGenerate}>
              {generating ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <FileText className="w-3.5 h-3.5 mr-1.5" />}
              {generating ? "Generating..." : `Generate (${cycle.total_generated})`}
            </Button>
          </CardContent></Card>

        <Card><CardHeader><CardTitle className="text-xs">Download ZIP</CardTitle></CardHeader>
          <CardContent>
            <Button size="sm" className="w-full" disabled={cycle.total_generated === 0 || zipping} onClick={handleZip}>
              {zipping ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
              {zipping ? "Zipping..." : "Download ZIP"}
            </Button>
          </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Rows ({rows.length})</CardTitle>
          <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
        </CardHeader>
        <CardContent className="p-0 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Net Pay</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.staff_name || "—"}</TableCell>
                  <TableCell>{r.data?.net_pay ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "generated" ? "default" : r.status === "error" ? "destructive" : "secondary"}>
                      {r.status}
                    </Badge>
                    {r.error_message && <p className="text-xs text-destructive mt-1">{r.error_message}</p>}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.pdf_url && (
                      <Button size="sm" variant="ghost" onClick={() => previewPdf(r.pdf_url)}>
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
