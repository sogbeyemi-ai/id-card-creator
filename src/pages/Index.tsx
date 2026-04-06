import { useState, useRef } from "react";
import { toast } from "sonner";
import { Shield, Zap, Download } from "lucide-react";
import StaffForm, { StaffFormData } from "@/components/StaffForm";
import { IDCardFront, IDCardBack } from "@/components/IDCardPreview";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/**
 * Flexible name matching: normalizes both names, splits into words,
 * and checks that all words from one appear in the other (order-independent).
 */
/**
 * Flexible name matching: normalizes both names, removes punctuation,
 * splits into words, sorts alphabetically, and checks overlap.
 * Handles: order differences, commas, extra spaces, middle names optional.
 */
const namesMatch = (inputName: string, dbName: string): boolean => {
  const normalize = (n: string) =>
    n.toUpperCase().replace(/[^A-Z\s]/g, "").replace(/\s+/g, " ").trim();
  const inputWords = normalize(inputName).split(" ").filter(Boolean).sort();
  const dbWords = normalize(dbName).split(" ").filter(Boolean).sort();
  if (inputWords.length === 0 || dbWords.length === 0) return false;

  // Exact set match (order-independent)
  if (inputWords.length === dbWords.length && inputWords.every((w, i) => w === dbWords[i])) return true;

  // All input words found in db words (user may omit middle name)
  if (inputWords.every((w) => dbWords.includes(w))) return true;
  // All db words found in input words (db may have fewer words)
  if (dbWords.every((w) => inputWords.includes(w))) return true;

  // At least first + last name match (minimum 2 words overlap)
  const overlap = inputWords.filter((w) => dbWords.includes(w));
  if (overlap.length >= 2) return true;

  return false;
};

