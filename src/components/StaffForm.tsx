import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, User, Briefcase, Image, MapPin, Camera, X, SwitchCamera, CheckCircle2, Loader2 } from "lucide-react";
import Webcam from "react-webcam";
import { useStaffNameLookup } from "@/hooks/useStaffNameLookup";

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
  const [autoFilled, setAutoFilled] = useState(false);
  const [departmentMissing, setDepartmentMissing] = useState(false);
  const [roleDeptManuallyEdited, setRoleDeptManuallyEdited] = useState(false);
  const [chosenStaffId, setChosenStaffId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const lookup = useStaffNameLookup(formData.fullName);

  // Resolve the effective record: if user picked one from the disambiguation
  // list, prefer that; otherwise use the auto-detected best match.
  const effectiveMatch =
    (chosenStaffId && lookup.candidates.find((c) => c.record.id === chosenStaffId)?.record) ||
    lookup.match;

  // Auto-fill role-department when a verified record is found.
  // For ambiguous matches we still pre-fill from the best candidate but flag
  // it as low confidence so the user can confirm or pick the correct staff.
  useEffect(() => {
    if (lookup.status === "idle" || lookup.status === "not_found") {
      setAutoFilled(false);
      setDepartmentMissing(false);
      setShowPicker(false);
      return;
    }
    if (lookup.status === "searching") return;
    if (!effectiveMatch) return;
    if (roleDeptManuallyEdited) return;

    const role = (effectiveMatch.role || "").trim().toUpperCase();
    const dept = (effectiveMatch.department || "").trim().toUpperCase();

    if (role && dept) {
      setFormData((prev) =>
        prev.roleDepartment === `${role}-${dept}` ? prev : { ...prev, roleDepartment: `${role}-${dept}` }
      );
      setAutoFilled(true);
      setDepartmentMissing(false);
    } else if (role && !dept) {
      setFormData((prev) =>
        prev.roleDepartment === `${role}-` ? prev : { ...prev, roleDepartment: `${role}-` }
      );
      setAutoFilled(true);
      setDepartmentMissing(true);
    } else if (dept && !role) {
      setFormData((prev) =>
        prev.roleDepartment === `-${dept}` ? prev : { ...prev, roleDepartment: `-${dept}` }
      );
      setAutoFilled(true);
      setDepartmentMissing(false);
    } else {
      setAutoFilled(false);
      setDepartmentMissing(false);
    }
    setFormError(null);
  }, [lookup.status, effectiveMatch, roleDeptManuallyEdited]);

  // Lock editing only when confidence is high/exact AND no ambiguity.
  const isAmbiguous = lookup.status === "ambiguous";
  const isHighConfidence =
    lookup.confidence === "exact" || (lookup.confidence === "high" && !isAmbiguous);
  const lockRoleDept = autoFilled && !departmentMissing && isHighConfidence && !roleDeptManuallyEdited;

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
      // Flip the image horizontally to undo the mirror effect
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0);
        const correctedSrc = canvas.toDataURL("image/jpeg", 0.92);
        fetch(correctedSrc)
          .then((res) => res.blob())
          .then((blob) => {
            const file = new File([blob], "camera-photo.jpg", { type: "image/jpeg" });
            setFormData((prev) => ({
              ...prev,
              photo: file,
              photoPreview: correctedSrc,
            }));
            setShowCamera(false);
            setCameraError(null);
            setFormError(null);
          });
      };
      img.src = imageSrc;
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
    const rd = formData.roleDepartment.trim();
    if (!rd) {
      setFormError("Please enter your role and department");
      return;
    }
    // If auto-filled with missing department, ensure user appended a department after the dash
    const parts = rd.split("-").map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) {
      setFormError("Please enter your department after the role (format: ROLE-DEPARTMENT)");
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
            {lookup.status === "searching" && (
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground font-normal">
                <Loader2 className="w-3 h-3 animate-spin" /> Verifying records…
              </span>
            )}
            {lookup.status === "found" && lookup.confidence === "exact" && (
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-accent font-medium">
                <CheckCircle2 className="w-3 h-3" /> Verified · Exact match
              </span>
            )}
            {lookup.status === "found" && lookup.confidence === "high" && (
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-accent font-medium">
                <CheckCircle2 className="w-3 h-3" /> Verified · High confidence
              </span>
            )}
            {lookup.status === "ambiguous" && (
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
                ⚠ Possible matches — please confirm
              </span>
            )}
          </Label>
          <Input
            id="fullName"
            placeholder="Enter full name"
            value={formData.fullName}
            onChange={(e) => {
              setFormData((prev) => ({ ...prev, fullName: e.target.value.toUpperCase() }));
              setFormError(null);
              setRoleDeptManuallyEdited(false);
              setChosenStaffId(null);
              setShowPicker(false);
            }}
            required
            className="uppercase"
          />
          {lookup.status === "not_found" && formData.fullName.trim().split(/\s+/).filter(Boolean).length >= 2 && (
            <p className="text-xs text-destructive">No matching record found. Check spelling or contact admin.</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="roleDepartment" className="flex items-center gap-2 text-sm font-medium">
            <Briefcase className="w-4 h-4 text-accent" />
            Role - Department <span className="text-destructive">*</span>
            {autoFilled && !departmentMissing && lookup.confidence === "exact" && (
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-accent font-medium">
                <CheckCircle2 className="w-3 h-3" /> Auto-filled · Exact
              </span>
            )}
            {autoFilled && !departmentMissing && lookup.confidence === "high" && !isAmbiguous && (
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-accent font-medium">
                <CheckCircle2 className="w-3 h-3" /> Auto-filled · High confidence
              </span>
            )}
            {isAmbiguous && (
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
                ⚠ Low confidence — please confirm
              </span>
            )}
          </Label>
          <Input
            id="roleDepartment"
            placeholder="e.g. BD-CARDLESS PAYMENT BUSINESS"
            value={formData.roleDepartment}
            onChange={(e) => {
              if (lockRoleDept) return;
              setFormData((prev) => ({ ...prev, roleDepartment: e.target.value.toUpperCase() }));
              setFormError(null);
              setRoleDeptManuallyEdited(true);
            }}
            required
            readOnly={lockRoleDept}
            aria-readonly={lockRoleDept}
            tabIndex={lockRoleDept ? -1 : 0}
            className={`uppercase ${lockRoleDept ? "bg-muted cursor-not-allowed text-muted-foreground" : ""}`}
          />
          {lockRoleDept ? (
            <p className="text-xs text-muted-foreground">
              Auto-filled from verified records. This field is locked. Contact admin if incorrect.
            </p>
          ) : departmentMissing ? (
            <p className="text-xs text-accent font-medium">
              Please enter your department after the role (format: ROLE-DEPARTMENT)
            </p>
          ) : isAmbiguous ? (
            <p className="text-xs text-amber-600">
              We found more than one possible match for this name. Please confirm the correct staff record below.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Format: ROLE-DEPARTMENT (e.g. BD-OFFLINE OPERATION)</p>
          )}

          {/* Disambiguation picker */}
          {isAmbiguous && lookup.candidates.length > 0 && (
            <div className="mt-2 rounded-lg border border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Confirm correct staff record
                </p>
                <button
                  type="button"
                  onClick={() => setShowPicker((s) => !s)}
                  className="text-xs text-accent hover:underline"
                >
                  {showPicker ? "Hide options" : `Show ${lookup.candidates.length} possible match${lookup.candidates.length > 1 ? "es" : ""}`}
                </button>
              </div>
              {showPicker && (
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {lookup.candidates.map((c) => {
                    const isChosen = chosenStaffId === c.record.id ||
                      (!chosenStaffId && lookup.match?.id === c.record.id);
                    return (
                      <button
                        key={c.record.id}
                        type="button"
                        onClick={() => {
                          setChosenStaffId(c.record.id);
                          setRoleDeptManuallyEdited(false);
                          setShowPicker(false);
                        }}
                        className={`w-full text-left rounded-md border p-2 text-xs transition-colors ${
                          isChosen
                            ? "border-accent bg-accent/10"
                            : "border-border bg-background hover:border-accent/50"
                        }`}
                      >
                        <div className="font-semibold uppercase">{c.record.full_name}</div>
                        <div className="text-muted-foreground">
                          {(c.record.role || "—").toUpperCase()} · {(c.record.department || "—").toUpperCase()}
                        </div>
                      </button>
                    );
                  })}
                  <p className="text-[11px] text-muted-foreground pt-1">
                    None of these is you? Edit the role-department field manually or contact admin.
                  </p>
                </div>
              )}
            </div>
          )}
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
