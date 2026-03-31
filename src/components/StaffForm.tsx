import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, User, Briefcase, Image, MapPin } from "lucide-react";

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
  onChange?: (data: StaffFormData) => void;
}

const StaffForm = ({ onSubmit, isSubmitting, onChange }: StaffFormProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState<StaffFormData>({
    fullName: "",
    roleDepartment: "",
    state: "",
    company: "SOTI",
    photo: null,
    photoPreview: null,
  });
  const [stateError, setStateError] = useState<string | null>(null);

  useEffect(() => {
    onChange?.(formData);
  }, [formData, onChange]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData((prev) => ({
          ...prev,
          photo: file,
          photoPreview: reader.result as string,
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.photo) return;

    if (!formData.state || !NIGERIAN_STATES.includes(formData.state as any)) {
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
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handlePhotoChange}
          className="hidden"
        />
        <p className="text-xs text-muted-foreground">Passport-style photo recommended</p>
      </div>

      {/* Form fields */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fullName" className="flex items-center gap-2 text-sm font-medium">
            <User className="w-4 h-4 text-accent" />
            Full Name
          </Label>
          <Input
            id="fullName"
            placeholder="Enter full name"
            value={formData.fullName}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, fullName: e.target.value.toUpperCase() }))
            }
            required
            className="uppercase"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="roleDepartment" className="flex items-center gap-2 text-sm font-medium">
            <Briefcase className="w-4 h-4 text-accent" />
            Role - Department
          </Label>
          <Input
            id="roleDepartment"
            placeholder="e.g. BD-CARDLESS PAYMENT BUSINESS"
            value={formData.roleDepartment}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, roleDepartment: e.target.value.toUpperCase() }))
            }
            required
            className="uppercase"
          />
          <p className="text-xs text-muted-foreground">Format: ROLE-DEPARTMENT (e.g. BD-OFFLINE OPERATION)</p>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <Upload className="w-4 h-4 text-accent" />
            Company
          </Label>
          <Select
            value={formData.company}
            onValueChange={(value: CompanyTemplate) =>
              setFormData((prev) => ({ ...prev, company: value }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select company" />
            </SelectTrigger>
            <SelectContent>
              {COMPANIES.map((company) => (
                <SelectItem key={company} value={company}>
                  {company.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <MapPin className="w-4 h-4 text-accent" />
            State
          </Label>
          <Select
            value={formData.state}
            onValueChange={(value) => {
              setFormData((prev) => ({ ...prev, state: value }));
              setStateError(null);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select state" />
            </SelectTrigger>
            <SelectContent>
              {NIGERIAN_STATES.map((state) => (
                <SelectItem key={state} value={state}>
                  {state}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {stateError && (
            <p className="text-sm text-destructive font-medium">{stateError}</p>
          )}
        </div>
      </div>

      <Button
        type="submit"
        disabled={
          isSubmitting ||
          !formData.photo ||
          !formData.fullName ||
          !formData.roleDepartment ||
          !formData.state
        }
        className="w-full h-12 text-base font-display font-semibold bg-accent text-accent-foreground hover:bg-accent/90 transition-all"
      >
        {isSubmitting ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
            Generating ID Card...
          </span>
        ) : (
          "Generate ID Card"
        )}
      </Button>
    </form>
  );
};

export default StaffForm;
