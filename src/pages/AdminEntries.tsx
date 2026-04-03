import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { RefreshCw, Unlock, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface StaffEntry {
  id: string;
  full_name: string;
  role: string;
  department: string;
  company: string;
  state: string | null;
  download_count: number;
  download_locked: boolean;
  created_at: string;
}

const AdminEntries = () => {
  const [entries, setEntries] = useState<StaffEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEntries = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("staff_entries")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(error.message);
    } else {
      setEntries((data as StaffEntry[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  const toggleDownloadLock = async (entry: StaffEntry) => {
    const newLocked = !entry.download_locked;
    const newCount = newLocked ? entry.download_count : 0;

    const { error } = await supabase
      .from("staff_entries")
      .update({ download_locked: newLocked, download_count: newCount })
      .eq("id", entry.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(newLocked ? "Download locked" : "Download re-enabled");
      fetchEntries();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Generated ID Cards</h1>
        <Button variant="outline" size="sm" onClick={fetchEntries} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="rounded-lg border bg-card overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Downloads</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  {loading ? "Loading…" : "No entries yet"}
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">{entry.full_name}</TableCell>
                  <TableCell>{entry.role}</TableCell>
                  <TableCell>{entry.company}</TableCell>
                  <TableCell>{entry.state || "—"}</TableCell>
                  <TableCell>{entry.download_count}</TableCell>
                  <TableCell>
                    {entry.download_locked ? (
                      <Badge variant="destructive" className="text-xs">Locked</Badge>
                    ) : entry.download_count > 0 ? (
                      <Badge variant="secondary" className="text-xs">Downloaded</Badge>
                    ) : (
                      <Badge className="text-xs bg-accent text-accent-foreground">Available</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleDownloadLock(entry)}
                      title={entry.download_locked ? "Unlock download" : "Lock download"}
                    >
                      {entry.download_locked ? (
                        <Unlock className="w-4 h-4 text-accent" />
                      ) : (
                        <Lock className="w-4 h-4 text-muted-foreground" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default AdminEntries;
