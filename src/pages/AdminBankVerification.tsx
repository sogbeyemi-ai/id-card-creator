import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Banknote,
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileSpreadsheet,
  Loader2,
  PlayCircle,
  Search,
} from "lucide-react";
import { toast } from "sonner";

interface DetectResult {
  account_number: string;
  status: "ok" | "not_found" | "failed";
  bank_name?: string;
  bank_code?: string;
  account_name?: string;
  error?: string;
}

type Bank = { name: string; code: string; slug: string };

interface Row {
  id: string;
  full_name: string;
  account_number: string;
  bank_name: string | null;
  bank_code: string | null;
  expected_account_name: string | null;
  resolved_account_name: string | null;
  status: "pending" | "verified" | "mismatch" | "failed";
  similarity: number | null;
  error_message: string | null;
}

interface Batch {
  id: string;
  file_name: string;
  total_rows: number;
  verified_count: number;
  mismatch_count: number;
  failed_count: number;
  created_at: string;
}

const norm = (s: string) =>
  (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const findCol = (headers: string[], candidates: string[]) => {
  const map = headers.map(norm);
  for (const c of candidates) {
    const idx = map.indexOf(norm(c));
    if (idx >= 0) return idx;
  }
  // partial
  for (const c of candidates) {
    const idx = map.findIndex((h) => h.includes(norm(c)));
    if (idx >= 0) return idx;
  }
  return -1;
};

const matchBank = (banks: Bank[], raw: string): Bank | null => {
  const n = norm(raw);
  if (!n) return null;
  let b = banks.find((x) => norm(x.name) === n);
  if (b) return b;
  b = banks.find((x) => norm(x.name).includes(n) || n.includes(norm(x.name)));
  return b || null;
};

const AdminBankVerification = () => {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [activeBatch, setActiveBatch] = useState<Batch | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [uploading, setUploading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const fileRef = useRef<HTMLInputElement>(null);

  // Auto-detect mode state
  const [detectInput, setDetectInput] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [detectProgress, setDetectProgress] = useState({ done: 0, total: 0 });
  const [detectResults, setDetectResults] = useState<DetectResult[]>([]);
  const detectFileRef = useRef<HTMLInputElement>(null);

  const parseDetectInput = (raw: string): string[] => {
    return Array.from(
      new Set(
        raw
          .split(/[\s,;]+/)
          .map((s) => s.replace(/\D/g, ""))
          .filter((s) => s.length >= 10),
      ),
    );
  };

  const handleDetectExcel = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" });
      if (data.length < 1) throw new Error("Sheet is empty");
      const headers = (data[0] as any[]).map((h) => String(h));
      let iAcct = findCol(headers, ["account number", "account no", "acct no", "account"]);
      let rowsToScan = data.slice(1);
      // If no header detected, treat whole sheet as account numbers (col 0)
      if (iAcct < 0) {
        iAcct = 0;
        rowsToScan = data;
      }
      const accts = rowsToScan
        .map((r: any) => String(r[iAcct] ?? "").replace(/\D/g, ""))
        .filter((s) => s.length >= 10);
      if (!accts.length) throw new Error("No account numbers found");
      setDetectInput(Array.from(new Set(accts)).join("\n"));
      toast.success(`Loaded ${accts.length} account numbers`);
    } catch (e: any) {
      toast.error(e.message || "Failed to read sheet");
    } finally {
      if (detectFileRef.current) detectFileRef.current.value = "";
    }
  };

  const runDetect = async () => {
    const list = parseDetectInput(detectInput);
    if (!list.length) {
      toast.error("Enter at least one valid account number");
      return;
    }
    setDetecting(true);
    setDetectResults([]);
    setDetectProgress({ done: 0, total: list.length });
    const results: DetectResult[] = [];
    try {
      for (let i = 0; i < list.length; i++) {
        const acct = list[i];
        try {
          const { data, error } = await supabase.functions.invoke("bank-detect", {
            body: { accountNumber: acct },
          });
          if (error) {
            results.push({ account_number: acct, status: "failed", error: error.message });
          } else if (data?.status === "ok") {
            results.push({
              account_number: acct,
              status: "ok",
              bank_name: data.bank_name,
              bank_code: data.bank_code,
              account_name: data.account_name,
            });
          } else {
            results.push({
              account_number: acct,
              status: "not_found",
              error: data?.message || "No match",
            });
          }
        } catch (e: any) {
          results.push({ account_number: acct, status: "failed", error: e.message });
        }
        setDetectProgress({ done: i + 1, total: list.length });
        setDetectResults([...results]);
      }
      toast.success("Detection complete");
    } finally {
      setDetecting(false);
    }
  };

  const exportDetectResults = async () => {
    if (!detectResults.length) {
      toast.error("Nothing to export");
      return;
    }
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Auto Detect");
    ws.columns = [
      { header: "Account Number", key: "account_number", width: 20 },
      { header: "Bank Name", key: "bank_name", width: 28 },
      { header: "Account Name", key: "account_name", width: 32 },
      { header: "Status", key: "status", width: 14 },
      { header: "Note", key: "error", width: 30 },
    ];
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2A47" } };
    detectResults.forEach((r) =>
      ws.addRow({
        account_number: String(r.account_number),
        bank_name: r.bank_name || "",
        account_name: r.account_name || "",
        status: r.status,
        error: r.error || "",
      }),
    );
    ws.getColumn("account_number").numFmt = "@";
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bank_autodetect_${Date.now()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    supabase.functions.invoke("bank-list").then(({ data, error }) => {
      if (error) {
        toast.error("Failed to load bank list");
        return;
      }
      setBanks(data?.banks || []);
    });
    fetchBatches();
  }, []);

  const fetchBatches = async () => {
    const { data } = await supabase
      .from("bank_verification_batches")
      .select("*")
      .order("created_at", { ascending: false });
    setBatches((data as Batch[]) || []);
  };

  const fetchRows = async (batchId: string) => {
    const { data } = await supabase
      .from("bank_verification_rows")
      .select("*")
      .eq("batch_id", batchId)
      .order("created_at", { ascending: true });
    setRows((data as Row[]) || []);
  };

  const openBatch = async (b: Batch) => {
    setActiveBatch(b);
    await fetchRows(b.id);
  };

  const handleUpload = async (file: File) => {
    if (!banks.length) {
      toast.error("Bank list not loaded yet");
      return;
    }
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" });
      if (data.length < 2) throw new Error("Sheet is empty");
      const headers = (data[0] as any[]).map((h) => String(h));
      const iName = findCol(headers, ["full name", "name", "staff name", "employee name"]);
      const iAcct = findCol(headers, ["account number", "account no", "acct no", "account"]);
      const iBank = findCol(headers, ["bank name", "bank"]);
      const iExp = findCol(headers, ["expected account name", "expected name", "account name"]);
      if (iName < 0 || iAcct < 0 || iBank < 0) {
        throw new Error("Sheet must include Full Name, Account Number, and Bank Name columns");
      }

      const parsed = (data.slice(1) as any[][])
        .map((r) => {
          const acct = String(r[iAcct] ?? "").replace(/\D/g, "");
          const bankRaw = String(r[iBank] ?? "").trim();
          const matched = matchBank(banks, bankRaw);
          return {
            full_name: String(r[iName] ?? "").trim(),
            account_number: acct,
            bank_name: matched?.name || bankRaw,
            bank_code: matched?.code || null,
            expected_account_name: iExp >= 0 ? String(r[iExp] ?? "").trim() || null : null,
            status: matched && acct ? "pending" : "failed",
            error_message:
              !acct
                ? "Missing account number"
                : !matched
                  ? `Unknown bank: ${bankRaw}`
                  : null,
          };
        })
        .filter((r) => r.full_name);

      if (!parsed.length) throw new Error("No valid rows found");

      // Create batch
      const { data: user } = await supabase.auth.getUser();
      const { data: batch, error: bErr } = await supabase
        .from("bank_verification_batches")
        .insert({
          file_name: file.name,
          uploaded_by: user.user?.id,
          total_rows: parsed.length,
          failed_count: parsed.filter((p) => p.status === "failed").length,
        })
        .select()
        .single();
      if (bErr) throw bErr;

      // Insert rows in chunks of 500
      for (let i = 0; i < parsed.length; i += 500) {
        const chunk = parsed.slice(i, i + 500).map((p) => ({ ...p, batch_id: batch.id }));
        const { error } = await supabase
          .from("bank_verification_rows")
          .upsert(chunk, { onConflict: "batch_id,account_number,bank_code", ignoreDuplicates: true });
        if (error) throw error;
      }

      toast.success(`Uploaded ${parsed.length} rows`);
      await fetchBatches();
      await openBatch(batch as Batch);
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const runVerification = async () => {
    if (!activeBatch) return;
    const pending = rows.filter((r) => r.status === "pending" && r.bank_code && r.account_number);
    if (!pending.length) {
      toast.info("Nothing pending to verify");
      return;
    }
    setVerifying(true);
    setProgress({ done: 0, total: pending.length });
    const CHUNK = 20;
    try {
      for (let i = 0; i < pending.length; i += CHUNK) {
        const chunk = pending.slice(i, i + CHUNK);
        const { error } = await supabase.functions.invoke("bank-verify", {
          body: { batchId: activeBatch.id, rowIds: chunk.map((r) => r.id) },
        });
        if (error) throw error;
        setProgress({ done: Math.min(i + CHUNK, pending.length), total: pending.length });
        await fetchRows(activeBatch.id);
      }
      await fetchBatches();
      const { data } = await supabase
        .from("bank_verification_batches")
        .select("*")
        .eq("id", activeBatch.id)
        .single();
      if (data) setActiveBatch(data as Batch);
      toast.success("Verification complete");
    } catch (e: any) {
      toast.error(e.message || "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (
        q &&
        !r.full_name.toLowerCase().includes(q) &&
        !r.account_number.includes(q) &&
        !(r.bank_name || "").toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [rows, search, statusFilter]);

  const exportFiltered = async () => {
    if (!filtered.length) {
      toast.error("Nothing to export");
      return;
    }
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Bank Verification");
    ws.columns = [
      { header: "Full Name", key: "full_name", width: 28 },
      { header: "Account Number", key: "account_number", width: 20 },
      { header: "Bank Name", key: "bank_name", width: 26 },
      { header: "Expected Name", key: "expected_account_name", width: 28 },
      { header: "Resolved Name", key: "resolved_account_name", width: 28 },
      { header: "Status", key: "status", width: 14 },
      { header: "Similarity", key: "similarity", width: 12 },
      { header: "Error", key: "error_message", width: 30 },
    ];
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2A47" } };
    header.height = 22;
    filtered.forEach((r) => {
      ws.addRow({
        ...r,
        account_number: String(r.account_number),
        similarity: r.similarity != null ? Number(r.similarity.toFixed(2)) : "",
      });
    });
    ws.getColumn("account_number").numFmt = "@";
    ws.autoFilter = { from: "A1", to: "H1" };
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bank_verification_${activeBatch?.file_name || "export"}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusBadge = (s: Row["status"]) => {
    if (s === "verified")
      return <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white"><CheckCircle2 className="w-3 h-3 mr-1" />Verified</Badge>;
    if (s === "mismatch")
      return <Badge className="bg-amber-500 hover:bg-amber-500 text-white"><AlertTriangle className="w-3 h-3 mr-1" />Mismatch</Badge>;
    if (s === "failed")
      return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
    return <Badge variant="secondary">Pending</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Banknote className="w-6 h-6 text-accent" />
          Bank Account Verification
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Verify staff bank accounts with Paystack — match names in bulk, or auto-detect the bank from just an account number.
        </p>
      </div>

      <Tabs defaultValue="match" className="space-y-4">
        <TabsList>
          <TabsTrigger value="match">Match Names (Bulk)</TabsTrigger>
          <TabsTrigger value="detect">Auto-detect Bank</TabsTrigger>
        </TabsList>

        <TabsContent value="match" className="space-y-6">
      <Card className="p-5 space-y-3">
        <Label className="text-xs font-semibold">Upload Excel (.xlsx)</Label>
        <p className="text-xs text-muted-foreground">
          Required columns: <strong>Full Name</strong>, <strong>Account Number</strong>, <strong>Bank Name</strong>. Optional: <strong>Expected Account Name</strong>.
        </p>
        <div className="flex items-center gap-2">
          <Input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            disabled={uploading}
            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
          />
          {uploading && <Loader2 className="w-4 h-4 animate-spin text-accent" />}
        </div>
      </Card>

      {batches.length > 0 && (
        <Card className="p-5 space-y-3">
          <Label className="text-xs font-semibold">Batches</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {batches.map((b) => (
              <button
                key={b.id}
                onClick={() => openBatch(b)}
                className={`text-left p-3 rounded-lg border transition ${
                  activeBatch?.id === b.id ? "border-accent bg-accent/5" : "border-border hover:bg-muted/40"
                }`}
              >
                <p className="font-medium text-sm truncate">{b.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(b.created_at).toLocaleString()}
                </p>
                <div className="flex gap-1.5 mt-2 text-xs">
                  <span className="text-emerald-600">✓ {b.verified_count}</span>
                  <span className="text-amber-600">⚠ {b.mismatch_count}</span>
                  <span className="text-destructive">✕ {b.failed_count}</span>
                  <span className="text-muted-foreground">/ {b.total_rows}</span>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {activeBatch && (
        <Card className="p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="font-display font-semibold">{activeBatch.file_name}</h2>
              <div className="flex gap-2 mt-1 flex-wrap text-xs">
                <Badge variant="outline">Total: {activeBatch.total_rows}</Badge>
                <Badge className="bg-emerald-600 text-white">Verified: {activeBatch.verified_count}</Badge>
                <Badge className="bg-amber-500 text-white">Mismatch: {activeBatch.mismatch_count}</Badge>
                <Badge variant="destructive">Failed: {activeBatch.failed_count}</Badge>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={runVerification} disabled={verifying} className="bg-accent text-accent-foreground hover:bg-accent/90">
                {verifying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
                {verifying ? `Verifying ${progress.done}/${progress.total}` : "Verify All"}
              </Button>
              <Button variant="outline" onClick={exportFiltered}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />Export
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Input
              placeholder="Search name, account, bank…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="mismatch">Mismatch</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground self-center">
              Showing {filtered.length} of {rows.length}
            </p>
          </div>

          <div className="border rounded-lg overflow-auto max-h-[60vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead>Resolved Name</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.full_name}</TableCell>
                    <TableCell className="font-mono text-xs">{r.account_number}</TableCell>
                    <TableCell className="text-xs">{r.bank_name || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {r.resolved_account_name || (
                        <span className="text-muted-foreground italic">
                          {r.error_message || "—"}
                        </span>
                      )}
                      {r.similarity != null && (
                        <span className="ml-1 text-muted-foreground">
                          ({Math.round(r.similarity * 100)}%)
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                  </TableRow>
                ))}
                {!filtered.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No rows
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default AdminBankVerification;