const Index = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [generatedCard, setGeneratedCard] = useState<{
    fullName: string;
    roleDepartment: string;
    state: string;
    company: StaffFormData["company"];
    photoUrl: string;
    id: string;
    downloadLocked: boolean;
  } | null>(null);

  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);

  const handleSubmit = async (data: StaffFormData) => {
    if (!data.photo) return;

    setIsSubmitting(true);
    setVerificationError(null);

    try {
      // Fetch all verified staff and do flexible name matching client-side
      const { data: allStaff, error: verifyError } = await supabase
        .from("verified_staff")
        .select("id, full_name, role");

      if (verifyError) throw verifyError;

      const matched = allStaff?.find((s) => namesMatch(data.fullName, s.full_name));

      if (!matched) {
        setVerificationError("You are not authorized to generate an ID. Your name does not match our records. Contact admin.");
        setIsSubmitting(false);
        return;
      }

      const fileExt = data.photo.name.split(".").pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("staff-photos")
        .upload(fileName, data.photo);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("staff-photos")
        .getPublicUrl(fileName);

      const { data: entry, error: insertError } = await supabase
        .from("staff_entries")
        .insert({
          full_name: data.fullName,
          role: data.roleDepartment.split("-")[0]?.trim() || data.roleDepartment,
          department: data.roleDepartment.split("-").slice(1).join("-")?.trim() || "",
          company: data.company,
          photo_url: urlData.publicUrl,
          state: data.state,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setGeneratedCard({
        fullName: entry.full_name,
        roleDepartment: data.roleDepartment,
        state: data.state || "",
        company: entry.company as StaffFormData["company"],
        photoUrl: entry.photo_url,
        id: entry.id,
        downloadLocked: false,
      });

      toast.success("ID Card generated successfully!");
    } catch (error: any) {
      toast.error("Failed to generate ID card: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!frontRef.current || !backRef.current || !generatedCard) return;

    if (generatedCard.downloadLocked) {
      toast.error("Download already completed. Contact admin.");
      return;
    }

    const { data: entry } = await supabase
      .from("staff_entries")
      .select("download_count, download_locked")
      .eq("id", generatedCard.id)
      .single();

    if (entry?.download_locked || (entry?.download_count && entry.download_count > 0)) {
      setGeneratedCard((prev) => prev ? { ...prev, downloadLocked: true } : prev);
      toast.error("Download already completed. Contact admin.");
      return;
    }

    setIsDownloading(true);
    try {
      const frontCanvas = await html2canvas(frontRef.current, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const backCanvas = await html2canvas(backRef.current, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [85.6, 130] });
      pdf.addImage(frontCanvas.toDataURL("image/png"), "PNG", 0, 0, 85.6, 130);
      pdf.addPage([85.6, 130], "portrait");
      pdf.addImage(backCanvas.toDataURL("image/png"), "PNG", 0, 0, 85.6, 130);

      const safeName = generatedCard.fullName.replace(/\s+/g, "_");
      pdf.save(`${safeName}_ID_Card.pdf`);

      await supabase.from("download_logs").insert({ staff_entry_id: generatedCard.id });
      await supabase
        .from("staff_entries")
        .update({ download_count: 1, download_locked: true })
        .eq("id", generatedCard.id);

      setGeneratedCard((prev) => prev ? { ...prev, downloadLocked: true } : prev);
      toast.success("PDF downloaded! This was your one-time download.");
    } catch (error: any) {
      toast.error("Failed to download PDF: " + error.message);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="gradient-hero py-12 px-6 text-center">
        <div className="max-w-2xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/20 text-accent-foreground text-xs font-medium mb-2">
            <Zap className="w-3 h-3" />
            Automated ID Generation
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-primary-foreground tracking-tight">
            Staff ID Card Generator
          </h1>
          <p className="text-primary-foreground/70 text-sm max-w-lg mx-auto">
            Enter your details, upload a photo, and get your company ID card instantly.
          </p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        {!generatedCard ? (
          <div className="max-w-lg mx-auto">
            <div className="bg-card rounded-xl shadow-card p-6 md:p-8 animate-fade-in">
              <h2 className="font-display text-xl font-semibold mb-6">Staff Information</h2>
              <StaffForm
                onSubmit={handleSubmit}
                isSubmitting={isSubmitting}
                verificationError={verificationError}
              />
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
            <div className="bg-card rounded-xl shadow-card p-6 md:p-8">
              <h2 className="font-display text-xl font-semibold mb-6 text-center">Your ID Card</h2>
              <div className="flex flex-col md:flex-row gap-6 justify-center items-center">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground text-center font-semibold uppercase">Front</p>
                  <div className="shadow-elevated rounded-lg overflow-hidden" style={{ width: 350 }}>
                    <IDCardFront
                      ref={frontRef}
                      fullName={generatedCard.fullName}
                      roleDepartment={generatedCard.roleDepartment}
                      state={generatedCard.state}
                      company={generatedCard.company}
                      photoUrl={generatedCard.photoUrl}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground text-center font-semibold uppercase">Back</p>
                  <div className="shadow-elevated rounded-lg overflow-hidden" style={{ width: 350 }}>
                    <IDCardBack ref={backRef} company={generatedCard.company} />
                  </div>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {generatedCard.downloadLocked ? (
                  <div className="bg-muted rounded-lg p-4 text-center">
                    <p className="font-medium text-sm text-muted-foreground">
                      Download already completed. Contact admin to re-enable.
                    </p>
                  </div>
                ) : (
                  <Button
                    onClick={handleDownloadPDF}
                    disabled={isDownloading}
                    className="w-full h-12 text-base font-semibold bg-accent text-accent-foreground hover:bg-accent/90"
                  >
                    {isDownloading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
                        Downloading…
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Download className="w-5 h-5" />
                        Download PDF (One-Time)
                      </span>
                    )}
                  </Button>
                )}
                <button
                  onClick={() => {
                    setGeneratedCard(null);
                    setVerificationError(null);
                  }}
                  className="w-full text-center text-sm text-accent hover:underline"
                >
                  Generate another ID card
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
