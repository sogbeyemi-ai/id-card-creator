import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Save, Trash2 } from "lucide-react";

const AdminEmployeeDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<any>(null);
  const [salary, setSalary] = useState<any>({
    base_salary: 0,
    transport_allowance: 0,
    housing_allowance: 0,
    other_allowance: 0,
    tax_rate: 0,
    pension_rate: 0,
    effective_from: new Date().toISOString().slice(0, 10),
  });
  const [history, setHistory] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: emp }, { data: sal }, { data: items }] = await Promise.all([
      supabase.from("employees").select("*").eq("id", id).single(),
      supabase
        .from("salary_structures")
        .select("*")
        .eq("employee_id", id)
        .order("effective_from", { ascending: false })
        .limit(1),
      supabase
        .from("payroll_items")
        .select("id, run_id, gross_pay, net_pay, created_at, payroll_runs!inner(period_label, status)")
        .eq("employee_id", id)
        .order("created_at", { ascending: false }),
    ]);

    setEmployee(emp);
    if (sal && sal[0]) {
      setSalary({
        ...sal[0],
        effective_from: sal[0].effective_from || new Date().toISOString().slice(0, 10),
      });
    }
    setHistory(items || []);
    setLoading(false);
  };

  useEffect(() => { if (id) load(); }, [id]);

  const saveEmployee = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("employees")
      .update({
        full_name: employee.full_name,
        email: employee.email,
        phone: employee.phone,
        hire_date: employee.hire_date,
        employment_type: employee.employment_type,
        status: employee.status,
        department: employee.department,
        role: employee.role,
        bank_name: employee.bank_name,
        bank_account: employee.bank_account,
      })
      .eq("id", id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Employee saved");
  };

  const saveSalary = async () => {
    setSaving(true);
    const payload = {
      employee_id: id,
      base_salary: Number(salary.base_salary) || 0,
      transport_allowance: Number(salary.transport_allowance) || 0,
      housing_allowance: Number(salary.housing_allowance) || 0,
      other_allowance: Number(salary.other_allowance) || 0,
      tax_rate: Number(salary.tax_rate) || 0,
      pension_rate: Number(salary.pension_rate) || 0,
      effective_from: salary.effective_from,
    };
    // Always insert a new salary row to preserve history
    const { error } = await supabase.from("salary_structures").insert(payload);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Salary structure saved");
      load();
    }
  };

  const removeEmployee = async () => {
    if (!confirm("Delete this employee? This will also delete their salary history and payroll items.")) return;
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Employee deleted");
      navigate("/admin/employees");
    }
  };

  if (loading || !employee) {
    return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  }

  const fmt = (n: number | string) =>
    new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(Number(n) || 0);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/employees")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <h1 className="font-display text-2xl font-semibold flex-1">{employee.full_name}</h1>
        <Button variant="outline" size="sm" onClick={removeEmployee}>
          <Trash2 className="w-4 h-4 mr-1" /> Delete
        </Button>
      </div>

      <Card className="p-5 space-y-4">
        <h2 className="font-semibold">HR Profile</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Full Name</Label>
            <Input value={employee.full_name || ""} onChange={(e) => setEmployee({ ...employee, full_name: e.target.value })} /></div>
          <div><Label>Email</Label>
            <Input value={employee.email || ""} onChange={(e) => setEmployee({ ...employee, email: e.target.value })} /></div>
          <div><Label>Phone</Label>
            <Input value={employee.phone || ""} onChange={(e) => setEmployee({ ...employee, phone: e.target.value })} /></div>
          <div><Label>Role</Label>
            <Input value={employee.role || ""} onChange={(e) => setEmployee({ ...employee, role: e.target.value })} /></div>
          <div><Label>Department</Label>
            <Input value={employee.department || ""} onChange={(e) => setEmployee({ ...employee, department: e.target.value })} /></div>
          <div><Label>Hire Date</Label>
            <Input type="date" value={employee.hire_date || ""} onChange={(e) => setEmployee({ ...employee, hire_date: e.target.value })} /></div>
          <div><Label>Employment Type</Label>
            <Select value={employee.employment_type} onValueChange={(v) => setEmployee({ ...employee, employment_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full_time">Full-time</SelectItem>
                <SelectItem value="contract">Contract</SelectItem>
                <SelectItem value="intern">Intern</SelectItem>
              </SelectContent>
            </Select></div>
          <div><Label>Status</Label>
            <Select value={employee.status} onValueChange={(v) => setEmployee({ ...employee, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="on_leave">On Leave</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
              </SelectContent>
            </Select></div>
          <div><Label>Bank Name</Label>
            <Input value={employee.bank_name || ""} onChange={(e) => setEmployee({ ...employee, bank_name: e.target.value })} /></div>
          <div><Label>Bank Account</Label>
            <Input value={employee.bank_account || ""} onChange={(e) => setEmployee({ ...employee, bank_account: e.target.value })} /></div>
        </div>
        <Button onClick={saveEmployee} disabled={saving}>
          <Save className="w-4 h-4 mr-2" /> {saving ? "Saving…" : "Save Profile"}
        </Button>
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="font-semibold">Salary Structure (latest)</h2>
        <p className="text-xs text-muted-foreground">
          Saving creates a new salary record so history is preserved. Current effective values are shown.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Base Salary (₦)</Label>
            <Input type="number" value={salary.base_salary} onChange={(e) => setSalary({ ...salary, base_salary: e.target.value })} /></div>
          <div><Label>Effective From</Label>
            <Input type="date" value={salary.effective_from} onChange={(e) => setSalary({ ...salary, effective_from: e.target.value })} /></div>
          <div><Label>Transport Allowance (₦)</Label>
            <Input type="number" value={salary.transport_allowance} onChange={(e) => setSalary({ ...salary, transport_allowance: e.target.value })} /></div>
          <div><Label>Housing Allowance (₦)</Label>
            <Input type="number" value={salary.housing_allowance} onChange={(e) => setSalary({ ...salary, housing_allowance: e.target.value })} /></div>
          <div><Label>Other Allowance (₦)</Label>
            <Input type="number" value={salary.other_allowance} onChange={(e) => setSalary({ ...salary, other_allowance: e.target.value })} /></div>
          <div /> 
          <div><Label>Tax Rate (%)</Label>
            <Input type="number" step="0.01" value={salary.tax_rate} onChange={(e) => setSalary({ ...salary, tax_rate: e.target.value })} /></div>
          <div><Label>Pension Rate (%)</Label>
            <Input type="number" step="0.01" value={salary.pension_rate} onChange={(e) => setSalary({ ...salary, pension_rate: e.target.value })} /></div>
        </div>
        <Button onClick={saveSalary} disabled={saving}>
          <Save className="w-4 h-4 mr-2" /> {saving ? "Saving…" : "Save Salary"}
        </Button>
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold">Payroll History</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payroll runs for this employee yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="p-2">Period</th>
                <th className="p-2">Gross</th>
                <th className="p-2">Net</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h: any) => (
                <tr key={h.id} className="border-t">
                  <td className="p-2">{h.payroll_runs?.period_label}</td>
                  <td className="p-2">{fmt(h.gross_pay)}</td>
                  <td className="p-2 font-medium">{fmt(h.net_pay)}</td>
                  <td className="p-2 capitalize">{h.payroll_runs?.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};

export default AdminEmployeeDetail;
