import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Building2, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

interface Client {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  currency: string;
  created_at: string;
}

export default function AdminClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("NGN");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("payroll_clients")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setClients(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!name.trim()) { toast.error("Enter client name"); return; }
    setSaving(true);
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { error } = await supabase.from("payroll_clients").insert({
      name: name.trim(),
      slug,
      currency,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Client created");
    setName(""); setCurrency("NGN"); setOpen(false);
    load();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Payroll Clients</h1>
          <p className="text-sm text-muted-foreground">Manage companies for payslip generation</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />New Client</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create client</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Client name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. BlueRidge Limited" />
              </div>
              <div>
                <Label>Currency code</Label>
                <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading clients...</p>
      ) : clients.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Building2 className="w-10 h-10 mx-auto mb-2 opacity-50" />
          No clients yet. Create one to begin.
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => (
            <Card key={c.id} className="hover:shadow-md transition">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-primary" />
                  {c.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Currency: {c.currency}</p>
                <p className="text-xs text-muted-foreground mb-4">Slug: {c.slug}</p>
                <Link to={`/admin/clients/${c.id}`}>
                  <Button variant="outline" size="sm" className="w-full">
                    Manage <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
