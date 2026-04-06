import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, CheckCircle, Plus, Trash2, AlertTriangle, Edit2, Save, X, ChevronDown, ChevronUp, Search } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface UploadBatch {
  batch_id: string;
  record_count: number;
  uploaded_at: string;
}

interface StaffRecord {
  id: string;
  full_name: string;
  role: string;
  department: string | null;
  state: string | null;
  company: string | null;
}

const AdminUpload = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ count: number; columns: string[]; filesProcessed: number } | null>(null);
  const [batches, setBatches] = useState<UploadBatch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [deletingBatch, setDeletingBatch] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Batch records editing
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [batchRecords, setBatchRecords] = useState<StaffRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<StaffRecord>>({});
  const [searchTerm, setSearchTerm] = useState("");

  const fetchAllFromTable = async (table: string, select: string, filter?: { col: string; val: string }) => {
    let all: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      let query = supabase.from(table).select(select).range(from, from + pageSize - 1);
      if (filter) query = query.eq(filter.col, filter.val);
      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return all;
  };

  const fetchBatches = async () => {
    setLoadingBatches(true);
    try {
      const data = await fetchAllFromTable("verified_staff", "batch_id, created_at");
      const grouped: Record<string, UploadBatch> = {};
      data.forEach((row: any) => {
        const bid = row.batch_id || "unknown";
        if (!grouped[bid]) {
          grouped[bid] = { batch_id: bid, record_count: 0, uploaded_at: row.created_at };
        }
        grouped[bid].record_count++;
        if (row.created_at < grouped[bid].uploaded_at) {
          grouped[bid].uploaded_at = row.created_at;
        }
      });
      setBatches(Object.values(grouped).sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at)));
    } catch {
      // silent
    }
    setLoadingBatches(false);
  };

  const fetchBatchRecords = async (batchId: string) => {
    setLoadingRecords(true);
    try {
      const data = await fetchAllFromTable(
        "verified_staff",
        "id, full_name, role, department, state, company",
        { col: "batch_id", val: batchId }
      );
      setBatchRecords(data as StaffRecord[]);
    } catch {
      toast.error("Failed to load records");
    }
    setLoadingRecords(false);
  };

  useEffect(() => { fetchBatches(); }, []);

  const toggleBatch = (batchId: string) => {
    if (expandedBatch === batchId) {
      setExpandedBatch(null);
      setBatchRecords([]);
      setSearchTerm("");
    } else {
      setExpandedBatch(batchId);
      fetchBatchRecords(batchId);
      setSearchTerm("");
    }
    setEditingId(null);
  };

  const startEdit = (record: StaffRecord) => {
    setEditingId(record.id);
    setEditData({ full_name: record.full_name, role: record.role, department: record.department, state: record.state, company: record.company });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };

  const saveEdit = async (id: string) => {
    try {
      const { error } = await supabase
        .from("verified_staff")
        .update({
          full_name: editData.full_name || "",
          role: editData.role || "",
          department: editData.department || null,
          state: editData.state || null,
          company: editData.company || null,
        })
        .eq("id", id);
      if (error) throw error;
      setBatchRecords((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...editData } : r))
      );
      setEditingId(null);
      setEditData({});
      toast.success("Record updated successfully");
    } catch (err: any) {
      toast.error("Failed to update: " + err.message);
    }
  };

  const handleDeleteBatch = async (batchId: string) => {
    setDeletingBatch(batchId);
    try {
      const { error } = await supabase
        .from("verified_staff")
        .delete()
        .eq("batch_id", batchId);
      if (error) throw error;
      toast.success("Upload batch deleted successfully");
      if (expandedBatch === batchId) {
        setExpandedBatch(null);
        setBatchRecords([]);
      }
      fetchBatches();
    } catch (err: any) {
      toast.error("Failed to delete: " + err.message);
    } finally {
      setDeletingBatch(null);
      setConfirmDelete(null);
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const formData = new FormData();
      files.forEach((file) => formData.append("file", file));

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/upload-staff-excel`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: formData,
        }
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload failed");

      setResult({ count: data.count, columns: data.columns, filesProcessed: data.files_processed });
      toast.success(`${data.count} staff records uploaded from ${data.files_processed} file(s)!`);
      setFiles([]);
      fetchBatches();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setUploading(false);
    }
  };

  const filteredRecords = batchRecords.filter((r) => {
    if (!searchTerm) return true;
    const term = searchTerm.toUpperCase();
    return (
      r.full_name.toUpperCase().includes(term) ||
      r.role.toUpperCase().includes(term) ||
      (r.department || "").toUpperCase().includes(term)
    );
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="font-display text-2xl font-bold">Upload Verified Staff Data</h1>
      <p className="text-muted-foreground text-sm">
        Upload one or more Excel (.xlsx) files containing verified staff records. New data is <strong>added</strong> to existing records.
        Required columns: <strong>Full Name</strong>, <strong>Role</strong>. Optional: Department, State, Company.
      </p>

      <Card className="p-6 space-y-4">
        <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
          <input
            type="file"
            accept=".xlsx,.xls"
            multiple
            onChange={(e) => {
              const selected = Array.from(e.target.files || []);
              setFiles((prev) => [...prev, ...selected]);
              setResult(null);
            }}
            className="hidden"
            id="excel-upload"
          />
          <label htmlFor="excel-upload" className="cursor-pointer space-y-3 block">
            <FileSpreadsheet className="w-12 h-12 mx-auto text-accent" />
            <p className="font-medium">
              {files.length === 0 ? "Click to select Excel file(s)" : `${files.length} file(s) selected`}
            </p>
            <p className="text-xs text-muted-foreground">Supports .xlsx and .xls — select multiple files at once</p>
          </label>
        </div>

        {files.length > 0 && (
          <div className="space-y-2">
            {files.map((file, i) => (
              <div key={i} className="flex items-center justify-between bg-muted rounded-lg px-3 py-2 text-sm">
                <span className="truncate">{file.name}</span>
                <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="text-destructive text-xs hover:underline ml-2">Remove</button>
              </div>
            ))}
            <label htmlFor="excel-upload" className="flex items-center gap-1 text-sm text-accent cursor-pointer hover:underline">
              <Plus className="w-3 h-3" /> Add more files
            </label>
          </div>
        )}

        <Button onClick={handleUpload} disabled={files.length === 0 || uploading} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
          {uploading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
              Processing…
            </span>
          ) : (
            <span className="flex items-center gap-2"><Upload className="w-4 h-4" /> Upload & Add Staff Data</span>
          )}
        </Button>

        {result && (
          <div className="bg-accent/10 rounded-lg p-4 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-accent mt-0.5" />
            <div>
              <p className="font-medium text-sm">{result.count} records uploaded from {result.filesProcessed} file(s)</p>
              <p className="text-xs text-muted-foreground mt-1">Detected columns: {result.columns.join(", ")}</p>
            </div>
          </div>
        )}
      </Card>

      {/* Uploaded Batches */}
      <h2 className="font-display text-lg font-semibold mt-8">Uploaded File Batches</h2>
      {loadingBatches ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : batches.length === 0 ? (
        <p className="text-sm text-muted-foreground">No uploaded batches yet.</p>
      ) : (
        <div className="space-y-3">
          {batches.map((batch) => (
            <div key={batch.batch_id}>
              <Card className="p-4 flex items-center justify-between">
                <button
                  className="flex-1 text-left flex items-center gap-2"
                  onClick={() => toggleBatch(batch.batch_id)}
                >
                  {expandedBatch === batch.batch_id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  <div>
                    <p className="font-medium text-sm">Batch: {batch.batch_id.slice(0, 8)}…</p>
                    <p className="text-xs text-muted-foreground">
                      {batch.record_count} records · Uploaded {new Date(batch.uploaded_at).toLocaleDateString()} {new Date(batch.uploaded_at).toLocaleTimeString()}
                    </p>
                  </div>
                </button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deletingBatch === batch.batch_id}
                  onClick={() => setConfirmDelete(batch.batch_id)}
                >
                  {deletingBatch === batch.batch_id ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </Button>
              </Card>

              {/* Expanded batch records */}
              {expandedBatch === batch.batch_id && (
                <Card className="mt-1 p-4 border-t-0 rounded-t-none">
                  {loadingRecords ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Loading records…</p>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-3">
                        <Search className="w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Search records…"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="h-8 text-sm"
                        />
                        <p className="text-xs text-muted-foreground whitespace-nowrap">{filteredRecords.length} records</p>
                      </div>
                      <div className="max-h-96 overflow-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Full Name</TableHead>
                              <TableHead className="text-xs">Role</TableHead>
                              <TableHead className="text-xs">Department</TableHead>
                              <TableHead className="text-xs">State</TableHead>
                              <TableHead className="text-xs">Company</TableHead>
                              <TableHead className="text-xs w-20">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredRecords.slice(0, 100).map((record) => (
                              <TableRow key={record.id}>
                                {editingId === record.id ? (
                                  <>
                                    <TableCell><Input value={editData.full_name || ""} onChange={(e) => setEditData((d) => ({ ...d, full_name: e.target.value }))} className="h-7 text-xs" /></TableCell>
                                    <TableCell><Input value={editData.role || ""} onChange={(e) => setEditData((d) => ({ ...d, role: e.target.value }))} className="h-7 text-xs" /></TableCell>
                                    <TableCell><Input value={editData.department || ""} onChange={(e) => setEditData((d) => ({ ...d, department: e.target.value }))} className="h-7 text-xs" /></TableCell>
                                    <TableCell><Input value={editData.state || ""} onChange={(e) => setEditData((d) => ({ ...d, state: e.target.value }))} className="h-7 text-xs" /></TableCell>
                                    <TableCell><Input value={editData.company || ""} onChange={(e) => setEditData((d) => ({ ...d, company: e.target.value }))} className="h-7 text-xs" /></TableCell>
                                    <TableCell>
                                      <div className="flex gap-1">
                                        <button onClick={() => saveEdit(record.id)} className="text-accent hover:text-accent/80"><Save className="w-4 h-4" /></button>
                                        <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                                      </div>
                                    </TableCell>
                                  </>
                                ) : (
                                  <>
                                    <TableCell className="text-xs font-medium">{record.full_name}</TableCell>
                                    <TableCell className="text-xs">{record.role}</TableCell>
                                    <TableCell className="text-xs">{record.department || "—"}</TableCell>
                                    <TableCell className="text-xs">{record.state || "—"}</TableCell>
                                    <TableCell className="text-xs">{record.company || "—"}</TableCell>
                                    <TableCell>
                                      <button onClick={() => startEdit(record)} className="text-accent hover:text-accent/80"><Edit2 className="w-4 h-4" /></button>
                                    </TableCell>
                                  </>
                                )}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        {filteredRecords.length > 100 && (
                          <p className="text-xs text-muted-foreground text-center py-2">
                            Showing 100 of {filteredRecords.length} records. Use search to filter.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </Card>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" /> Delete Upload Batch?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this file batch? All staff records from this upload will be permanently removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDelete && handleDeleteBatch(confirmDelete)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminUpload;
