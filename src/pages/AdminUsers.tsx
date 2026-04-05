import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { UserPlus, Shield, Trash2, CheckCircle, XCircle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AdminUser {
  user_id: string;
  role: string;
  status: string;
  created_at: string;
  email?: string;
}

const AdminUsers = () => {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const fetchAdmins = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setCurrentUserId(session?.user?.id || null);

    const { data } = await supabase
      .from("user_roles")
      .select("user_id, role, status, created_at")
      .in("role", ["admin", "super_admin"]);

    if (data) {
      const userIds = data.map((d) => d.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, email")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p.email]) || []);
      setAdmins(data.map((d) => ({ ...d, email: profileMap.get(d.user_id) || "Unknown" })));
    }
  };

  useEffect(() => { fetchAdmins(); }, []);

  const callAdminAction = async (body: Record<string, string>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/create-admin`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Action failed");
    return data;
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || password.length < 8) {
      toast.error("Valid email and password (8+ chars) required");
      return;
    }
    setCreating(true);
    try {
      await callAdminAction({ email, password });
      toast.success("Admin user created successfully!");
      setEmail("");
      setPassword("");
      fetchAdmins();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setCreating(false);
    }
  };

  const handleApproval = async (userId: string, newStatus: "approved" | "rejected") => {
    try {
      await callAdminAction({ action: "update_status", target_user_id: userId, new_status: newStatus });
      toast.success(`Admin ${newStatus}`);
      fetchAdmins();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleRemoveAdmin = async (userId: string) => {
    if (userId === currentUserId) {
      toast.error("You cannot remove yourself");
      return;
    }
    try {
      await callAdminAction({ action: "remove_admin", target_user_id: userId });
      toast.success("Admin removed");
      fetchAdmins();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const pendingAdmins = admins.filter((a) => a.status === "pending");
  const activeAdmins = admins.filter((a) => a.status !== "pending");

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="font-display text-2xl font-bold">Admin Users</h1>

      {/* Pending Approvals */}
      {pendingAdmins.length > 0 && (
        <Card className="p-6 space-y-4 border-yellow-500/30">
          <h2 className="font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5 text-yellow-500" />
            Pending Approval ({pendingAdmins.length})
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingAdmins.map((admin) => (
                <TableRow key={admin.user_id}>
                  <TableCell>{admin.email}</TableCell>
                  <TableCell>{new Date(admin.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => handleApproval(admin.user_id, "approved")}>
                        <CheckCircle className="w-3 h-3 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleApproval(admin.user_id, "rejected")}>
                        <XCircle className="w-3 h-3 mr-1" /> Reject
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create New Admin */}
      <Card className="p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-accent" />
          Create New Admin (Auto-Approved)
        </h2>
        <form onSubmit={handleCreateAdmin} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="admin-email">Email</Label>
            <Input id="admin-email" type="email" placeholder="newadmin@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-password">Password</Label>
            <Input id="admin-password" type="password" placeholder="Strong password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>
          <Button type="submit" disabled={creating} className="bg-accent text-accent-foreground hover:bg-accent/90">
            {creating ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
                Creating…
              </span>
            ) : "Create Admin"}
          </Button>
        </form>
      </Card>

      {/* Current Admins */}
      <Card className="p-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-accent" />
          All Admins
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Added</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeAdmins.map((admin) => (
              <TableRow key={admin.user_id}>
                <TableCell>{admin.email}</TableCell>
                <TableCell>
                  <Badge variant={admin.role === "super_admin" ? "default" : "secondary"} className="text-xs">
                    {admin.role === "super_admin" ? "Super Admin" : "Admin"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    className="text-xs"
                    variant={admin.status === "approved" ? "default" : admin.status === "rejected" ? "destructive" : "secondary"}
                  >
                    {admin.status}
                  </Badge>
                </TableCell>
                <TableCell>{new Date(admin.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  {admin.role === "super_admin" ? (
                    <span className="text-xs text-muted-foreground">Protected</span>
                  ) : admin.user_id === currentUserId ? (
                    <span className="text-xs text-muted-foreground">You</span>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => handleRemoveAdmin(admin.user_id)} className="text-destructive hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {activeAdmins.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">No admin users yet</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

export default AdminUsers;
