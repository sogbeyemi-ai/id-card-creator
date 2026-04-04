import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, User, Briefcase, Image, MapPin, Camera, X, SwitchCamera } from "lucide-react";
import Webcam from "react-webcam";

export type CompanyTemplate = "SOTI" | "OPAY" | "Blue Ridge";

const NIGERIAN_STATES = [
  "ABIA", "ADAMAWA", "AKWA IBOM", "ANAMBRA", "BAUCHI", "BAYELSA", "BENUE", "BORNO",
  "CROSS RIVER", "DELTA", "EBONYI", "EDO", "EKITI", "ENUGU", "FCT (ABUJA)",
  "GOMBE", "IMO", "JIGAWA", "KADUNA", "KANO", "KATSINA", "KEBBI", "KOGI",
  "KWARA", "LAGOS", "NASARAWA", "NIGER", "OGUN", "ONDO", "OSUN", "OYO",
  "PLATEAU", "RIVERS", "SOKOTO", "TARABA", "YOBE", "ZAMFARA"
] as const;

const COMPANIES: CompanyTemplate[] = ["SOTI", "OPAY", "Blue Ridge"];

export interface StaffFormData {
  fullName: string;
  roleDepartment: string;
  state: string;
  company: CompanyTemplate;
  photo: File | null;
  photoPreview: string | null;
}

interface StaffFormProps {
  onSubmit: (data: StaffFormData) => void;
  isSubmitting: boolean;
  verificationError?: string | null;
}

const StaffForm = ({ onSubmit, isSubmitting, verificationError }: StaffFormProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const webcamRef = useRef<Webcam>(null);
  const [formData, setFormData] = useState<StaffFormData>({
    fullName: "",
    roleDepartment: "",
    state: "",
    company: "SOTI",
    photo: null,
    photoPreview: null,
  });
  const [stateError, setStateError] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setFormError("Photo must be less than 5MB");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData((prev) => ({
          ...prev,
          photo: file,
          photoPreview: reader.result as string,
        }));
        setFormError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCameraCapture = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot({ width: 640, height: 640 });
    if (imageSrc) {
      fetch(imageSrc)
        .then((res) => res.blob())
        .then((blob) => {
          const file = new File([blob], "camera-photo.jpg", { type: "image/jpeg" });
          setFormData((prev) => ({
            ...prev,
            photo: file,
            photoPreview: imageSrc,
          }));
          setShowCamera(false);
          setCameraError(null);
          setFormError(null);
        });
    }
  }, []);

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.fullName.trim()) {
      setFormError("Please enter your full name");
      return;
    }
    if (!formData.roleDepartment.trim()) {
      setFormError("Please enter your role and department");
      return;
    }
    if (!formData.state) {
      setFormError("Please select your state");
      return;
    }
    if (!formData.photo) {
      setFormError("Please upload or capture a passport photo");
      return;
    }
    if (!NIGERIAN_STATES.includes(formData.state as any)) {
      setStateError("Invalid state selection. Only Nigerian states are allowed.");
      return;
    }

    setStateError(null);
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Photo upload */}
      <div className="flex flex-col items-center gap-4">
        {showCamera ? (
          <div className="space-y-3 w-full">
            <Webcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              screenshotQuality={0.92}
              videoConstraints={{ facingMode, width: 640, height: 640 }}
              className="rounded-lg mx-auto"
              style={{ width: 200, height: 200 }}
              onUserMediaError={() => setCameraError("Unable to access camera. Please check permissions or use file upload.")}
            />
            {cameraError && (
              <p className="text-sm text-destructive text-center font-medium">{cameraError}</p>
            )}
            <div className="flex gap-2 justify-center">
              <Button type="button" size="sm" onClick={handleCameraCapture} className="bg-accent text-accent-foreground">
                <Camera className="w-4 h-4 mr-1" /> Capture
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={toggleCamera}>
                <SwitchCamera className="w-4 h-4 mr-1" /> Flip
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => { setShowCamera(false); setCameraError(null); }}>
                <X className="w-4 h-4 mr-1" /> Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative w-32 h-32 rounded-full border-2 border-dashed border-muted-foreground/30 hover:border-accent transition-colors flex items-center justify-center overflow-hidden group"
            >
              {formData.photoPreview ? (
                <img src={formData.photoPreview} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-1 text-muted-foreground group-hover:text-accent transition-colors">
                  <Image className="w-8 h-8" />
                  <span className="text-xs">Upload Photo</span>
                </div>
              )}
            </button>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-3 h-3 mr-1" /> Upload
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => { setShowCamera(true); setCameraError(null); }}>
                <Camera className="w-3 h-3 mr-1" /> Camera
              </Button>
            </div>
          </>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
        <p className="text-xs text-muted-foreground">Passport-style photo recommended (max 5MB)</p>
      </div>

      {/* Verification error */}
      {verificationError && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive font-medium text-center">
          {verificationError}
        </div>
      )}

      {/* Form-level error */}
      {formError && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive font-medium text-center">
          {formError}
        </div>
      )}

      {/* Form fields */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fullName" className="flex items-center gap-2 text-sm font-medium">
            <User className="w-4 h-4 text-accent" />
            Full Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="fullName"
            placeholder="Enter full name"
            value={formData.fullName}
            onChange={(e) => { setFormData((prev) => ({ ...prev, fullName: e.target.value.toUpperCase() })); setFormError(null); }}
            required
            className="uppercase"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="roleDepartment" className="flex items-center gap-2 text-sm font-medium">
            <Briefcase className="w-4 h-4 text-accent" />
            Role - Department <span className="text-destructive">*</span>
          </Label>
          <Input
            id="roleDepartment"
            placeholder="e.g. BD-CARDLESS PAYMENT BUSINESS"
            value={formData.roleDepartment}
            onChange={(e) => { setFormData((prev) => ({ ...prev, roleDepartment: e.target.value.toUpperCase() })); setFormError(null); }}
            required
            className="uppercase"
          />
          <p className="text-xs text-muted-foreground">Format: ROLE-DEPARTMENT (e.g. BD-OFFLINE OPERATION)</p>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <Upload className="w-4 h-4 text-accent" />
            Company <span className="text-destructive">*</span>
          </Label>
          <Select
            value={formData.company}
            onValueChange={(value: CompanyTemplate) => setFormData((prev) => ({ ...prev, company: value }))}
          >
            <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
            <SelectContent>
              {COMPANIES.map((company) => (
                <SelectItem key={company} value={company}>{company.toUpperCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <MapPin className="w-4 h-4 text-accent" />
            State <span className="text-destructive">*</span>
          </Label>
          <Select
            value={formData.state}
            onValueChange={(value) => {
              setFormData((prev) => ({ ...prev, state: value }));
              setStateError(null);
              setFormError(null);
            }}
          >
            <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
            <SelectContent>
              {NIGERIAN_STATES.map((state) => (
                <SelectItem key={state} value={state}>{state}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {stateError && <p className="text-sm text-destructive font-medium">{stateError}</p>}
        </div>
      </div>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full h-12 text-base font-display font-semibold bg-accent text-accent-foreground hover:bg-accent/90 transition-all"
      >
        {isSubmitting ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
            Verifying & Generating…
          </span>
        ) : (
          "Generate ID Card"
        )}
      </Button>
    </form>
  );
};

export default StaffForm;
