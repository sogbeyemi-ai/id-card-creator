import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { RefreshCw, Unlock, Lock, Search, CreditCard, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { IDCardFront, IDCardBack } from "@/components/IDCardPreview";
import type { CompanyTemplate } from "@/components/StaffForm";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

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
  photo_url: string;
}

interface VerifiedStaff {
  id: string;
  full_name: string;
  role: string;
  department: string | null;
  state: string | null;
  company: string | null;
}

const AdminEntries = () => {
  const [entries, setEntries] = useState<StaffEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [tab, setTab] = useState<"entries" | "generate">("entries");

  // Generate state
  const [verifiedStaff, setVerifiedStaff] = useState<VerifiedStaff[]>([]);
  const [staffSearch, setStaffSearch] = useState("");
  const [selectedStaff, setSelectedStaff] = useState<VerifiedStaff | null>(null);
  const [genCompany, setGenCompany] = useState<CompanyTemplate>("SOTI");
  const [genPhoto, setGenPhoto] = useState<File | null>(null);
  const [genPhotoPreview, setGenPhotoPreview] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatedCard, setGeneratedCard] = useState<StaffEntry | null>(null);
  const [downloading, setDownloading] = useState(false);

  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const fetchEntries = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("staff_entries")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) toast.error(error.message);
    else setEntries((data as StaffEntry[]) || []);
    setLoading(false);
  };

  const fetchVerifiedStaff = async () => {
    const { data } = await supabase
      .from("verified_staff")
      .select("id, full_name, role, department, state, company")
      .order("full_name");
    if (data) setVerifiedStaff(data);
  };

  useEffect(() => {
    fetchEntries();
    fetchVerifiedStaff();
  }, []);

  const toggleDownloadLock = async (entry: StaffEntry) => {
    const newLocked = !entry.download_locked;
    const newCount = newLocked ? entry.download_count : 0;

    const { error } = await supabase
      .from("staff_entries")
      .update({ download_locked: newLocked, download_count: newCount })
      .eq("id", entry.id);

    if (error) toast.error(error.message);
    else {
      toast.success(newLocked ? "Download locked" : "Download re-enabled");
      fetchEntries();
    }
  };

  const filteredEntries = entries.filter(
    (e) =>
      e.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.state || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredStaff = verifiedStaff.filter(
    (s) =>
      s.full_name.toLowerCase().includes(staffSearch.toLowerCase()) ||
      s.role.toLowerCase().includes(staffSearch.toLowerCase())
  );

  const handleGenPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setGenPhoto(file);
        setGenPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerateForStaff = async () => {
    if (!selectedStaff || !genPhoto) {
      toast.error("Select a staff member and upload a photo");
      return;
    }

    setGenerating(true);
    try {
      const fileExt = genPhoto.name.split(".").pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("staff-photos").upload(fileName, genPhoto);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("staff-photos").getPublicUrl(fileName);

      const roleDept = [selectedStaff.role, selectedStaff.department].filter(Boolean).join("-");

      const { data: entry, error: insertError } = await supabase
        .from("staff_entries")
        .insert({
          full_name: selectedStaff.full_name,
          role: selectedStaff.role,
          department: selectedStaff.department || "",
          company: genCompany,
          photo_url: urlData.publicUrl,
          state: selectedStaff.state || "",
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setGeneratedCard(entry as StaffEntry);
      toast.success("ID Card generated!");
      fetchEntries();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleAdminDownload = async () => {
    if (!frontRef.current || !backRef.current || !generatedCard) return;
    setDownloading(true);
    try {
      const frontCanvas = await html2canvas(frontRef.current, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const backCanvas = await html2canvas(backRef.current, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [85.6, 130] });
      pdf.addImage(frontCanvas.toDataURL("image/png"), "PNG", 0, 0, 85.6, 130);
      pdf.addPage([85.6, 130], "portrait");
      pdf.addImage(backCanvas.toDataURL("image/png"), "PNG", 0, 0, 85.6, 130);
      const safeName = generatedCard.full_name.replace(/\s+/g, "_");
      pdf.save(`${safeName}_ID_Card.pdf`);
      toast.success("PDF downloaded!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div className="flex items-center gap-4">
        <Button
          variant={tab === "entries" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("entries")}
          className={tab === "entries" ? "bg-accent text-accent-foreground" : ""}
        >
          Generated IDs
        </Button>
        <Button
          variant={tab === "generate" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("generate")}
          className={tab === "generate" ? "bg-accent text-accent-foreground" : ""}
        >
          <CreditCard className="w-4 h-4 mr-1" /> Generate ID
        </Button>
      </div>

      {tab === "entries" ? (
        <>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h1 className="font-display text-2xl font-bold">Generated ID Cards</h1>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name, company, state…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>
              <Button variant="outline" size="sm" onClick={fetchEntries} disabled={loading}>
                <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
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
                {filteredEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      {loading ? "Loading…" : "No entries found"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEntries.map((entry) => (
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
        </>
      ) : (
        /* Admin Generate ID */
        <div className="space-y-6 max-w-4xl">
          <h1 className="font-display text-2xl font-bold">Generate ID Card (Admin)</h1>

          {!generatedCard ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Select staff */}
              <Card className="p-6 space-y-4">
                <h3 className="font-semibold">1. Select Verified Staff</h3>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search staff by name or role…"
                    value={staffSearch}
                    onChange={(e) => setStaffSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="max-h-60 overflow-auto border rounded-lg">
                  {filteredStaff.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4 text-center">No staff found</p>
                  ) : (
                    filteredStaff.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedStaff(s)}
                        className={`w-full text-left px-4 py-2 text-sm border-b last:border-0 hover:bg-muted/50 transition-colors ${
                          selectedStaff?.id === s.id ? "bg-accent/10 font-medium" : ""
                        }`}
                      >
                        <p className="font-medium">{s.full_name}</p>
                        <p className="text-xs text-muted-foreground">{s.role} {s.department ? `- ${s.department}` : ""}</p>
                      </button>
                    ))
                  )}
                </div>
              </Card>

              {/* Configure & generate */}
              <Card className="p-6 space-y-4">
                <h3 className="font-semibold">2. Configure & Generate</h3>

                {selectedStaff && (
                  <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
                    <p><strong>Name:</strong> {selectedStaff.full_name}</p>
                    <p><strong>Role:</strong> {selectedStaff.role}</p>
                    <p><strong>Department:</strong> {selectedStaff.department || "—"}</p>
                    <p><strong>State:</strong> {selectedStaff.state || "—"}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Company Template</Label>
                  <Select value={genCompany} onValueChange={(v: CompanyTemplate) => setGenCompany(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SOTI">SOTI</SelectItem>
                      <SelectItem value="OPAY">OPAY</SelectItem>
                      <SelectItem value="Blue Ridge">BLUE RIDGE</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Passport Photo</Label>
                  <input ref={photoInputRef} type="file" accept="image/*" onChange={handleGenPhoto} className="hidden" />
                  <Button variant="outline" className="w-full" onClick={() => photoInputRef.current?.click()}>
                    {genPhotoPreview ? "Change Photo" : "Upload Photo"}
                  </Button>
                  {genPhotoPreview && (
                    <div className="flex justify-center">
                      <img src={genPhotoPreview} alt="Preview" className="w-24 h-24 rounded-lg object-cover" />
                    </div>
                  )}
                </div>

                <Button
                  onClick={handleGenerateForStaff}
                  disabled={!selectedStaff || !genPhoto || generating}
                  className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  {generating ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
                      Generating…
                    </span>
                  ) : "Generate ID Card"}
                </Button>
              </Card>
            </div>
          ) : (
            /* Generated card preview */
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row gap-6 justify-center items-center">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground text-center font-semibold uppercase">Front</p>
                  <div className="shadow-elevated rounded-lg overflow-hidden" style={{ width: 350 }}>
                    <IDCardFront
                      ref={frontRef}
                      fullName={generatedCard.full_name}
                      roleDepartment={[generatedCard.role, generatedCard.department].filter(Boolean).join("-")}
                      state={generatedCard.state || ""}
                      company={generatedCard.company as CompanyTemplate}
                      photoUrl={generatedCard.photo_url}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground text-center font-semibold uppercase">Back</p>
                  <div className="shadow-elevated rounded-lg overflow-hidden" style={{ width: 350 }}>
                    <IDCardBack ref={backRef} company={generatedCard.company as CompanyTemplate} />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 justify-center">
                <Button onClick={handleAdminDownload} disabled={downloading} className="bg-accent text-accent-foreground hover:bg-accent/90">
                  {downloading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
                      Downloading…
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Download className="w-4 h-4" /> Download PDF
                    </span>
                  )}
                </Button>
                <Button variant="outline" onClick={() => { setGeneratedCard(null); setGenPhoto(null); setGenPhotoPreview(null); setSelectedStaff(null); }}>
                  Generate Another
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminEntries;
