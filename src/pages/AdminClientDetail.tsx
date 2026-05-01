import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { TemplateDesigner } from "@/components/payroll/TemplateDesigner";
import { PAYSLIP_FIELDS, FieldPlacement, PROTEN_DEFAULT_MAPPING } from "@/lib/payslipFields";
import { ArrowLeft, Upload, Save, FileSpreadsheet, Plus, FileText, Download, Loader2, Eye, RefreshCw } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export default function AdminClientDetail() {
  const { id } = useParams();
  const [client, setClient] = useState<any>(null);
  const [template, setTemplate] = useState<any>(null);
  const [fields, setFields] = useState<FieldPlacement[]>([]);
  const [bgUploading, setBgUploading] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [savingMapping, setSavingMapping] = useState(false);
  const [cycles, setCycles] = useState<any[]>([]);
  const [newPeriod, setNewPeriod] = useState("");
  const [creatingCycle, setCreatingCycle] = useState(false);

  // Active (latest) cycle workflow state
  const [activeCycle, setActiveCycle] = useState<any>(null);
  const [activeRows, setActiveRows] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [periodLabel, setPeriodLabel] = useState("");
  const [payDate, setPayDate] = useState("");
  const [templateKind, setTemplateKind] = useState<"coordinate" | "structured_proten">("coordinate");
  const [savingTemplateKind, setSavingTemplateKind] = useState(false);

  const load = async () => {
    if (!id) return;
    const { data: c } = await supabase.from("payroll_clients").select("*").eq("id", id).maybeSingle();
    setClient(c);
    setColumnMapping((c?.default_column_mapping as Record<string, string>) || {});

    const { data: t } = await supabase
      .from("payroll_templates")
      .select("*")
      .eq("client_id", id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setTemplate(t);
    setFields((t?.field_layout as unknown as FieldPlacement[]) || []);
    setTemplateKind(((t?.template_kind as any) || "coordinate") as "coordinate" | "structured_proten");

    const { data: cy } = await supabase
      .from("payroll_cycles")
      .select("*")
      .eq("client_id", id)
      .order("created_at", { ascending: false });
    setCycles(cy || []);

    const latest = (cy || [])[0] || null;
    setActiveCycle(latest);
    if (latest) {
      setPeriodLabel(latest.period_label || "");
      setPayDate(latest.pay_date || "");
      const { data: rs } = await supabase
        .from("payroll_rows")
        .select("*")
        .eq("cycle_id", latest.id)
        .order("created_at");
      setActiveRows(rs || []);
    } else {
      const fallback = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
      setPeriodLabel(fallback);
      setPayDate("");
      setActiveRows([]);
    }
  };

  const ensureActiveCycle = async () => {
    if (activeCycle) return activeCycle;
    if (!id) return null;
    const monthLabel = (periodLabel || "").trim() || new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("payroll_cycles").insert({
      client_id: id,
      template_id: template?.id || null,
      period_label: monthLabel,
      pay_date: payDate || null,
      column_mapping: columnMapping,
      created_by: user?.id,
    }).select().single();
    if (error) { toast.error(error.message); return null; }
    setActiveCycle(data);
    return data;
  };

  const saveCyclePeriod = async () => {
    if (!activeCycle) {
      const c = await ensureActiveCycle();
      if (c) toast.success("Period saved");
      return;
    }
    const { error } = await supabase.from("payroll_cycles").update({
      period_label: periodLabel.trim() || activeCycle.period_label,
      pay_date: payDate || null,
    }).eq("id", activeCycle.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Period saved");
    load();
  };

  const saveTemplateKind = async (kind: "coordinate" | "structured_proten") => {
    if (!id) return;
    setTemplateKind(kind);
    setSavingTemplateKind(true);
    try {
      if (template) {
        const { error } = await supabase.from("payroll_templates").update({ template_kind: kind }).eq("id", template.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("payroll_templates").insert({
          client_id: id,
          template_kind: kind,
          background_url: "",
          width: 595,
          height: 842,
          field_layout: [],
        });
        if (error) throw error;
      }
      toast.success("Template style saved");
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingTemplateKind(false);
    }
  };

  const applyProtenDefaults = () => {
    setColumnMapping({ ...PROTEN_DEFAULT_MAPPING });
    toast.success("PROTEN defaults loaded — click Save Mapping");
  };

  const handleClientExcelUpload = async (file: File) => {
    if (!id) return;
    setUploading(true);
    try {
      const cycle = await ensureActiveCycle();
      if (!cycle) return;
      const path = `${cycle.id}/source_${Date.now()}_${file.name}`;
      const { error: upErr } = await supabase.storage.from("payroll-templates").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("payroll-templates").getPublicUrl(path);
      const { error } = await supabase.from("payroll_cycles")
        .update({ source_file_url: pub.publicUrl, status: "uploaded", column_mapping: columnMapping })
        .eq("id", cycle.id);
      if (error) throw error;
      toast.success("Excel uploaded. Now click Parse.");
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); }
  };

  const callFn = async (name: string, cycleId: string) => {
    const { data, error } = await supabase.functions.invoke(name, { body: { cycle_id: cycleId } });
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    return data;
  };

  const handleParse = async () => {
    if (!activeCycle) return;
    setParsing(true);
    try { const d: any = await callFn("parse-payroll-excel", activeCycle.id); toast.success(`Parsed ${d.rows} staff rows`); load(); }
    catch (e: any) { toast.error(e.message); }
    finally { setParsing(false); }
  };

  const handleGenerate = async () => {
    if (!activeCycle) return;
    setGenerating(true);
    try { const d: any = await callFn("generate-payslips", activeCycle.id); toast.success(`Generated ${d.generated}/${d.total} payslips`); load(); }
    catch (e: any) { toast.error(e.message); }
    finally { setGenerating(false); }
  };

  const handleZip = async () => {
    if (!activeCycle) return;
    setZipping(true);
    try {
      const d: any = await callFn("zip-payslips", activeCycle.id);
      if (d.signed_url) { window.open(d.signed_url, "_blank"); toast.success("ZIP ready"); }
    } catch (e: any) { toast.error(e.message); }
    finally { setZipping(false); }
  };

  const previewPdf = async (path: string) => {
    const { data, error } = await supabase.storage.from("payslips").createSignedUrl(path, 600);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank");
  };

  const startNewMonth = async () => {
    const label = prompt("Period label for the new payroll (e.g. November 2026):");
    if (!label?.trim() || !id) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("payroll_cycles").insert({
      client_id: id,
      template_id: template?.id || null,
      period_label: label.trim(),
      column_mapping: columnMapping,
      created_by: user?.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("New payroll started");
    load();
  };

  useEffect(() => { load(); }, [id]);

  const renderPdfFirstPageToPng = async (file: File): Promise<{ blob: Blob; width: number; height: number }> => {
    const pdfjs: any = await import("pdfjs-dist");
    // Use bundled worker via Vite ?url
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/png"));
    // Use the PDF's intrinsic point size for layout (viewport at scale 1)
    const baseVp = page.getViewport({ scale: 1 });
    return { blob, width: Math.round(baseVp.width), height: Math.round(baseVp.height) };
  };

  const handleBgUpload = async (file: File) => {
    if (!id) return;
    setBgUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      const isPdf = ext === "pdf" || file.type === "application/pdf";
      const path = `${id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("payroll-templates").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("payroll-templates").getPublicUrl(path);

      let width = 800;
      let height = 1100;
      let previewUrl: string | null = null;

      if (isPdf) {
        const { blob, width: w, height: h } = await renderPdfFirstPageToPng(file);
        width = w;
        height = h;
        const previewPath = `${id}/${Date.now()}_preview.png`;
        const { error: pErr } = await supabase.storage.from("payroll-templates").upload(previewPath, blob, { upsert: true, contentType: "image/png" });
        if (pErr) throw pErr;
        previewUrl = supabase.storage.from("payroll-templates").getPublicUrl(previewPath).data.publicUrl;
      } else {
        const img = new Image();
        img.src = pub.publicUrl;
        await new Promise((r) => { img.onload = r; img.onerror = r; });
        width = img.naturalWidth || 800;
        height = img.naturalHeight || 1100;
      }

      if (template) {
        const { error } = await supabase.from("payroll_templates").update({
          background_url: pub.publicUrl,
          preview_url: previewUrl,
          width,
          height,
        }).eq("id", template.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("payroll_templates").insert({
          client_id: id,
          background_url: pub.publicUrl,
          preview_url: previewUrl,
          width,
          height,
          field_layout: [],
        });
        if (error) throw error;
      }
      toast.success(isPdf ? "PDF template uploaded" : "Template uploaded");
      load();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message);
    } finally {
      setBgUploading(false);
    }
  };

  const saveLayout = async () => {
    if (!template) { toast.error("Upload a template image first"); return; }
    setSavingTemplate(true);
    const { error } = await supabase.from("payroll_templates")
      .update({ field_layout: fields as any })
      .eq("id", template.id);
    setSavingTemplate(false);
    if (error) toast.error(error.message);
    else toast.success("Layout saved");
  };

  const saveMapping = async () => {
    if (!id) return;
    setSavingMapping(true);
    const { error } = await supabase.from("payroll_clients")
      .update({ default_column_mapping: columnMapping })
      .eq("id", id);
    setSavingMapping(false);
    if (error) toast.error(error.message);
    else toast.success("Column mapping saved");
  };

  const createCycle = async () => {
    if (!id || !newPeriod.trim()) { toast.error("Enter a period label"); return; }
    setCreatingCycle(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("payroll_cycles").insert({
      client_id: id,
      template_id: template?.id || null,
      period_label: newPeriod.trim(),
      column_mapping: columnMapping,
      created_by: user?.id,
    }).select().single();
    setCreatingCycle(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Cycle created");
    setNewPeriod("");
    load();
  };

  if (!client) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/admin/clients"><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold">{client.name}</h1>
          <p className="text-sm text-muted-foreground">Currency: {client.currency}</p>
        </div>
      </div>

      <Tabs defaultValue="payroll">
        <TabsList>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="template">Template</TabsTrigger>
          <TabsTrigger value="mapping">Excel Mapping</TabsTrigger>
          <TabsTrigger value="cycles">History</TabsTrigger>
        </TabsList>

        <TabsContent value="payroll" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Current Payroll</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {activeCycle ? <>Period: <span className="font-medium">{activeCycle.period_label}</span> · Status: <Badge variant="secondary">{activeCycle.status}</Badge></> : "Upload an Excel sheet to start a new payroll."}
                </p>
              </div>
              {activeCycle && (
                <Button size="sm" variant="outline" onClick={startNewMonth}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />Start new period
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3 p-3 rounded-md bg-muted/40 border">
                <div>
                  <Label className="text-xs">Payroll period (e.g. April 2026)</Label>
                  <Input value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="April 2026" />
                </div>
                <div>
                  <Label className="text-xs">Pay date</Label>
                  <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Template style</Label>
                  <select
                    className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                    value={templateKind}
                    disabled={savingTemplateKind}
                    onChange={(e) => saveTemplateKind(e.target.value as any)}
                  >
                    <option value="coordinate">Image overlay (drag fields on uploaded image)</option>
                    <option value="structured_proten">Structured PROTEN layout (recreated, fixed labels)</option>
                  </select>
                </div>
                <div className="md:col-span-3 flex justify-end">
                  <Button size="sm" variant="outline" onClick={saveCyclePeriod}>
                    <Save className="w-3.5 h-3.5 mr-1.5" />Save period & date
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <input type="file" accept=".xlsx,.xls" id="client-excel" className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleClientExcelUpload(e.target.files[0])} />
                  <label htmlFor="client-excel">
                    <Button asChild disabled={uploading} className="w-full">
                      <span><Upload className="w-4 h-4 mr-2" />{uploading ? "Uploading..." : activeCycle?.source_file_url ? "Replace Excel" : "1. Upload Excel"}</span>
                    </Button>
                  </label>
                  <p className="text-xs text-muted-foreground mt-1">All staff in one sheet</p>
                </div>
                <div>
                  <Button className="w-full" disabled={!activeCycle?.source_file_url || parsing} onClick={handleParse}>
                    {parsing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
                    {parsing ? "Parsing..." : `2. Parse (${activeCycle?.total_rows || 0})`}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">Read staff rows</p>
                </div>
                <div>
                  <Button className="w-full" disabled={!activeCycle || activeCycle.total_rows === 0 || generating} onClick={handleGenerate}>
                    {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
                    {generating ? "Generating..." : `3. Generate (${activeCycle?.total_generated || 0})`}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">Build PDFs</p>
                </div>
                <div>
                  <Button className="w-full" disabled={!activeCycle || activeCycle.total_generated === 0 || zipping} onClick={handleZip}>
                    {zipping ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                    {zipping ? "Zipping..." : "4. Download ZIP"}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">All payslips</p>
                </div>
              </div>

              {activeCycle && (
                <div className="border rounded-md">
                  <div className="flex items-center justify-between p-3 border-b">
                    <p className="text-sm font-medium">Staff in this payroll ({activeRows.length})</p>
                    <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
                  </div>
                  <div className="overflow-auto max-h-[420px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Net Pay</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">PDF</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeRows.length === 0 ? (
                          <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">No staff yet. Upload Excel and parse.</TableCell></TableRow>
                        ) : activeRows.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.staff_name || "—"}</TableCell>
                            <TableCell>{r.data?.net_pay ?? "—"}</TableCell>
                            <TableCell>
                              <Badge variant={r.status === "generated" ? "default" : r.status === "error" ? "destructive" : "secondary"}>{r.status}</Badge>
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
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="template" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Payslip Template Image</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="image/png,image/jpeg,application/pdf"
                  id="bg-upload"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleBgUpload(e.target.files[0])}
                />
                <label htmlFor="bg-upload">
                  <Button asChild disabled={bgUploading}>
                    <span><Upload className="w-4 h-4 mr-2" />{bgUploading ? "Uploading..." : template ? "Replace template" : "Upload template"}</span>
                  </Button>
                </label>
                {template && <Badge variant="secondary">{template.width} × {template.height}</Badge>}
              </div>

              {template ? (
                <>
                  <TemplateDesigner
                    backgroundUrl={template.background_url}
                    previewUrl={template.preview_url}
                    width={template.width}
                    height={template.height}
                    fields={fields}
                    onChange={setFields}
                  />
                  <Button onClick={saveLayout} disabled={savingTemplate}>
                    <Save className="w-4 h-4 mr-2" />{savingTemplate ? "Saving..." : "Save Layout"}
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Upload a PNG/JPG of the payslip template to begin placing fields.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mapping" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Default Excel Column Mapping</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <p className="text-sm text-muted-foreground max-w-xl">
                  Type the exact Excel column header that maps to each payslip field. Leave blank if not in your sheet.
                </p>
                <Button size="sm" variant="outline" onClick={applyProtenDefaults}>
                  Apply PROTEN defaults
                </Button>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                {PAYSLIP_FIELDS.map((f) => (
                  <div key={f.key}>
                    <Label className="text-xs">{f.label}</Label>
                    <Input
                      placeholder={`Excel column for ${f.label}`}
                      value={columnMapping[f.key] || ""}
                      onChange={(e) => setColumnMapping({ ...columnMapping, [f.key]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
              <Button onClick={saveMapping} disabled={savingMapping}>
                <Save className="w-4 h-4 mr-2" />{savingMapping ? "Saving..." : "Save Mapping"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cycles" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Past Payrolls</CardTitle>
              <p className="text-xs text-muted-foreground">Each upload is saved here so you can revisit previous months.</p>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Input placeholder="Custom period label (optional)" value={newPeriod} onChange={(e) => setNewPeriod(e.target.value)} />
              <Button onClick={createCycle} disabled={creatingCycle} variant="outline">
                <Plus className="w-4 h-4 mr-2" />{creatingCycle ? "Creating..." : "Add period"}
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-3">
            {cycles.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cycles yet.</p>
            ) : cycles.map((cy) => (
              <Card key={cy.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4" /> {cy.period_label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Status: {cy.status} · Rows: {cy.total_rows} · Generated: {cy.total_generated}
                    </p>
                  </div>
                  <Link to={`/admin/payroll/${cy.id}`}>
                    <Button variant="outline" size="sm">Open</Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
