import { useState, useRef, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  RefreshCw,
  Unlock,
  Lock,
  Search,
  CreditCard,
  Download,
  Pencil,
  PackageOpen,
  Filter,
  X,
  Save,
  Trash2,
  Copy,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { IDCardFront, IDCardBack } from "@/components/IDCardPreview";
import type { CompanyTemplate } from "@/components/StaffForm";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import { createRoot } from "react-dom/client";

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
  downloaded_at: string | null;
  photo_url: string;
  deleted_at?: string | null;
}

interface VerifiedStaff {
  id: string;
  full_name: string;
  role: string;
  department: string | null;
  state: string | null;
  company: string | null;
}

const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");

const AdminEntries = () => {
  const [entries, setEntries] = useState<StaffEntry[]>([]);
  const [trashedEntries, setTrashedEntries] = useState<StaffEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [trashLoading, setTrashLoading] = useState(false);
  const [tab, setTab] = useState<"entries" | "generate" | "trash">("entries");
  const [restoreTargets, setRestoreTargets] = useState<StaffEntry[]>([]);
  const [purgeTargets, setPurgeTargets] = useState<StaffEntry[]>([]);
  const [trashActionLoading, setTrashActionLoading] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [roleDeptFilter, setRoleDeptFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateField, setDateField] = useState<"created_at" | "downloaded_at">("created_at");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk download
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkStatus, setBulkStatus] = useState<string>("");

  // Saved downloads (persist generated ZIPs in memory for re-download)
  interface SavedDownload {
    id: string;
    name: string;
    blob: Blob;
    sizeKb: number;
    count: number;
    createdAt: number;
  }
  const [savedDownloads, setSavedDownloads] = useState<SavedDownload[]>([]);

  // Edit dialog
  const [editEntry, setEditEntry] = useState<StaffEntry | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", roleDept: "", state: "" });
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete confirmation
  const [deleteTargets, setDeleteTargets] = useState<StaffEntry[]>([]);
  const [deleting, setDeleting] = useState(false);

  // Duplicates tool
  const [showDuplicates, setShowDuplicates] = useState(false);

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
    // Paginate to bypass 1000-row default
    const pageSize = 1000;
    let from = 0;
    const all: StaffEntry[] = [];
    while (true) {
      const { data, error } = await supabase
        .from("staff_entries")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) {
        toast.error(error.message);
        break;
      }
      const batch = (data as StaffEntry[]) || [];
      all.push(...batch);
      if (batch.length < pageSize) break;
      from += pageSize;
    }
    setEntries(all);
    setLoading(false);
  };

  const fetchVerifiedStaff = async () => {
    const { data } = await supabase
      .from("verified_staff")
      .select("id, full_name, role, department, state, company")
      .order("full_name");
    if (data) setVerifiedStaff(data);
  };

  const fetchTrash = async () => {
    setTrashLoading(true);
    const { data, error } = await supabase
      .from("staff_entries")
      .select("*")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    if (error) toast.error(error.message);
    else setTrashedEntries((data as StaffEntry[]) || []);
    setTrashLoading(false);
  };

  useEffect(() => {
    fetchEntries();
    fetchVerifiedStaff();
    fetchTrash();
  }, []);

  useEffect(() => {
    if (tab === "trash") fetchTrash();
  }, [tab]);

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

  // Unique values for filter dropdowns
  const cityOptions = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      if (e.state) set.add(e.state.trim());
    });
    return Array.from(set).sort();
  }, [entries]);

  const roleDeptOptions = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      const rd = [e.role, e.department].filter(Boolean).join("-");
      if (rd) set.add(rd);
    });
    return Array.from(set).sort();
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    const fromTs = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : null;
    const toTs = dateTo ? new Date(dateTo + "T23:59:59.999").getTime() : null;
    return entries.filter((e) => {
      const rd = [e.role, e.department].filter(Boolean).join("-");
      if (q) {
        const blob = `${e.full_name} ${rd} ${e.state || ""} ${e.company}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      if (cityFilter !== "all" && (e.state || "").trim() !== cityFilter) return false;
      if (roleDeptFilter !== "all" && rd !== roleDeptFilter) return false;
      if (statusFilter !== "all") {
        const downloaded = e.download_count > 0;
        if (statusFilter === "downloaded" && !downloaded) return false;
        if (statusFilter === "generated" && downloaded) return false;
        if (statusFilter === "locked" && !e.download_locked) return false;
      }
      if (fromTs !== null || toTs !== null) {
        const raw = dateField === "downloaded_at" ? e.downloaded_at : e.created_at;
        if (!raw) return false;
        const ts = new Date(raw).getTime();
        if (fromTs !== null && ts < fromTs) return false;
        if (toTs !== null && ts > toTs) return false;
      }
      return true;
    });
  }, [entries, searchTerm, cityFilter, roleDeptFilter, statusFilter, dateField, dateFrom, dateTo]);

  const allFilteredSelected =
    filteredEntries.length > 0 && filteredEntries.every((e) => selectedIds.has(e.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      const next = new Set(selectedIds);
      filteredEntries.forEach((e) => next.delete(e.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      let skipped = 0;
      filteredEntries.forEach((e) => {
        // Never auto-include the latest copy of a duplicate group
        if (latestDuplicateIds.has(e.id)) {
          skipped++;
          return;
        }
        next.add(e.id);
      });
      setSelectedIds(next);
      if (skipped > 0) {
        toast.info(`${skipped} latest duplicate record${skipped === 1 ? " was" : "s were"} kept safe and not selected`);
      }
    }
  };

  const toggleSelect = (id: string) => {
    if (latestDuplicateIds.has(id) && !selectedIds.has(id)) {
      toast.warning("This is the LATEST copy of a duplicate. Use the row's Delete button if you really want to remove it.");
      return;
    }
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const clearFilters = () => {
    setSearchTerm("");
    setCityFilter("all");
    setRoleDeptFilter("all");
    setStatusFilter("all");
    setDateField("created_at");
    setDateFrom("");
    setDateTo("");
  };

  // Render an ID card off-screen and return the rendered front+back canvases.
  // Optimized: no fixed setTimeout — wait only for actual image readiness.
  const renderCardToCanvases = async (
    entry: StaffEntry
  ): Promise<{ front: HTMLCanvasElement; back: HTMLCanvasElement }> => {
    return new Promise((resolve, reject) => {
      const host = document.createElement("div");
      host.style.position = "fixed";
      host.style.left = "-99999px";
      host.style.top = "0";
      host.style.width = "350px";
      host.style.pointerEvents = "none";
      document.body.appendChild(host);

      const root = createRoot(host);
      const frontHolder = document.createElement("div");
      const backHolder = document.createElement("div");
      host.appendChild(frontHolder);
      host.appendChild(backHolder);

      const cleanup = () => {
        try {
          root.unmount();
        } catch {
          /* noop */
        }
        host.remove();
      };

      try {
        const roleDept = [entry.role, entry.department].filter(Boolean).join("-");
        const company = entry.company as CompanyTemplate;

        let frontEl: HTMLDivElement | null = null;
        let backEl: HTMLDivElement | null = null;

        root.render(
          <div>
            <div ref={(el) => (frontEl = el)}>
              <IDCardFront
                fullName={entry.full_name}
                roleDepartment={roleDept}
                state={entry.state || ""}
                company={company}
                photoUrl={entry.photo_url}
              />
            </div>
            <div ref={(el) => (backEl = el)}>
              <IDCardBack company={company} />
            </div>
          </div>
        );

        // Two paint frames is enough for React to commit + browser to layout.
        requestAnimationFrame(() => {
          requestAnimationFrame(async () => {
            try {
              const imgs = Array.from(host.querySelectorAll("img"));
              await Promise.all(
                imgs.map(
                  (img) =>
                    new Promise<void>((res) => {
                      if (img.complete && img.naturalWidth > 0) return res();
                      const done = () => res();
                      img.addEventListener("load", done, { once: true });
                      img.addEventListener("error", done, { once: true });
                    })
                )
              );

              const frontTarget = (frontEl?.firstElementChild as HTMLElement) || frontEl!;
              const backTarget = (backEl?.firstElementChild as HTMLElement) || backEl!;

              // Render front + back in parallel; scale 1.5 keeps it crisp at 85.6mm
              const [front, back] = await Promise.all([
                html2canvas(frontTarget, {
                  scale: 1.5,
                  useCORS: true,
                  backgroundColor: "#ffffff",
                  logging: false,
                }),
                html2canvas(backTarget, {
                  scale: 1.5,
                  useCORS: true,
                  backgroundColor: "#ffffff",
                  logging: false,
                }),
              ]);
              cleanup();
              resolve({ front, back });
            } catch (err) {
              cleanup();
              reject(err);
            }
          });
        });
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  };

  const buildPdfBlob = async (entry: StaffEntry): Promise<Blob> => {
    const { front, back } = await renderCardToCanvases(entry);
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [85.6, 130] });
    // JPEG @ 0.85 quality — visually identical to PNG for photo cards, ~5x smaller & faster.
    pdf.addImage(front.toDataURL("image/jpeg", 0.85), "JPEG", 0, 0, 85.6, 130);
    pdf.addPage([85.6, 130], "portrait");
    pdf.addImage(back.toDataURL("image/jpeg", 0.85), "JPEG", 0, 0, 85.6, 130);
    return pdf.output("blob");
  };

  // Process an array with bounded concurrency (default 4 in parallel).
  const runWithConcurrency = async <T, R>(
    items: T[],
    worker: (item: T, index: number) => Promise<R>,
    concurrency: number,
    onProgress?: (done: number) => void
  ): Promise<(R | undefined)[]> => {
    const results: (R | undefined)[] = new Array(items.length);
    let cursor = 0;
    let done = 0;
    const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        try {
          results[i] = await worker(items[i], i);
        } catch (err) {
          results[i] = undefined;
          console.error("worker failed", err);
        }
        done++;
        onProgress?.(done);
      }
    });
    await Promise.all(runners);
    return results;
  };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleBulkDownload = async () => {
    const targets = entries.filter((e) => selectedIds.has(e.id));
    if (targets.length === 0) {
      toast.error("Select at least one record");
      return;
    }
    setBulkDownloading(true);
    setBulkProgress(0);
    setBulkStatus(`Rendering 0 / ${targets.length}…`);

    const zip = new JSZip();
    let failed = 0;

    // Render PDFs in parallel batches of 4 (sweet spot for browser CPU/memory).
    const CONCURRENCY = 4;
    const blobs = await runWithConcurrency(
      targets,
      async (entry) => {
        const blob = await buildPdfBlob(entry);
        return { entry, blob };
      },
      CONCURRENCY,
      (done) => {
        setBulkProgress(Math.round((done / targets.length) * 100));
        setBulkStatus(`Rendering ${done} / ${targets.length}…`);
      }
    );

    blobs.forEach((res) => {
      if (!res || !res.blob) {
        failed++;
        return;
      }
      const safeName = sanitize(res.entry.full_name) || "ID";
      const shortId = res.entry.id.slice(0, 8);
      zip.file(`${safeName}_${shortId}.pdf`, res.blob);
    });

    try {
      setBulkStatus("Compressing ZIP…");
      // STORE = no deflate. PDFs are already compressed; dramatically faster.
      const zipBlob = await zip.generateAsync(
        { type: "blob", compression: "STORE" },
        (meta) => {
          setBulkProgress(Math.round(meta.percent));
        }
      );

      const stamp = new Date().toISOString().slice(0, 10);
      const cityTag = cityFilter !== "all" ? `_${sanitize(cityFilter)}` : "";
      const filename = `id_cards${cityTag}_${stamp}.zip`;

      // Save to in-memory list for re-download
      const saved: SavedDownload = {
        id: crypto.randomUUID(),
        name: filename,
        blob: zipBlob,
        sizeKb: Math.round(zipBlob.size / 1024),
        count: targets.length - failed,
        createdAt: Date.now(),
      };
      setSavedDownloads((prev) => [saved, ...prev].slice(0, 10));

      // Trigger immediate download
      triggerBlobDownload(zipBlob, filename);

      // Stamp downloaded_at for newly downloaded records
      const successfulIds = targets
        .filter((t) => !t.downloaded_at)
        .map((t) => t.id);
      if (successfulIds.length > 0) {
        await supabase
          .from("staff_entries")
          .update({ downloaded_at: new Date().toISOString() })
          .in("id", successfulIds);
      }

      toast.success(
        failed > 0
          ? `Downloaded ${targets.length - failed}/${targets.length} cards (${failed} failed)`
          : `Downloaded ${targets.length} ID cards`
      );
      fetchEntries();
    } catch (err: any) {
      toast.error(err?.message || "Failed to build ZIP");
    } finally {
      setBulkDownloading(false);
      setBulkProgress(0);
      setBulkStatus("");
    }
  };

  const redownloadSaved = (item: SavedDownload) => {
    triggerBlobDownload(item.blob, item.name);
    toast.success(`Re-downloaded ${item.name}`);
  };

  const removeSaved = (id: string) => {
    setSavedDownloads((prev) => prev.filter((s) => s.id !== id));
  };

  // Edit handlers
  const openEdit = (entry: StaffEntry) => {
    setEditEntry(entry);
    setEditForm({
      full_name: entry.full_name,
      roleDept: [entry.role, entry.department].filter(Boolean).join("-"),
      state: entry.state || "",
    });
  };

  const requestSaveEdit = () => {
    if (!editForm.full_name.trim()) {
      toast.error("Name is required");
      return;
    }
    setConfirmSaveOpen(true);
  };

  const confirmSaveEdit = async () => {
    if (!editEntry) return;
    setSavingEdit(true);
    const [rolePart, ...deptParts] = editForm.roleDept.split("-");
    const role = (rolePart || "").trim();
    const department = deptParts.join("-").trim();

    const { error } = await supabase
      .from("staff_entries")
      .update({
        full_name: editForm.full_name.trim(),
        role,
        department,
        state: editForm.state.trim() || null,
      })
      .eq("id", editEntry.id);

    setSavingEdit(false);
    setConfirmSaveOpen(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Record updated");
    setEditEntry(null);
    fetchEntries();
  };

  // Delete handlers
  const requestDeleteOne = (entry: StaffEntry) => {
    setDeleteTargets([entry]);
  };

  const requestDeleteSelected = () => {
    const targets = entries.filter((e) => selectedIds.has(e.id));
    if (targets.length === 0) {
      toast.error("Select at least one record");
      return;
    }
    setDeleteTargets(targets);
  };

  const confirmDelete = async () => {
    if (deleteTargets.length === 0) return;
    setDeleting(true);
    const ids = deleteTargets.map((t) => t.id);
    // Soft delete — moves to Trash, recoverable
    const { error } = await supabase
      .from("staff_entries")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", ids);
    setDeleting(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      deleteTargets.length === 1
        ? `Moved ${deleteTargets[0].full_name} to Trash`
        : `Moved ${deleteTargets.length} records to Trash`
    );
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    setDeleteTargets([]);
    fetchEntries();
    fetchTrash();
  };

  const confirmRestore = async () => {
    if (restoreTargets.length === 0) return;
    setTrashActionLoading(true);
    const ids = restoreTargets.map((t) => t.id);
    const { error } = await supabase
      .from("staff_entries")
      .update({ deleted_at: null })
      .in("id", ids);
    setTrashActionLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      restoreTargets.length === 1
        ? `Restored ${restoreTargets[0].full_name}`
        : `Restored ${restoreTargets.length} records`
    );
    setRestoreTargets([]);
    fetchEntries();
    fetchTrash();
  };

  const confirmPurge = async () => {
    if (purgeTargets.length === 0) return;
    setTrashActionLoading(true);
    const ids = purgeTargets.map((t) => t.id);
    const { error } = await supabase.from("staff_entries").delete().in("id", ids);
    setTrashActionLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      purgeTargets.length === 1
        ? `Permanently deleted ${purgeTargets[0].full_name}`
        : `Permanently deleted ${purgeTargets.length} records`
    );
    setPurgeTargets([]);
    fetchTrash();
  };

  // Duplicate detection: same normalized full_name + role + department + state.
  // Each group is sorted NEWEST → OLDEST so group[0] is the latest (kept) and the rest are deletion candidates.
  const duplicateGroups = useMemo(() => {
    const norm = (s: string | null | undefined) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
    const groups = new Map<string, StaffEntry[]>();
    entries.forEach((e) => {
      const key = `${norm(e.full_name)}|${norm(e.role)}|${norm(e.department)}|${norm(e.state)}`;
      if (!key.replace(/\|/g, "").trim()) return;
      const arr = groups.get(key) || [];
      arr.push(e);
      groups.set(key, arr);
    });
    return Array.from(groups.values())
      .filter((g) => g.length > 1)
      .map((g) => g.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
  }, [entries]);

  // Hard-protected set: the LATEST entry of every duplicate group can never be deleted
  // via bulk actions or accidental selection. Admins must use single-row "Delete" to
  // remove a latest record explicitly.
  const latestDuplicateIds = useMemo(() => {
    const s = new Set<string>();
    duplicateGroups.forEach((g) => g[0] && s.add(g[0].id));
    return s;
  }, [duplicateGroups]);

  // Auto-select all duplicates EXCEPT the latest in each group (keep newest, delete older copies)
  const autoSelectDuplicates = () => {
    const next = new Set<string>();
    duplicateGroups.forEach((group) => {
      // Skip index 0 (latest). Only older copies are pre-selected.
      group.slice(1).forEach((e) => next.add(e.id));
    });
    setSelectedIds(next);
    setShowDuplicates(true);
    if (next.size === 0) {
      toast.info("No duplicates found");
    } else {
      toast.success(`${next.size} older duplicate${next.size === 1 ? "" : "s"} pre-selected · latest of each group is protected`);
    }
  };

  // Generate-tab handlers (unchanged behavior)
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

      // Stamp downloaded_at if not already set
      if (!generatedCard.downloaded_at) {
        await supabase
          .from("staff_entries")
          .update({ downloaded_at: new Date().toISOString() })
          .eq("id", generatedCard.id);
        fetchEntries();
      }

      toast.success("PDF downloaded!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setDownloading(false);
    }
  };

  const activeFilterCount =
    (searchTerm ? 1 : 0) +
    (cityFilter !== "all" ? 1 : 0) +
    (roleDeptFilter !== "all" ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0) +
    (dateFrom || dateTo ? 1 : 0);

  const formatDateTime = (iso: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
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
        <Button
          variant={tab === "trash" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("trash")}
          className={tab === "trash" ? "bg-accent text-accent-foreground" : ""}
        >
          <Trash2 className="w-4 h-4 mr-1" /> Trash
          {trashedEntries.length > 0 && (
            <Badge variant="secondary" className="ml-2">{trashedEntries.length}</Badge>
          )}
        </Button>
      </div>

      {tab === "entries" ? (
        <>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="font-display text-2xl font-bold">Generated ID Cards</h1>
              <p className="text-sm text-muted-foreground">
                {loading
                  ? "Loading records…"
                  : `${filteredEntries.length} of ${entries.length} records${
                      selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""
                    }`}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={fetchEntries} disabled={loading}>
                <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={autoSelectDuplicates}
                disabled={loading}
                title="Find duplicate records and pre-select extras for deletion"
              >
                <Copy className="w-4 h-4 mr-1" />
                Find Duplicates
                {duplicateGroups.length > 0 && (
                  <Badge variant="destructive" className="ml-2 text-xs">
                    {duplicateGroups.reduce((n, g) => n + g.length - 1, 0)}
                  </Badge>
                )}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={selectedIds.size === 0 || deleting || bulkDownloading}
                onClick={requestDeleteSelected}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete ({selectedIds.size})
              </Button>
              <Button
                size="sm"
                disabled={selectedIds.size === 0 || bulkDownloading}
                onClick={handleBulkDownload}
                className="bg-accent text-accent-foreground hover:bg-accent/90"
              >
                {bulkDownloading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
                    {bulkStatus || `Preparing… ${bulkProgress}%`}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <PackageOpen className="w-4 h-4" />
                    Bulk Download ({selectedIds.size})
                  </span>
                )}
              </Button>
            </div>
          </div>

          {/* Live progress bar during bulk download */}
          {bulkDownloading && (
            <Card className="p-4 space-y-2 border-accent/40">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{bulkStatus}</span>
                <span className="text-muted-foreground">{bulkProgress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${bulkProgress}%` }}
                />
              </div>
            </Card>
          )}

          {/* Saved downloads — re-download without re-rendering */}
          {savedDownloads.length > 0 && (
            <Card className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Save className="w-4 h-4 text-accent" />
                Saved Downloads
                <Badge variant="secondary" className="text-xs">
                  {savedDownloads.length}
                </Badge>
                <span className="ml-auto text-xs text-muted-foreground font-normal">
                  Kept in this session — re-download instantly
                </span>
              </div>
              <div className="space-y-2">
                {savedDownloads.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm"
                  >
                    <PackageOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{s.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.count} card{s.count === 1 ? "" : "s"} · {s.sizeKb.toLocaleString()} KB ·{" "}
                        {new Date(s.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => redownloadSaved(s)}>
                      <Download className="w-4 h-4 mr-1" />
                      Download
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeSaved(s.id)}
                      title="Remove from saved list"
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Duplicates panel */}
          {showDuplicates && (
            <Card className="p-4 space-y-3 border-destructive/40">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Copy className="w-4 h-4 text-destructive" />
                Duplicate Records
                <Badge variant="destructive" className="text-xs">
                  {duplicateGroups.length} group{duplicateGroups.length === 1 ? "" : "s"}
                </Badge>
                <span className="ml-auto text-xs text-muted-foreground font-normal">
                  Latest of each group is kept · older copies pre-selected for deletion
                </span>
                <Button variant="ghost" size="sm" onClick={() => setShowDuplicates(false)} className="h-7">
                  <X className="w-3 h-3 mr-1" /> Hide
                </Button>
              </div>
              {duplicateGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground">No duplicates detected.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-auto">
                  {duplicateGroups.map((group, idx) => (
                    <div key={idx} className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
                      <div className="font-medium text-sm mb-1">
                        {group[0].full_name}
                        <span className="text-muted-foreground font-normal">
                          {" "}· {[group[0].role, group[0].department].filter(Boolean).join("-")}{" "}
                          {group[0].state ? `· ${group[0].state}` : ""}
                        </span>
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          {group.length} copies
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        {group.map((e, i) => {
                          const markedForDelete = selectedIds.has(e.id);
                          return (
                            <div
                              key={e.id}
                              className="flex items-center gap-2 flex-wrap rounded px-2 py-1 hover:bg-background/60"
                            >
                              <Badge
                                variant={i === 0 ? "secondary" : "destructive"}
                                className="text-[10px]"
                              >
                                {i === 0 ? "LATEST" : `OLDER #${i}`}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatDateTime(e.created_at)} · {e.company}
                              </span>
                              <div className="ml-auto flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant={markedForDelete ? "outline" : "ghost"}
                                  className="h-7 px-2 text-xs"
                                  onClick={() => {
                                    setSelectedIds((prev) => {
                                      const next = new Set(prev);
                                      next.delete(e.id);
                                      return next;
                                    });
                                    toast.success(`Keeping ${e.full_name} (${formatDateTime(e.created_at)})`);
                                  }}
                                  title="Keep this record (remove from delete selection)"
                                >
                                  Keep
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => requestDeleteOne(e)}
                                  title="Delete this record now"
                                >
                                  <Trash2 className="w-3 h-3 mr-1" />
                                  Delete now
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Filter bar */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Filter className="w-4 h-4 text-accent" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {activeFilterCount} active
                </Badge>
              )}
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="ml-auto h-7">
                  <X className="w-3 h-3 mr-1" /> Clear
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search name, role, city…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={cityFilter} onValueChange={setCityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="City / State" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">All Cities</SelectItem>
                  {cityOptions.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={roleDeptFilter} onValueChange={setRoleDeptFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Role - Department" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">All Roles</SelectItem>
                  {roleDeptOptions.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="generated">Generated (not downloaded)</SelectItem>
                  <SelectItem value="downloaded">Downloaded</SelectItem>
                  <SelectItem value="locked">Locked</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date range filter */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <Select
                value={dateField}
                onValueChange={(v: "created_at" | "downloaded_at") => setDateField(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at">Generated date</SelectItem>
                  <SelectItem value="downloaded_at">Downloaded date</SelectItem>
                </SelectContent>
              </Select>
              <div className="space-y-1">
                <Label htmlFor="date-from" className="text-xs text-muted-foreground">From</Label>
                <Input
                  id="date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="date-to" className="text-xs text-muted-foreground">To</Label>
                <Input
                  id="date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>
          </Card>

          <div className="rounded-lg border bg-card overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role - Department</TableHead>
                  <TableHead>City / State</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Generated</TableHead>
                  <TableHead>Downloaded</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      {loading ? "Filtering records…" : "No entries match the current filters"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEntries.map((entry) => {
                    const rd = [entry.role, entry.department].filter(Boolean).join("-");
                    return (
                      <TableRow
                        key={entry.id}
                        data-state={selectedIds.has(entry.id) ? "selected" : undefined}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(entry.id)}
                            onCheckedChange={() => toggleSelect(entry.id)}
                            aria-label={`Select ${entry.full_name}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{entry.full_name}</TableCell>
                        <TableCell>{rd || "—"}</TableCell>
                        <TableCell>{entry.state || "—"}</TableCell>
                        <TableCell>{entry.company}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {formatDateTime(entry.created_at)}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {formatDateTime(entry.downloaded_at)}
                        </TableCell>
                        <TableCell>
                          {entry.download_locked ? (
                            <Badge variant="destructive" className="text-xs">
                              Locked
                            </Badge>
                          ) : entry.download_count > 0 || entry.downloaded_at ? (
                            <Badge variant="secondary" className="text-xs">
                              Downloaded
                            </Badge>
                          ) : (
                            <Badge className="text-xs bg-accent text-accent-foreground">Generated</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(entry)}
                              title="Edit record"
                            >
                              <Pencil className="w-4 h-4 text-muted-foreground" />
                            </Button>
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
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => requestDeleteOne(entry)}
                              title="Delete record"
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Edit dialog */}
          <Dialog open={!!editEntry} onOpenChange={(open) => !open && setEditEntry(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Staff Record</DialogTitle>
                <DialogDescription>
                  Update name, role-department, and city. Changes apply only to this generated ID record.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1">
                  <Label htmlFor="edit-name">Full Name</Label>
                  <Input
                    id="edit-name"
                    value={editForm.full_name}
                    onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-roledept">Role - Department</Label>
                  <Input
                    id="edit-roledept"
                    placeholder="e.g. Technician-Field Operations"
                    value={editForm.roleDept}
                    onChange={(e) => setEditForm({ ...editForm, roleDept: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-state">City / State</Label>
                  <Input
                    id="edit-state"
                    placeholder="e.g. Lagos"
                    value={editForm.state}
                    onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditEntry(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={requestSaveEdit}
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Confirm save */}
          <AlertDialog open={confirmSaveOpen} onOpenChange={setConfirmSaveOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Save changes?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will update the record for{" "}
                  <strong>{editEntry?.full_name}</strong>. The change cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={savingEdit}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmSaveEdit} disabled={savingEdit}>
                  {savingEdit ? "Saving…" : "Confirm & Save"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Confirm delete */}
          <AlertDialog
            open={deleteTargets.length > 0}
            onOpenChange={(open) => !open && !deleting && setDeleteTargets([])}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Move {deleteTargets.length === 1 ? "this record" : `${deleteTargets.length} records`} to Trash?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {deleteTargets.length === 1 ? (
                    <>
                      The generated ID for <strong>{deleteTargets[0]?.full_name}</strong> will be moved to Trash. You can restore it later from the Trash tab.
                    </>
                  ) : (
                    <>
                      <strong>{deleteTargets.length}</strong> staff records will be moved to Trash. You can restore them later from the Trash tab.
                    </>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {deleteTargets.length > 1 && deleteTargets.length <= 20 && (
                <div className="max-h-40 overflow-auto text-xs text-muted-foreground border rounded-md p-2 bg-muted/30 space-y-1">
                  {deleteTargets.map((t) => (
                    <div key={t.id}>
                      • {t.full_name} — {[t.role, t.department].filter(Boolean).join("-")}{" "}
                      {t.state ? `· ${t.state}` : ""}
                    </div>
                  ))}
                </div>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting ? "Moving…" : "Move to Trash"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : tab === "generate" ? (
        /* Admin Generate ID */
        <div className="space-y-6 max-w-4xl">
          <h1 className="font-display text-2xl font-bold">Generate ID Card (Admin)</h1>

          {!generatedCard ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                        <p className="text-xs text-muted-foreground">
                          {s.role} {s.department ? `- ${s.department}` : ""}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </Card>

              <Card className="p-6 space-y-4">
                <h3 className="font-semibold">2. Configure & Generate</h3>

                {selectedStaff && (
                  <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
                    <p>
                      <strong>Name:</strong> {selectedStaff.full_name}
                    </p>
                    <p>
                      <strong>Role:</strong> {selectedStaff.role}
                    </p>
                    <p>
                      <strong>Department:</strong> {selectedStaff.department || "—"}
                    </p>
                    <p>
                      <strong>State:</strong> {selectedStaff.state || "—"}
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Company Template</Label>
                  <Select value={genCompany} onValueChange={(v: CompanyTemplate) => setGenCompany(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SOTI">SOTI</SelectItem>
                      <SelectItem value="OPAY">OPAY</SelectItem>
                      <SelectItem value="Blue Ridge">BLUE RIDGE</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Passport Photo</Label>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleGenPhoto}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => photoInputRef.current?.click()}
                  >
                    {genPhotoPreview ? "Change Photo" : "Upload Photo"}
                  </Button>
                  {genPhotoPreview && (
                    <div className="flex justify-center">
                      <img
                        src={genPhotoPreview}
                        alt="Preview"
                        className="w-24 h-24 rounded-lg object-cover"
                      />
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
                  ) : (
                    "Generate ID Card"
                  )}
                </Button>
              </Card>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row gap-6 justify-center items-center">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground text-center font-semibold uppercase">
                    Front
                  </p>
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
                  <p className="text-xs text-muted-foreground text-center font-semibold uppercase">
                    Back
                  </p>
                  <div className="shadow-elevated rounded-lg overflow-hidden" style={{ width: 350 }}>
                    <IDCardBack ref={backRef} company={generatedCard.company as CompanyTemplate} />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 justify-center">
                <Button
                  onClick={handleAdminDownload}
                  disabled={downloading}
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                >
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
                <Button
                  variant="outline"
                  onClick={() => {
                    setGeneratedCard(null);
                    setGenPhoto(null);
                    setGenPhotoPreview(null);
                    setSelectedStaff(null);
                  }}
                >
                  Generate Another
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Trash */
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="font-display text-2xl font-bold flex items-center gap-2">
                <Trash2 className="w-6 h-6" /> Trash
              </h1>
              <p className="text-sm text-muted-foreground">
                {trashLoading
                  ? "Loading…"
                  : `${trashedEntries.length} deleted record${trashedEntries.length === 1 ? "" : "s"} — restore or permanently delete`}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={fetchTrash} disabled={trashLoading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${trashLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          <Card className="p-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role-Department</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Deleted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trashedEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Trash is empty.
                    </TableCell>
                  </TableRow>
                ) : (
                  trashedEntries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.full_name}</TableCell>
                      <TableCell className="text-sm">
                        {[e.role, e.department].filter(Boolean).join("-")}
                      </TableCell>
                      <TableCell className="text-sm">{e.state || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {e.downloaded_at ? "" : ""}
                        {(e as any).deleted_at
                          ? new Date((e as any).deleted_at).toLocaleString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRestoreTargets([e])}
                          >
                            <RefreshCw className="w-3 h-3 mr-1" /> Restore
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setPurgeTargets([e])}
                          >
                            <Trash2 className="w-3 h-3 mr-1" /> Delete forever
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>

          {/* Restore confirmation */}
          <AlertDialog
            open={restoreTargets.length > 0}
            onOpenChange={(open) => !open && !trashActionLoading && setRestoreTargets([])}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Restore record?</AlertDialogTitle>
                <AlertDialogDescription>
                  {restoreTargets[0]?.full_name} will be restored to Generated IDs.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={trashActionLoading}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmRestore} disabled={trashActionLoading}>
                  {trashActionLoading ? "Restoring…" : "Restore"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Permanent purge */}
          <AlertDialog
            open={purgeTargets.length > 0}
            onOpenChange={(open) => !open && !trashActionLoading && setPurgeTargets([])}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Permanently delete?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete <strong>{purgeTargets[0]?.full_name}</strong>. This action
                  cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={trashActionLoading}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmPurge}
                  disabled={trashActionLoading}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {trashActionLoading ? "Deleting…" : "Delete forever"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
};

export default AdminEntries;
