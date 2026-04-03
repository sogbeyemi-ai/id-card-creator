import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, CheckCircle } from "lucide-react";

const AdminUpload = () => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ count: number; columns: string[] } | null>(null);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const formData = new FormData();
      formData.append("file", file);

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/upload-staff-excel`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: formData,
        }
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload failed");

      setResult({ count: data.count, columns: data.columns });
      toast.success(`${data.count} staff records uploaded successfully!`);
      setFile(null);
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
        Upload an Excel (.xlsx) file containing verified staff records. This replaces any existing verification data.
        Required columns: <strong>Full Name</strong>, <strong>Role</strong>. Optional: Department, State, Company.
      </p>

      <Card className="p-6 space-y-4">
        <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setResult(null);
            }}
            className="hidden"
            id="excel-upload"
          />
          <label htmlFor="excel-upload" className="cursor-pointer space-y-3 block">
            <FileSpreadsheet className="w-12 h-12 mx-auto text-accent" />
            <p className="font-medium">{file ? file.name : "Click to select Excel file"}</p>
            <p className="text-xs text-muted-foreground">Supports .xlsx and .xls</p>
          </label>
        </div>

        <Button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
        >
          {uploading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
              Processing…
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Upload & Replace Staff Data
            </span>
          )}
        </Button>

        {result && (
          <div className="bg-accent/10 rounded-lg p-4 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-accent mt-0.5" />
            <div>
              <p className="font-medium text-sm">{result.count} records uploaded</p>
              <p className="text-xs text-muted-foreground mt-1">
                Detected columns: {result.columns.join(", ")}
              </p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default AdminUpload;
