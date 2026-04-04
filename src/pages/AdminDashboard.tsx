import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Shield, CreditCard, Download, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from "recharts";

const AdminDashboard = () => {
  const [stats, setStats] = useState({ verifiedStaff: 0, generatedIds: 0, downloads: 0 });
  const [loading, setLoading] = useState(true);
  const [activityData, setActivityData] = useState<{ date: string; ids: number; downloads: number }[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
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

        // Fetch activity data for charts (last 14 days)
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
        const dateStr = fourteenDaysAgo.toISOString();

        const [entriesData, downloadsData] = await Promise.all([
          supabase.from("staff_entries").select("created_at").gte("created_at", dateStr),
          supabase.from("download_logs").select("downloaded_at").gte("downloaded_at", dateStr),
        ]);

        // Group by date
        const dateMap: Record<string, { ids: number; downloads: number }> = {};
        for (let i = 0; i < 14; i++) {
          const d = new Date();
          d.setDate(d.getDate() - (13 - i));
          const key = d.toISOString().split("T")[0];
          dateMap[key] = { ids: 0, downloads: 0 };
        }

        entriesData.data?.forEach((e) => {
          const key = e.created_at.split("T")[0];
          if (dateMap[key]) dateMap[key].ids++;
        });
        downloadsData.data?.forEach((d) => {
          const key = d.downloaded_at.split("T")[0];
          if (dateMap[key]) dateMap[key].downloads++;
        });

        setActivityData(
          Object.entries(dateMap).map(([date, val]) => ({
            date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            ids: val.ids,
            downloads: val.downloads,
          }))
        );
      } catch {
        // fail silently
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const cards = [
    { label: "Verified Staff", value: stats.verifiedStaff, icon: Shield, color: "text-accent" },
    { label: "Generated IDs", value: stats.generatedIds, icon: CreditCard, color: "text-primary" },
    { label: "Downloads", value: stats.downloads, icon: Download, color: "text-secondary" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="w-8 h-8 border-4 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl font-bold">Dashboard</h1>

      {/* Stats cards */}
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

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="font-display font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-accent" />
            ID Generation (Last 14 Days)
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={activityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="ids" fill="hsl(var(--accent))" name="IDs Generated" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6">
          <h3 className="font-display font-semibold mb-4 flex items-center gap-2">
            <Download className="w-4 h-4 text-accent" />
            Activity Trend
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={activityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="ids" stroke="hsl(var(--accent))" name="Generated" strokeWidth={2} />
              <Line type="monotone" dataKey="downloads" stroke="hsl(var(--primary))" name="Downloads" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;
