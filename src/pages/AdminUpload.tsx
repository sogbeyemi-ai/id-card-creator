import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, CheckCircle, Plus, Trash2, AlertTriangle } from "lucide-react";
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

interface UploadBatch {
  batch_id: string;
  record_count: number;
  uploaded_at: string;
}

const AdminUpload = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ count: number; columns: string[]; filesProcessed: number } | null>(null);
  const [batches, setBatches] = useState<UploadBatch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [deletingBatch, setDeletingBatch] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchBatches = async () => {
    setLoadingBatches(true);
    const { data, error } = await supabase
      .from("verified_staff")
      .select("batch_id, created_at");

    if (!error && data) {
      const grouped: Record<string, UploadBatch> = {};
      data.forEach((row) => {
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
    }
    setLoadingBatches(false);
  };

  useEffect(() => { fetchBatches(); }, []);

  const handleDeleteBatch = async (batchId: string) => {
    setDeletingBatch(batchId);
    try {
      const { error } = await supabase
        .from("verified_staff")
        .delete()
        .eq("batch_id", batchId);
      if (error) throw error;
      toast.success("Upload batch deleted successfully");
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

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="font-display text-2xl font-bold">Upload Verified Staff Data</h1>
      <p className="text-muted-foreground text-sm">
        Upload one or more Excel (.xlsx) files containing verified staff records. New data is <strong>added</strong> to existing records (no overwriting).
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
            <Card key={batch.batch_id} className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Batch: {batch.batch_id.slice(0, 8)}…</p>
                <p className="text-xs text-muted-foreground">
                  {batch.record_count} records · Uploaded {new Date(batch.uploaded_at).toLocaleDateString()} {new Date(batch.uploaded_at).toLocaleTimeString()}
                </p>
              </div>
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
