import { forwardRef } from "react";
import { CompanyTemplate } from "./StaffForm";
import logoSoti from "@/assets/logo-soti.png";
import logoOpay from "@/assets/logo-opay.png";
import logoBlueridge from "@/assets/logo-blueridge.png";
import logoProten from "@/assets/logo-proten.png";

interface IDCardPreviewProps {
  fullName: string;
  roleDepartment: string;
  state: string;
  company: CompanyTemplate;
  photoUrl: string | null;
  id?: string;
  side?: "front" | "back";
}

const templateStyles: Record<CompanyTemplate, {
  logo: string;
  nameColor: string;
  stateColor: string;
  roleColor: string;
  footerBg: string;
  footerText: string;
  photoShape: "rectangular" | "circular";
  photoBorderColor?: string;
  footerLogoLeft?: string;
}> = {
  SOTI: {
    logo: logoOpay,
    nameColor: "#1a8c7a",
    stateColor: "#1a8c7a",
    roleColor: "#2d3748",
    footerBg: "#2cc4ad",
    footerText: "#ffffff",
    photoShape: "rectangular",
    footerLogoLeft: logoSoti,
  },
  OPAY: {
    logo: logoOpay,
    nameColor: "#1a8c7a",
    stateColor: "#1a8c7a",
    roleColor: "#2d3748",
    footerBg: "#2cc4ad",
    footerText: "#ffffff",
    photoShape: "rectangular",
  },
  "Blue Ridge": {
    logo: logoBlueridge,
    nameColor: "#1a3fc7",
    stateColor: "#2d3748",
    roleColor: "#4a5568",
    footerBg: "#1a3fc7",
    footerText: "#ffffff",
    photoShape: "circular",
    photoBorderColor: "#a8c8e8",
  },
};

const backLogos: Record<CompanyTemplate, string> = {
  SOTI: logoSoti,
  OPAY: logoOpay,
  "Blue Ridge": logoBlueridge,
};

const IDCardFront = forwardRef<HTMLDivElement, IDCardPreviewProps>(
  ({ fullName, roleDepartment, state, company, photoUrl }, ref) => {
    const style = templateStyles[company];

    return (
      <div
        ref={ref}
        className="relative bg-white overflow-hidden flex flex-col"
        style={{ width: 350, height: 530, fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif" }}
      >
        {/* Company Logo */}
        <div className="flex justify-center pt-5 pb-3 px-6">
          <img src={style.logo} alt={company} className="h-14 w-auto object-contain" />
        </div>

        {/* Photo */}
        <div className="flex justify-center px-6 py-2 flex-1 items-center">
          {style.photoShape === "circular" ? (
            <div
              className="rounded-full overflow-hidden flex-shrink-0 bg-gray-100"
              style={{
                width: 170, height: 170,
                border: `3px solid ${style.photoBorderColor || "#ccc"}`,
              }}
            >
              {photoUrl ? (
                <img src={photoUrl} alt={fullName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">Photo</div>
              )}
            </div>
          ) : (
            <div className="overflow-hidden flex-shrink-0 bg-gray-100" style={{ width: 160, height: 190 }}>
              {photoUrl ? (
                <img src={photoUrl} alt={fullName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">Photo</div>
              )}
            </div>
          )}
        </div>

        {/* Staff Details */}
        <div className="text-center px-5 py-2 space-y-1">
          <p
            className="font-bold text-base uppercase tracking-wide"
            style={{ color: style.nameColor }}
          >
            {fullName || "FULL NAME"}
          </p>
          <p
            className="text-xs font-medium uppercase tracking-wide"
            style={{ color: style.roleColor }}
          >
            {roleDepartment || "ROLE-DEPARTMENT"}
          </p>
          <p
            className="text-sm font-bold uppercase tracking-wide"
            style={{ color: style.stateColor }}
          >
            {state || "STATE"}
          </p>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Footer Bar */}
        <div
          className="px-4 py-2.5 flex items-center justify-between"
          style={{ backgroundColor: style.footerBg }}
        >
          {style.footerLogoLeft ? (
            <img src={style.footerLogoLeft} alt="Company" className="h-7 w-auto object-contain" style={{ filter: "brightness(0) invert(1)" }} />
          ) : (
            <span className="text-[9px] font-medium italic" style={{ color: style.footerText }}>
              Authorised Signature
            </span>
          )}
          <div className="w-16 h-7 bg-white rounded-sm" />
          <img src={logoProten} alt="Proten" className="h-6 w-auto object-contain" loading="lazy" />
        </div>
        {style.footerLogoLeft && (
          <div className="text-center py-0.5">
            <span className="text-[8px] font-medium italic" style={{ color: style.nameColor }}>
              Authorised Signature
            </span>
          </div>
        )}
      </div>
    );
  }
);
IDCardFront.displayName = "IDCardFront";

const IDCardBack = forwardRef<HTMLDivElement, { company: CompanyTemplate }>(
  ({ company }, ref) => {
    const companyLogo = backLogos[company];

    return (
      <div
        ref={ref}
        className="relative bg-white overflow-hidden flex flex-col"
        style={{ width: 350, height: 530, fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif" }}
      >
        {/* Logos */}
        <div className="flex items-center justify-center gap-4 pt-6 pb-4 px-8">
          <img src={companyLogo} alt={company} className="h-12 w-auto object-contain" />
          <div className="w-px h-10 bg-gray-300" />
          <img src={logoProten} alt="Proten" className="h-10 w-auto object-contain" />
        </div>

        {/* Body text */}
        <div className="flex-1 flex items-center justify-center px-10">
          <div className="text-center space-y-6">
            <p className="text-lg font-medium text-gray-800 leading-relaxed">
              This card remains<br />
              the property of<br />
              Proten International
            </p>
            <p className="text-lg font-medium text-gray-800 leading-relaxed">
              In case of loss, the finder<br />
              should kindly return it to
            </p>
            <p className="text-lg font-medium text-gray-800 leading-relaxed">
              6 Rosenje St, Soluyi,<br />
              Gbagada, Lagos.
            </p>
          </div>
        </div>
      </div>
    );
  }
);
IDCardBack.displayName = "IDCardBack";

const IDCardPreview = forwardRef<HTMLDivElement, IDCardPreviewProps>(
  (props, ref) => {
    const { side = "front", ...rest } = props;
    if (side === "back") {
      return <IDCardBack ref={ref} company={rest.company} />;
    }
    return <IDCardFront ref={ref} {...rest} />;
  }
);
IDCardPreview.displayName = "IDCardPreview";

export default IDCardPreview;
export { IDCardFront, IDCardBack };
