import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Check, X, Download } from "lucide-react";
import { toast } from "sonner";
import { confidenceBadge, exportToXlsx } from "@/lib/dataSync";

async function fetchAllRows(
  table: string,
  select: string,
  filters: { column: string; value: string }[],
  orderBy?: { column: string; ascending?: boolean },
) {
  const pageSize = 1000;
  const maxRows = 10000;
  const collected: any[] = [];
  let from = 0;

  while (collected.length < maxRows) {
    const to = Math.min(from + pageSize - 1, maxRows - 1);
    let query = supabase.from(table as any).select(select).range(from, to);
    for (const filter of filters) query = query.eq(filter.column, filter.value);
    if (orderBy) query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
    const { data, error } = await query;
    if (error) throw error;
    const page = (data as any[]) || [];
    collected.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return collected;
}

export default function AdminDataSyncRun() {
  const { workspaceId, runId } = useParams();
  const navigate = useNavigate();
  const [run, setRun] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [masterRows, setMasterRows] = useState<any[]>([]);
  const [masterHeaders, setMasterHeaders] = useState<string[]>([]);
  const [decisions, setDecisions] = useState<Record<string, { action: string; target_master_row_id?: string }>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const toggleOne = (id: string, v: boolean) => setSelected((s) => ({ ...s, [id]: v }));
  const toggleMany = (ids: string[], v: boolean) =>
    setSelected((s) => { const n = { ...s }; ids.forEach((id) => { n[id] = v; }); return n; });
  const bulkSet = (ids: string[], action: string) => {
    if (ids.length === 0) { toast.info("No items selected"); return; }
    setDecisions((d) => {
      const n = { ...d };
      ids.forEach((id) => {
        const it = items.find((x) => x.id === id);
        if (!it || it.applied) return;
        if (action === "apply" && !it.match_master_row_id) {
          n[id] = { ...(n[id] || {}), action: "new" };
        } else {
          n[id] = { ...(n[id] || {}), action };
        }
      });
      return n;
    });
    toast.success(`${ids.length} item(s) set to "${action}"`);
  };

  useEffect(() => {
    (async () => {
      const { data: r } = await supabase.from("sync_runs" as any).select("*").eq("id", runId).single();
      setRun(r);
      const it = await fetchAllRows("sync_run_items", "*", [{ column: "run_id", value: runId! }]);
      setItems(it);
      const { data: sheet } = await supabase.from("sync_master_sheets" as any)
        .select("headers").eq("workspace_id", workspaceId)
        .order("uploaded_at", { ascending: false }).limit(1).maybeSingle();
      setMasterHeaders(((sheet as any)?.headers as string[]) || []);
      const mr = await fetchAllRows("sync_master_rows", "id, data", [{ column: "workspace_id", value: workspaceId! }]);
      setMasterRows(mr);

      // default decisions
      const def: Record<string, any> = {};
      ((it as any) || []).forEach((x: any) => {
        if (x.applied) return;
        if (x.decision === "auto_update") def[x.id] = { action: "apply" };
        else if (x.decision === "manual") def[x.id] = { action: "skip" };
        else def[x.id] = { action: "skip" };
      });
      setDecisions(def);
    })();
  }, [runId, workspaceId]);

  const groups = useMemo(() => ({
    auto: items.filter((i) => i.decision === "auto_update"),
    manual: items.filter((i) => i.decision === "manual"),
    unmatched: items.filter((i) => i.decision === "unmatched" || i.decision === "new" || i.decision === "skip"),
  }), [items]);

  const apply = async () => {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/data-sync-apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ run_id: runId, item_decisions: decisions }),
      });
      const r = await resp.json();
      if (!resp.ok) throw new Error(r.error || "Apply failed");
      toast.success(`Applied ${r.applied} changes`);
      navigate(`/admin/data-sync/${workspaceId}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  };

  const downloadUpdatedMaster = async () => {
      const mr = await fetchAllRows("sync_master_rows", "data", [{ column: "workspace_id", value: workspaceId! }]);
    const rows = (mr || []).map((r: any) => r.data);
    if (!rows.length) { toast.error("Master is empty"); return; }
    const stamp = new Date().toISOString().slice(0, 10);
    exportToXlsx(masterHeaders, rows, `master-updated-${stamp}.xlsx`);
    toast.success("Updated master downloaded");
  };

  const masterById = useMemo(() => Object.fromEntries(masterRows.map((m) => [m.id, m])), [masterRows]);
  const headerMapping: Record<string, string | null> = run?.header_mapping || {};
  const sourceHeaders = Object.keys(headerMapping);

  const renderItem = (it: any) => {
    const badge = confidenceBadge(Math.round(Number(it.confidence)));
    const master = it.match_master_row_id ? masterById[it.match_master_row_id] : null;
    const dec = decisions[it.id] || { action: "skip" };
    return (
      <Card key={it.id} className="border">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Checkbox
              checked={!!selected[it.id]}
              onCheckedChange={(v) => toggleOne(it.id, !!v)}
              disabled={it.applied}
              aria-label="Select item"
            />
            <Badge className={badge.className} variant="outline">{badge.label}</Badge>
            <span className="text-sm font-medium">
              Source: {sourceHeaders.map((h) => it.source_row[h]).filter(Boolean).slice(0, 2).join(" — ")}
            </span>
            {master && (
              <span className="text-xs text-muted-foreground ml-auto">
                → Master: {masterHeaders.map((h) => master.data[h]).filter(Boolean).slice(0, 2).join(" — ")}
              </span>
            )}
          </div>
          {Object.keys(it.diff || {}).length > 0 && (
            <div className="text-xs grid grid-cols-1 md:grid-cols-2 gap-1">
              {Object.entries(it.diff).map(([k, v]: any) => (
                <div key={k} className="border rounded px-2 py-1">
                  <span className="font-medium">{k}:</span>{" "}
                  <span className="text-muted-foreground line-through">{String(v.from ?? "—")}</span>{" → "}
                  <span className="text-emerald-600">{String(v.to)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={dec.action} onValueChange={(v) => setDecisions((d) => ({ ...d, [it.id]: { ...d[it.id], action: v } }))}>
              <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {it.match_master_row_id && <SelectItem value="apply">Apply update</SelectItem>}
                <SelectItem value="merge">Merge into…</SelectItem>
                <SelectItem value="new">Create new row</SelectItem>
                <SelectItem value="skip">Skip</SelectItem>
              </SelectContent>
            </Select>
            {dec.action === "merge" && (
              <Select value={dec.target_master_row_id || ""} onValueChange={(v) => setDecisions((d) => ({ ...d, [it.id]: { ...d[it.id], target_master_row_id: v } }))}>
                <SelectTrigger className="w-72 h-8 text-xs"><SelectValue placeholder="Pick master row…" /></SelectTrigger>
                <SelectContent>
                  {masterRows.slice(0, 200).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {masterHeaders.map((h) => m.data[h]).filter(Boolean).slice(0, 2).join(" — ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (!run) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const isApplied = run.status === "applied" || run.status === "rolled_back";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/admin/data-sync/${workspaceId}`}><ArrowLeft className="w-4 h-4" /> Back</Link>
        </Button>
        <h1 className="text-xl font-display font-bold">{run.source_file_name}</h1>
        <Badge variant="outline">{run.status}</Badge>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={downloadUpdatedMaster}>
            <Download className="w-4 h-4" /> Download updated master
          </Button>
          {!isApplied && (
            <Button onClick={apply} disabled={busy}>
              <Check className="w-4 h-4" /> Apply sync
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="auto">
        <TabsList>
          <TabsTrigger value="auto">Auto-update ({groups.auto.length})</TabsTrigger>
          <TabsTrigger value="manual">Needs review ({groups.manual.length})</TabsTrigger>
          <TabsTrigger value="unmatched">Unmatched ({groups.unmatched.length})</TabsTrigger>
        </TabsList>
        {(["auto", "manual", "unmatched"] as const).map((key) => {
          const list = groups[key];
          const ids = list.filter((i: any) => !i.applied).map((i: any) => i.id);
          const selectedIds = ids.filter((id) => selected[id]);
          const allChecked = ids.length > 0 && selectedIds.length === ids.length;
          const someChecked = selectedIds.length > 0 && !allChecked;
          const emptyMsg = key === "auto" ? "Nothing to auto-update." : key === "manual" ? "No weak matches." : "All rows matched.";
          return (
            <TabsContent key={key} value={key} className="space-y-2">
              {list.length === 0 ? (
                <p className="text-sm text-muted-foreground">{emptyMsg}</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 p-2 border rounded-md bg-muted/30 sticky top-0 z-10">
                    <Checkbox
                      checked={allChecked ? true : someChecked ? "indeterminate" : false}
                      onCheckedChange={(v) => toggleMany(ids, !!v)}
                      aria-label="Select all"
                    />
                    <span className="text-xs text-muted-foreground">
                      {selectedIds.length} of {ids.length} selected
                    </span>
                    <div className="ml-auto flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" disabled={selectedIds.length === 0} onClick={() => bulkSet(selectedIds, "apply")}>
                        <Check className="w-3 h-3" /> Apply selected
                      </Button>
                      <Button size="sm" variant="outline" disabled={selectedIds.length === 0} onClick={() => bulkSet(selectedIds, "new")}>
                        Create new
                      </Button>
                      <Button size="sm" variant="outline" disabled={selectedIds.length === 0} onClick={() => bulkSet(selectedIds, "skip")}>
                        <X className="w-3 h-3" /> Skip selected
                      </Button>
                      {selectedIds.length > 0 && (
                        <Button size="sm" variant="ghost" onClick={() => toggleMany(ids, false)}>Clear</Button>
                      )}
                    </div>
                  </div>
                  {list.map(renderItem)}
                </>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
