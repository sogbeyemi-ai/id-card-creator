import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Users, CreditCard, Download, Shield } from "lucide-react";

const AdminDashboard = () => {
  const [stats, setStats] = useState({ verifiedStaff: 0, generatedIds: 0, downloads: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      const [verified, entries, downloads] = await Promise.all([
        supabase.from("verified_staff").select("id", { count: "exact", head: true }),
        supabase.from("staff_entries").select("id", { count: "exact", head: true }),
        supabase.from("download_logs").select("id", { count: "exact", head: true }),
      ]);
      setStats({
        verifiedStaff: verified.count || 0,
        generatedIds: entries.count || 0,
        downloads: downloads.count || 0,
      });
    };
    fetchStats();
  }, []);

  const cards = [
    { label: "Verified Staff", value: stats.verifiedStaff, icon: Shield, color: "text-accent" },
    { label: "Generated IDs", value: stats.generatedIds, icon: CreditCard, color: "text-primary" },
    { label: "Downloads", value: stats.downloads, icon: Download, color: "text-secondary" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-6 flex items-center gap-4">
            <div className={`p-3 rounded-lg bg-muted ${c.color}`}>
              <c.icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-bold">{c.value}</p>
              <p className="text-sm text-muted-foreground">{c.label}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AdminDashboard;
