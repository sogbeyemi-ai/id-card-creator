import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Search, Users, Download } from "lucide-react";

interface Employee {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  hire_date: string | null;
  employment_type: string;
  status: string;
  department: string | null;
  role: string | null;
}

const empty = {
  full_name: "",
  email: "",
  phone: "",
  hire_date: "",
  employment_type: "full_time",
  status: "active",
  department: "",
  role: "",
  bank_name: "",
  bank_account: "",
};

const AdminEmployees = () => {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("employees")
      .select("id, full_name, email, phone, hire_date, employment_type, status, department, role")
      .order("full_name");
    if (error) toast.error(error.message);
    setEmployees((data as Employee[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const importFromVerified = async () => {
    setImporting(true);
    try {
      // Fetch all verified_staff (paginated)
      const all: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("verified_staff")
          .select("id, full_name, role, department")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }

      const { data: existing } = await supabase
        .from("employees")
        .select("verified_staff_id");
      const existingIds = new Set((existing || []).map((e: any) => e.verified_staff_id).filter(Boolean));

      const toInsert = all
        .filter((s) => !existingIds.has(s.id))
        .map((s) => ({
          verified_staff_id: s.id,
          full_name: s.full_name,
          role: s.role,
          department: s.department,
          status: "active",
          employment_type: "full_time",
        }));

      if (toInsert.length === 0) {
        toast.info("All verified staff already imported.");
      } else {
        // Insert in chunks of 500
        for (let i = 0; i < toInsert.length; i += 500) {
          const { error } = await supabase.from("employees").insert(toInsert.slice(i, i + 500));
          if (error) throw error;
        }
        toast.success(`Imported ${toInsert.length} employees`);
        await load();
      }
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const saveNew = async () => {
    if (!form.full_name.trim()) {
      toast.error("Full name is required");
      return;
    }
    setSaving(true);
    const payload: any = { ...form };
    if (!payload.hire_date) delete payload.hire_date;
    if (!payload.email) delete payload.email;
    const { error } = await supabase.from("employees").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Employee added");
    setOpen(false);
    setForm(empty);
    load();
  };

  const filtered = employees.filter((e) => {
    const q = search.toLowerCase();
    return (
      e.full_name.toLowerCase().includes(q) ||
      (e.department || "").toLowerCase().includes(q) ||
      (e.role || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <Users className="w-6 h-6 text-accent" />
            Employees
          </h1>
          <p className="text-sm text-muted-foreground">HR directory of all employees.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={importFromVerified} disabled={importing}>
            <Download className="w-4 h-4 mr-2" />
            {importing ? "Importing…" : "Import from Verified Staff"}
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Employee
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, role, department…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No employees yet. Click "Import from Verified Staff" to seed from your existing list.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-3 font-medium">Name</th>
                  <th className="p-3 font-medium">Role</th>
                  <th className="p-3 font-medium">Department</th>
                  <th className="p-3 font-medium">Type</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 font-medium">{e.full_name}</td>
                    <td className="p-3">{e.role || "—"}</td>
                    <td className="p-3">{e.department || "—"}</td>
                    <td className="p-3 capitalize">{e.employment_type.replace("_", " ")}</td>
                    <td className="p-3">
                      <Badge variant={e.status === "active" ? "default" : "secondary"}>
                        {e.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/admin/employees/${e.id}`)}>
                        Manage
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Employee</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Full Name *</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label>Role</Label>
              <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
            </div>
            <div>
              <Label>Department</Label>
              <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </div>
            <div>
              <Label>Hire Date</Label>
              <Input type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} />
            </div>
            <div>
              <Label>Employment Type</Label>
              <Select value={form.employment_type} onValueChange={(v) => setForm({ ...form, employment_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_time">Full-time</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="intern">Intern</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_leave">On Leave</SelectItem>
                  <SelectItem value="terminated">Terminated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Bank Name</Label>
              <Input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Bank Account</Label>
              <Input value={form.bank_account} onChange={(e) => setForm({ ...form, bank_account: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={saveNew} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminEmployees;
