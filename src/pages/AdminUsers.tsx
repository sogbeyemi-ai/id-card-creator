import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { UserPlus, Shield } from "lucide-react";

interface AdminUser {
  user_id: string;
  role: string;
  created_at: string;
  email?: string;
}

const AdminUsers = () => {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchAdmins = async () => {
    const { data } = await supabase
      .from("user_roles")
      .select("user_id, role, created_at")
      .eq("role", "admin");

    if (data) {
      // Get profiles for emails
      const userIds = data.map((d) => d.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, email")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p.email]) || []);
      setAdmins(data.map((d) => ({ ...d, email: profileMap.get(d.user_id) || "Unknown" })));
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setCreating(true);

    try {
      // Sign up the new admin
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });

      if (signUpError) throw signUpError;
      if (!signUpData.user) throw new Error("Failed to create user");

      // Assign admin role
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({ user_id: signUpData.user.id, role: "admin" as any });

      if (roleError) throw roleError;

      toast.success("Admin user created! They will need to verify their email.");
      setEmail("");
      setPassword("");
      fetchAdmins();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="font-display text-2xl font-bold">Admin Users</h1>

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-accent" />
          Create New Admin
        </h2>
        <form onSubmit={handleCreateAdmin} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="admin-email">Email</Label>
            <Input
              id="admin-email"
              type="email"
              placeholder="newadmin@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-password">Password</Label>
            <Input
              id="admin-password"
              type="password"
              placeholder="Strong password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <Button type="submit" disabled={creating} className="bg-accent text-accent-foreground hover:bg-accent/90">
            {creating ? "Creating…" : "Create Admin"}
          </Button>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-accent" />
          Current Admins
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {admins.map((admin) => (
              <TableRow key={admin.user_id}>
                <TableCell>{admin.email}</TableCell>
                <TableCell>{new Date(admin.created_at).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
            {admins.length === 0 && (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground">
                  No admin users yet
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

export default AdminUsers;
