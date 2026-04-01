import { forwardRef } from "react";
import { CompanyTemplate } from "./StaffForm";
import logoSoti from "@/assets/logo-soti.png";
import logoOpay from "@/assets/logo-opay.png";
import logoBlueridge from "@/assets/logo-blueridge.png";
import logoProten from "@/assets/logo-proten.png";
import signatureImg from "@/assets/signature.jpg";

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
  authSignatureColor: string;
  photoShape: "rectangular" | "circular";
  photoBorderColor?: string;
}> = {
  SOTI: {
    logo: logoSoti,
    nameColor: "#1a8c7a",
    stateColor: "#1a8c7a",
    roleColor: "#2d3748",
    footerBg: "#1e2a3a",
    authSignatureColor: "#2cc4ad",
    photoShape: "rectangular",
  },
  OPAY: {
    logo: logoOpay,
    nameColor: "#1a8c7a",
    stateColor: "#1a8c7a",
    roleColor: "#2d3748",
    footerBg: "#1e2a3a",
    authSignatureColor: "#2cc4ad",
    photoShape: "rectangular",
  },
  "Blue Ridge": {
    logo: logoBlueridge,
    nameColor: "#0033cc",
    stateColor: "#1a1a1a",
    roleColor: "#4a5568",
    footerBg: "#0033cc",
    authSignatureColor: "#ffffff",
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
        <div className="flex justify-center pt-5 pb-2 px-6">
          <img
            src={style.logo}
            alt={company}
            className="h-16 w-auto object-contain"
            style={{ imageRendering: "auto" }}
          />
        </div>

        {/* Photo */}
        <div className="flex justify-center px-6 py-2 flex-1 items-center">
          {style.photoShape === "circular" ? (
            <div
              className="rounded-full overflow-hidden flex-shrink-0 bg-gray-100"
              style={{
                width: 180, height: 180,
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
            <div className="overflow-hidden flex-shrink-0 bg-gray-100" style={{ width: 165, height: 195 }}>
              {photoUrl ? (
                <img src={photoUrl} alt={fullName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">Photo</div>
              )}
            </div>
          )}
        </div>

        {/* Staff Details */}
        <div className="text-center px-5 py-2 space-y-0.5">
          <p
            className="font-bold text-lg uppercase tracking-wide"
            style={{ color: style.nameColor, fontWeight: 800 }}
          >
            {fullName || "FULL NAME"}
          </p>
          <p
            className="text-sm font-medium uppercase tracking-wide"
            style={{ color: style.roleColor }}
          >
            {roleDepartment || "ROLE - DEPARTMENT"}
          </p>
          <p
            className="text-base font-bold uppercase tracking-wide"
            style={{ color: style.stateColor, fontStyle: company === "Blue Ridge" ? "normal" : "normal", fontWeight: 700 }}
          >
            {state || "STATE"}
          </p>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Footer Bar - matches templates exactly:
            Left: "Authorised Signature" text
            Center: White box with signature image
            Right: PROTEN logo */}
        <div
          className="px-3 py-2 flex items-center justify-between"
          style={{ backgroundColor: style.footerBg, minHeight: 48 }}
        >
          <span
            className="text-[9px] font-medium italic leading-tight"
            style={{ color: style.authSignatureColor, maxWidth: 65 }}
          >
            Authorised Signature
          </span>
          <div className="bg-white rounded-sm flex items-center justify-center overflow-hidden" style={{ width: 80, height: 36 }}>
            <img
              src={signatureImg}
              alt="Signature"
              className="w-full h-full object-contain"
              style={{ padding: 2 }}
            />
          </div>
          <img
            src={logoProten}
            alt="Proten"
            className="h-7 w-auto object-contain"
            loading="lazy"
          />
        </div>
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
            <p className="text-lg font-semibold text-gray-800 leading-relaxed">
              This card remains<br />
              the property of<br />
              Proten International
            </p>
            <p className="text-lg font-semibold text-gray-800 leading-relaxed">
              In case of loss, the finder<br />
              should kindly return it to
            </p>
            <p className="text-lg font-semibold text-gray-800 leading-relaxed">
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
