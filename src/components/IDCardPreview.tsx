import { CompanyTemplate } from "./StaffForm";
import logoSoti from "@/assets/logo-soti.png";
import logoOpay from "@/assets/logo-opay.png";
import logoBlueridge from "@/assets/logo-blueridge.png";
import logoProten from "@/assets/logo-proten.png";

interface IDCardPreviewProps {
  fullName: string;
  role: string;
  department: string;
  company: CompanyTemplate;
  photoUrl: string | null;
  id?: string;
}

const templateStyles: Record<CompanyTemplate, {
  logo: string;
  nameColor: string;
  departmentColor: string;
  roleColor: string;
  footerBg: string;
  footerText: string;
  photoShape: "rectangular" | "circular";
  photoBorderColor?: string;
}> = {
  SOTI: {
    logo: logoSoti,
    nameColor: "text-[hsl(170,60%,35%)]",
    departmentColor: "text-[hsl(170,60%,35%)]",
    roleColor: "text-[hsl(220,15%,30%)]",
    footerBg: "bg-[hsl(220,60%,15%)]",
    footerText: "text-white",
    photoShape: "rectangular",
  },
  OPAY: {
    logo: logoOpay,
    nameColor: "text-[hsl(160,70%,35%)]",
    departmentColor: "text-[hsl(160,70%,35%)]",
    roleColor: "text-[hsl(220,15%,25%)]",
    footerBg: "bg-[hsl(168,55%,48%)]",
    footerText: "text-white",
    photoShape: "rectangular",
  },
  "Blue Ridge": {
    logo: logoBlueridge,
    nameColor: "text-[hsl(225,100%,50%)]",
    departmentColor: "text-[hsl(220,15%,25%)]",
    roleColor: "text-[hsl(220,10%,40%)]",
    footerBg: "bg-[hsl(225,100%,50%)]",
    footerText: "text-white",
    photoShape: "circular",
    photoBorderColor: "border-[hsl(200,60%,75%)]",
  },
};

const IDCardPreview = ({ fullName, role, department, company, photoUrl }: IDCardPreviewProps) => {
  const style = templateStyles[company];

  return (
    <div className="relative w-full max-w-[320px] bg-white rounded-lg overflow-hidden shadow-elevated animate-scale-in flex flex-col" style={{ aspectRatio: "2/3.2" }}>
      {/* Company Logo */}
      <div className="flex justify-center pt-6 pb-4 px-6">
        <img
          src={style.logo}
          alt={company}
          className="h-14 w-auto object-contain"
        />
      </div>

      {/* Photo */}
      <div className="flex justify-center px-6 py-3 flex-1">
        {style.photoShape === "circular" ? (
          <div className={`w-36 h-36 rounded-full overflow-hidden border-2 ${style.photoBorderColor || "border-gray-200"} flex-shrink-0 bg-gray-100`}>
            {photoUrl ? (
              <img src={photoUrl} alt={fullName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
                Photo
              </div>
            )}
          </div>
        ) : (
          <div className="w-36 h-44 overflow-hidden flex-shrink-0 bg-gray-100">
            {photoUrl ? (
              <img src={photoUrl} alt={fullName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
                Photo
              </div>
            )}
          </div>
        )}
      </div>

      {/* Staff Details */}
      <div className="text-center px-5 py-3 space-y-0.5">
        <p className={`font-display font-bold text-base uppercase tracking-wide ${style.nameColor}`}>
          {fullName || "Full Name"}
        </p>
        <p className={`text-xs font-medium uppercase ${style.roleColor}`}>
          {role || "Role"}
        </p>
        <p className={`text-xs font-semibold uppercase ${style.departmentColor}`}>
          {department || "Department"}
        </p>
      </div>

      {/* Footer Bar */}
      <div className={`mt-auto ${style.footerBg} px-4 py-2.5 flex items-center justify-between`}>
        <span className={`text-[9px] font-medium italic ${style.footerText}`}>
          Authorised Signature
        </span>
        <div className="w-16 h-6 bg-white rounded-sm" />
        <img
          src={logoProten}
          alt="Proten"
          className="h-6 w-auto object-contain"
          loading="lazy"
        />
      </div>
    </div>
  );
};

export default IDCardPreview;
