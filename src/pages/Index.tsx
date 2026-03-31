import { useState, useRef } from "react";
import { toast } from "sonner";
import { CreditCard, Shield, Zap, Download } from "lucide-react";
import StaffForm, { StaffFormData } from "@/components/StaffForm";
import IDCardPreview, { IDCardFront, IDCardBack } from "@/components/IDCardPreview";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

const Index = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [generatedCard, setGeneratedCard] = useState<{
    fullName: string;
    roleDepartment: string;
    state: string;
    company: StaffFormData["company"];
    photoUrl: string;
    id: string;
  } | null>(null);
  const [livePreview, setLivePreview] = useState<StaffFormData>({
    fullName: "",
    roleDepartment: "",
    state: "",
    company: "SOTI",
    photo: null,
    photoPreview: null,
  });

  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);

  const handleSubmit = async (data: StaffFormData) => {
    if (!data.photo) return;

    setIsSubmitting(true);
    try {
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
        company: entry.company,
        photoUrl: entry.photo_url,
        id: entry.id,
      });

      toast.success("ID Card generated successfully!");
    } catch (error: any) {
      toast.error("Failed to generate ID card: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!frontRef.current || !backRef.current) return;

    setIsDownloading(true);
    try {
      const frontCanvas = await html2canvas(frontRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const backCanvas = await html2canvas(backRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: [85.6, 130],
      });

      const frontImg = frontCanvas.toDataURL("image/png");
      pdf.addImage(frontImg, "PNG", 0, 0, 85.6, 130);

      pdf.addPage([85.6, 130], "portrait");
      const backImg = backCanvas.toDataURL("image/png");
      pdf.addImage(backImg, "PNG", 0, 0, 85.6, 130);

      const safeName = (generatedCard?.fullName || "ID_Card").replace(/\s+/g, "_");
      pdf.save(`${safeName}_ID_Card.pdf`);
      toast.success("PDF downloaded!");
    } catch (error: any) {
      toast.error("Failed to download PDF: " + error.message);
    } finally {
      setIsDownloading(false);
    }
  };

  const previewData = generatedCard || {
    fullName: livePreview.fullName,
    roleDepartment: livePreview.roleDepartment,
    state: livePreview.state,
    company: livePreview.company,
    photoUrl: livePreview.photoPreview,
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero header */}
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

      {/* Features bar */}
      <div className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-center gap-8 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5 text-accent" />
            3 Templates
          </span>
          <span className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-accent" />
            Secure Storage
          </span>
          <span className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-accent" />
            Instant Generation
          </span>
        </div>
      </div>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="grid lg:grid-cols-2 gap-10 items-start">
          {/* Form */}
          <div className="bg-card rounded-xl shadow-card p-6 md:p-8 animate-fade-in">
            <h2 className="font-display text-xl font-semibold mb-6">Staff Information</h2>
            <StaffForm
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              onChange={setLivePreview}
            />
          </div>

          {/* Preview */}
          <div className="space-y-6 animate-fade-in" style={{ animationDelay: "0.1s" }}>
            <div className="bg-card rounded-xl shadow-card p-6 md:p-8">
              <h2 className="font-display text-xl font-semibold mb-6">
                {generatedCard ? "Generated ID Card" : "Live Preview"}
              </h2>

              {/* Front & Back side by side on larger screens */}
              <div className="flex flex-col md:flex-row gap-6 justify-center items-center">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground text-center font-semibold uppercase">Front</p>
                  <div className="shadow-elevated rounded-lg overflow-hidden" style={{ width: 350 }}>
                    <IDCardFront
                      ref={frontRef}
                      fullName={previewData.fullName}
                      roleDepartment={previewData.roleDepartment}
                      state={previewData.state}
                      company={previewData.company}
                      photoUrl={previewData.photoUrl}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground text-center font-semibold uppercase">Back</p>
                  <div className="shadow-elevated rounded-lg overflow-hidden" style={{ width: 350 }}>
                    <IDCardBack
                      ref={backRef}
                      company={previewData.company}
                    />
                  </div>
                </div>
              </div>

              {/* Download & Reset */}
              {generatedCard && (
                <div className="mt-6 space-y-3">
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
                        Download PDF (Front & Back)
                      </span>
                    )}
                  </Button>
                  <button
                    onClick={() => {
                      setGeneratedCard(null);
                      setLivePreview({
                        fullName: "",
                        roleDepartment: "",
                        state: "",
                        company: "SOTI",
                        photo: null,
                        photoPreview: null,
                      });
                    }}
                    className="w-full text-center text-sm text-accent hover:underline"
                  >
                    Create another ID card
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
