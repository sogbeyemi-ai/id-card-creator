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
import { PAYSLIP_FIELDS, FieldPlacement } from "@/lib/payslipFields";
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

    const { data: cy } = await supabase
      .from("payroll_cycles")
      .select("*")
      .eq("client_id", id)
      .order("created_at", { ascending: false });
    setCycles(cy || []);

    const latest = (cy || [])[0] || null;
    setActiveCycle(latest);
    if (latest) {
      const { data: rs } = await supabase
        .from("payroll_rows")
        .select("*")
        .eq("cycle_id", latest.id)
        .order("created_at");
      setActiveRows(rs || []);
    } else {
      setActiveRows([]);
    }
  };

  const ensureActiveCycle = async () => {
    if (activeCycle) return activeCycle;
    if (!id) return null;
    const monthLabel = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("payroll_cycles").insert({
      client_id: id,
      template_id: template?.id || null,
      period_label: monthLabel,
      column_mapping: columnMapping,
      created_by: user?.id,
    }).select().single();
    if (error) { toast.error(error.message); return null; }
    setActiveCycle(data);
    return data;
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

  const handleBgUpload = async (file: File) => {
    if (!id) return;
    setBgUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("payroll-templates").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("payroll-templates").getPublicUrl(path);

      const img = new Image();
      img.src = pub.publicUrl;
      await new Promise((r) => { img.onload = r; img.onerror = r; });

      if (template) {
        const { error } = await supabase.from("payroll_templates").update({
          background_url: pub.publicUrl,
          width: img.naturalWidth || 800,
          height: img.naturalHeight || 1100,
        }).eq("id", template.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("payroll_templates").insert({
          client_id: id,
          background_url: pub.publicUrl,
          width: img.naturalWidth || 800,
          height: img.naturalHeight || 1100,
          field_layout: [],
        });
        if (error) throw error;
      }
      toast.success("Template uploaded");
      load();
    } catch (e: any) {
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

      <Tabs defaultValue="template">
        <TabsList>
          <TabsTrigger value="template">Template</TabsTrigger>
          <TabsTrigger value="mapping">Excel Mapping</TabsTrigger>
          <TabsTrigger value="cycles">Payroll Cycles</TabsTrigger>
        </TabsList>

        <TabsContent value="template" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Payslip Template Image</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="image/png,image/jpeg"
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
              <p className="text-sm text-muted-foreground">
                Type the exact Excel column header that maps to each payslip field. Leave blank if not in your sheet.
              </p>
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
            <CardHeader><CardTitle>New Payroll Cycle</CardTitle></CardHeader>
            <CardContent className="flex gap-2">
              <Input placeholder="e.g. October 2026" value={newPeriod} onChange={(e) => setNewPeriod(e.target.value)} />
              <Button onClick={createCycle} disabled={creatingCycle}>
                <Plus className="w-4 h-4 mr-2" />{creatingCycle ? "Creating..." : "Create"}
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
