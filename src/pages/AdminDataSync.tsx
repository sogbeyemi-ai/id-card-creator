import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, Plus, ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface Workspace {
  id: string;
  name: string;
  created_at: string;
}

export default function AdminDataSync() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    const { data, error } = await supabase
      .from("sync_workspaces" as any)
      .select("id, name, created_at")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setWorkspaces((data as any) || []);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("sync_workspaces" as any)
      .insert({ name: name.trim(), created_by: user?.id })
      .select()
      .single();
    setCreating(false);
    if (error) { toast.error(error.message); return; }
    setName("");
    toast.success("Workspace created");
    navigate(`/admin/data-sync/${(data as any).id}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <Database className="w-6 h-6 text-accent" /> HR Data Sync
        </h1>
        <p className="text-sm text-muted-foreground">
          Upload a master sheet, then sync data from other Excel/CSV/Google Sheets sources with AI-powered name and column matching.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">New workspace</CardTitle></CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-2">
          <Input placeholder="Workspace name (e.g. Acme HR 2026)" value={name} onChange={(e) => setName(e.target.value)} />
          <Button onClick={create} disabled={creating || !name.trim()}>
            <Plus className="w-4 h-4" /> Create
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {workspaces.length === 0 && (
          <p className="text-sm text-muted-foreground col-span-full">No workspaces yet.</p>
        )}
        {workspaces.map((w) => (
          <Card key={w.id} className="hover:border-accent transition-colors">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">{w.name}</div>
                <div className="text-xs text-muted-foreground">{new Date(w.created_at).toLocaleString()}</div>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link to={`/admin/data-sync/${w.id}`}>Open <ArrowRight className="w-4 h-4" /></Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
