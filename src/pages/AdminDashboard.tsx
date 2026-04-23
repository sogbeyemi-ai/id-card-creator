import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, CreditCard, Download, TrendingUp, FileSpreadsheet, Filter, X } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from "recharts";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface DownloadEntry {
  id: string;
  full_name: string;
  role: string;
  department: string;
  state: string | null;
  created_at: string;
  downloaded_at: string | null;
  download_count: number;
}

const AdminDashboard = () => {
  const [stats, setStats] = useState({ verifiedStaff: 0, generatedIds: 0, downloads: 0 });
  const [loading, setLoading] = useState(true);
  const [activityData, setActivityData] = useState<{ date: string; ids: number; downloads: number }[]>([]);

  // Download report data
  const [downloadEntries, setDownloadEntries] = useState<DownloadEntry[]>([]);
  const [reportLoading, setReportLoading] = useState(true);

  // Filters for the report section
  const [nameFilter, setNameFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [roleDeptFilter, setRoleDeptFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "downloaded" | "generated" | "pending">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exporting, setExporting] = useState(false);

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

        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
        const dateStr = fourteenDaysAgo.toISOString();

        const [entriesData, downloadsData] = await Promise.all([
          supabase.from("staff_entries").select("created_at").gte("created_at", dateStr),
          supabase.from("download_logs").select("downloaded_at").gte("downloaded_at", dateStr),
        ]);

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

    const fetchAllPaged = async <T,>(
      table: "verified_staff" | "staff_entries",
      columns: string
    ): Promise<T[]> => {
      const pageSize = 1000;
      let from = 0;
      const all: T[] = [];
      while (true) {
        const { data, error } = await supabase
          .from(table)
          .select(columns)
          .range(from, from + pageSize - 1);
        if (error) break;
        const batch = (data as unknown as T[]) || [];
        all.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
      }
      return all;
    };

    const fetchDownloadEntries = async () => {
      setReportLoading(true);
      try {
        // Pull the FULL uploaded staff list (verified_staff) so the report is
        // never blank just because nobody has generated an ID yet. Then merge
        // download status from staff_entries by matching full_name.
        const [verified, generated] = await Promise.all([
          fetchAllPaged<{
            id: string;
            full_name: string;
            role: string | null;
            department: string | null;
            state: string | null;
            created_at: string;
          }>("verified_staff", "id, full_name, role, department, state, created_at"),
          fetchAllPaged<{
            full_name: string;
            state: string | null;
            created_at: string;
            downloaded_at: string | null;
            download_count: number;
          }>(
            "staff_entries",
            "full_name, state, created_at, downloaded_at, download_count"
          ),
        ]);

        // Index generated entries by normalized name for quick merge
        const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
        const genMap = new Map<
          string,
          { downloaded_at: string | null; download_count: number; created_at: string; state: string | null }
        >();
        generated.forEach((g) => {
          const key = norm(g.full_name);
          const existing = genMap.get(key);
          if (
            !existing ||
            (g.downloaded_at && (!existing.downloaded_at || g.downloaded_at > existing.downloaded_at))
          ) {
            genMap.set(key, {
              downloaded_at: g.downloaded_at,
              download_count: g.download_count || 0,
              created_at: g.created_at,
              state: g.state,
            });
          }
        });

        const merged: DownloadEntry[] = verified.map((v) => {
          const g = genMap.get(norm(v.full_name));
          return {
            id: v.id,
            full_name: v.full_name,
            role: v.role || "",
            department: v.department || "",
            state: v.state || g?.state || null,
            created_at: g?.created_at || v.created_at,
            downloaded_at: g?.downloaded_at || null,
            download_count: g?.download_count || 0,
          };
        });

        // Include any generated entries that don't match a verified record
        // (manually generated walk-ins) so admin still sees them.
        const verifiedKeys = new Set(verified.map((v) => norm(v.full_name)));
        generated.forEach((g) => {
          if (!verifiedKeys.has(norm(g.full_name))) {
            merged.push({
              id: `gen-${g.full_name}-${g.created_at}`,
              full_name: g.full_name,
              role: "",
              department: "",
              state: g.state,
              created_at: g.created_at,
              downloaded_at: g.downloaded_at,
              download_count: g.download_count || 0,
            });
          }
        });

        merged.sort((a, b) => (a.full_name > b.full_name ? 1 : -1));
        setDownloadEntries(merged);
      } catch {
        // silent
      } finally {
        setReportLoading(false);
      }
    };

    fetchStats();
    fetchDownloadEntries();
  }, []);

  const cityOptions = useMemo(() => {
    const set = new Set<string>();
    downloadEntries.forEach((e) => {
      if (e.state) set.add(e.state.trim());
    });
    return Array.from(set).sort();
  }, [downloadEntries]);

  const roleDeptOptions = useMemo(() => {
    const set = new Set<string>();
    downloadEntries.forEach((e) => {
      const rd = [e.role, e.department].filter(Boolean).join("-");
      if (rd) set.add(rd);
    });
    return Array.from(set).sort();
  }, [downloadEntries]);

  const filteredReport = useMemo(() => {
    const q = nameFilter.toLowerCase().trim();
    const fromTs = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : null;
    const toTs = dateTo ? new Date(dateTo + "T23:59:59.999").getTime() : null;
    return downloadEntries.filter((e) => {
      const rd = [e.role, e.department].filter(Boolean).join("-");
      const hasDownloaded = e.download_count > 0 || !!e.downloaded_at;
      const hasGenerated = !!e.downloaded_at || e.download_count > 0 || (e.id?.startsWith("gen-") ?? false);
      if (q && !e.full_name.toLowerCase().includes(q)) return false;
      if (cityFilter !== "all" && (e.state || "").trim() !== cityFilter) return false;
      if (roleDeptFilter !== "all" && rd !== roleDeptFilter) return false;
      if (statusFilter === "downloaded" && !hasDownloaded) return false;
      if (statusFilter === "generated" && !hasGenerated) return false;
      if (statusFilter === "pending" && hasDownloaded) return false;
      if (fromTs !== null || toTs !== null) {
        const raw = e.downloaded_at || e.created_at;
        const ts = new Date(raw).getTime();
        if (fromTs !== null && ts < fromTs) return false;
        if (toTs !== null && ts > toTs) return false;
      }
      return true;
    });
  }, [downloadEntries, nameFilter, cityFilter, roleDeptFilter, statusFilter, dateFrom, dateTo]);

  const reportStats = useMemo(() => {
    const downloaded = filteredReport.filter((e) => e.download_count > 0 || e.downloaded_at);
    const totalDownloaded = downloaded.length;
    const downloadedByCity: Record<string, number> = {};
    const downloadedByRoleDept: Record<string, number> = {};
    downloaded.forEach((e) => {
      const city = (e.state || "Unknown").trim();
      downloadedByCity[city] = (downloadedByCity[city] || 0) + 1;
      const rd = [e.role, e.department].filter(Boolean).join("-") || "Unknown";
      downloadedByRoleDept[rd] = (downloadedByRoleDept[rd] || 0) + 1;
    });
    return { totalDownloaded, downloadedByCity, downloadedByRoleDept, totalInScope: filteredReport.length };
  }, [filteredReport]);

  const clearReportFilters = () => {
    setNameFilter("");
    setCityFilter("all");
    setRoleDeptFilter("all");
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const exportToExcel = async () => {
    if (filteredReport.length === 0) {
      toast.error("No records to export");
      return;
    }
    setExporting(true);
    try {
      const rows = filteredReport.map((e) => ({
        "Full Name": e.full_name,
        Role: e.role,
        Department: e.department || "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [{ wch: 32 }, { wch: 24 }, { wch: 24 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Staff Records");
      const stamp = new Date().toISOString().slice(0, 10);
      const cityTag = cityFilter !== "all" ? `_${cityFilter.replace(/[^a-zA-Z0-9]+/g, "_")}` : "";
      XLSX.writeFile(wb, `staff_report${cityTag}_${stamp}.xlsx`);
      toast.success(`Exported ${rows.length} records`);
    } catch (err: any) {
      toast.error(err?.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

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

  const topCities = Object.entries(reportStats.downloadedByCity)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const topRoleDepts = Object.entries(reportStats.downloadedByRoleDept)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

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

      {/* Download Reports Section */}
      <Card className="p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-accent" />
              Download Reports
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Filter staff records and export name, role, and department to Excel.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={clearReportFilters}>
              <X className="w-3 h-3 mr-1" /> Clear
            </Button>
            <Button
              size="sm"
              onClick={exportToExcel}
              disabled={exporting || filteredReport.length === 0}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {exporting ? (
                <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />
              ) : (
                <FileSpreadsheet className="w-3 h-3 mr-1" />
              )}
              Export Excel
            </Button>
          </div>
        </div>

        {/* Filters grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1">
              <Filter className="w-3 h-3" /> Name
            </Label>
            <Input
              placeholder="Search by name…"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">City / State</Label>
            <Select value={cityFilter} onValueChange={setCityFilter}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cities</SelectItem>
                {cityOptions.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Role-Department</Label>
            <Select value={roleDeptFilter} onValueChange={setRoleDeptFilter}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {roleDeptOptions.map((rd) => (
                  <SelectItem key={rd} value={rd}>{rd}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="downloaded">Downloaded</SelectItem>
                <SelectItem value="generated">Generated</SelectItem>
                <SelectItem value="pending">Pending (not downloaded)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Date From</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Date To</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9" />
          </div>
        </div>

        {/* Summary stats */}
        {reportLoading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-xs text-muted-foreground">In current filter</p>
              <p className="text-2xl font-bold">{reportStats.totalInScope}</p>
              <p className="text-xs text-muted-foreground mt-1">staff records</p>
            </div>
            <div className="bg-accent/10 rounded-lg p-4">
              <p className="text-xs text-muted-foreground">Downloaded their ID</p>
              <p className="text-2xl font-bold text-accent">{reportStats.totalDownloaded}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {reportStats.totalInScope > 0
                  ? `${Math.round((reportStats.totalDownloaded / reportStats.totalInScope) * 100)}% download rate`
                  : "—"}
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-xs text-muted-foreground">Pending download</p>
              <p className="text-2xl font-bold">{reportStats.totalInScope - reportStats.totalDownloaded}</p>
              <p className="text-xs text-muted-foreground mt-1">have not downloaded</p>
            </div>
          </div>
        )}

        {/* Breakdown lists */}
        {!reportLoading && reportStats.totalDownloaded > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Top cities (downloaded)</p>
              <div className="space-y-1">
                {topCities.map(([city, count]) => (
                  <div key={city} className="flex items-center justify-between text-sm bg-muted/30 rounded px-3 py-1.5">
                    <span className="truncate">{city}</span>
                    <span className="font-semibold text-accent">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Top role-departments (downloaded)</p>
              <div className="space-y-1">
                {topRoleDepts.map(([rd, count]) => (
                  <div key={rd} className="flex items-center justify-between text-sm bg-muted/30 rounded px-3 py-1.5">
                    <span className="truncate">{rd}</span>
                    <span className="font-semibold text-accent">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default AdminDashboard;
