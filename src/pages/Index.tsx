import { useState } from "react";
import { toast } from "sonner";
import { CreditCard, Shield, Zap } from "lucide-react";
import StaffForm, { StaffFormData } from "@/components/StaffForm";
import IDCardPreview from "@/components/IDCardPreview";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedCard, setGeneratedCard] = useState<{
    fullName: string;
    role: string;
    department: string;
    company: StaffFormData["company"];
    photoUrl: string;
    id: string;
  } | null>(null);
  const [livePreview, setLivePreview] = useState<StaffFormData>({
    fullName: "",
    role: "",
    department: "",
    company: "SOTI",
    photo: null,
    photoPreview: null,
  });

  const handleSubmit = async (data: StaffFormData) => {
    if (!data.photo) return;

    setIsSubmitting(true);
    try {
      // Upload photo
      const fileExt = data.photo.name.split(".").pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("staff-photos")
        .upload(fileName, data.photo);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("staff-photos")
        .getPublicUrl(fileName);

      // Insert staff entry
      const { data: entry, error: insertError } = await supabase
        .from("staff_entries")
        .insert({
          full_name: data.fullName,
          role: data.role,
          department: data.department,
          company: data.company,
          photo_url: urlData.publicUrl,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setGeneratedCard({
        fullName: entry.full_name,
        role: entry.role,
        department: entry.department,
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
      <main className="max-w-5xl mx-auto px-6 py-10">
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
              <div className="flex justify-center">
                {generatedCard ? (
                  <IDCardPreview
                    fullName={generatedCard.fullName}
                    role={generatedCard.role}
                    department={generatedCard.department}
                    company={generatedCard.company}
                    photoUrl={generatedCard.photoUrl}
                    id={generatedCard.id}
                  />
                ) : (
                  <IDCardPreview
                    fullName={livePreview.fullName}
                    role={livePreview.role}
                    department={livePreview.department}
                    company={livePreview.company}
                    photoUrl={livePreview.photoPreview}
                  />
                )}
              </div>
              {generatedCard && (
                <button
                  onClick={() => {
                    setGeneratedCard(null);
                    setLivePreview({
                      fullName: "",
                      role: "",
                      department: "",
                      company: "SOTI",
                      photo: null,
                      photoPreview: null,
                    });
                  }}
                  className="mt-4 w-full text-center text-sm text-accent hover:underline"
                >
                  Create another ID card
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
