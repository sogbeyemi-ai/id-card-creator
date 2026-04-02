import { forwardRef } from "react";
import { CompanyTemplate } from "./StaffForm";
import logoOpay from "@/assets/logo-opay.png";
import logoBlueridge from "@/assets/logo-blueridge.png";
import logoProten from "@/assets/logo-proten.png";
import sotiProtenBack from "@/assets/soti-proten-back.png";
import templateSotiFront from "@/assets/template-soti-front.jpg";
import templateOpayFront from "@/assets/template-opay-front.jpg";
import templateBlueridgeFront from "@/assets/template-blueridge-front.jpg";

interface IDCardPreviewProps {
  fullName: string;
  roleDepartment: string;
  state: string;
  company: CompanyTemplate;
  photoUrl: string | null;
  id?: string;
  side?: "front" | "back";
}

/* ───── FRONT CARD ───── */

const IDCardFront = forwardRef<HTMLDivElement, IDCardPreviewProps>(
  ({ fullName, roleDepartment, state, company, photoUrl }, ref) => {
    const templateBg =
      company === "SOTI"
        ? templateSotiFront
        : company === "OPAY"
        ? templateOpayFront
        : templateBlueridgeFront;

    const isBlueRidge = company === "Blue Ridge";
    const nameColor = isBlueRidge ? "#0033cc" : "#1a8c7a";
    const roleColor = isBlueRidge ? "#4a5568" : "#2d3748";
    const stateColor = isBlueRidge ? "#1a1a1a" : "#1a8c7a";

    return (
      <div
        ref={ref}
        className="relative overflow-hidden"
        style={{
          width: 350,
          height: 530,
          fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
        }}
      >
        {/* Template background image */}
        <img
          src={templateBg}
          alt="Template"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ zIndex: 0 }}
        />

        {/* Photo overlay – positioned in the center area of the card */}
        <div
          className="absolute flex items-center justify-center"
          style={{
            top: isBlueRidge ? 155 : 140,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1,
          }}
        >
          {photoUrl && (
            <div
              className="overflow-hidden bg-white"
              style={{
                width: isBlueRidge ? 160 : 165,
                height: isBlueRidge ? 160 : 195,
                borderRadius: isBlueRidge ? "50%" : 0,
              }}
            >
              <img src={photoUrl} alt={fullName} className="w-full h-full object-cover" />
            </div>
          )}
        </div>

        {/* Text overlay – name, role, state */}
        <div
          className="absolute text-center"
          style={{
            bottom: 75,
            left: 0,
            right: 0,
            zIndex: 1,
            padding: "0 20px",
          }}
        >
          <p
            className="text-lg uppercase tracking-wide"
            style={{ color: nameColor, fontWeight: 800 }}
          >
            {fullName || "FULL NAME"}
          </p>
          <p
            className="text-sm uppercase tracking-wide"
            style={{ color: roleColor, fontWeight: 600 }}
          >
            {roleDepartment || "ROLE - DEPARTMENT"}
          </p>
          <p
            className="text-base uppercase tracking-wide"
            style={{ color: stateColor, fontWeight: 700 }}
          >
            {state || "STATE"}
          </p>
        </div>
      </div>
    );
  }
);
IDCardFront.displayName = "IDCardFront";

/* ───── BACK CARD ───── */

const IDCardBack = forwardRef<HTMLDivElement, { company: CompanyTemplate }>(
  ({ company }, ref) => {
    return (
      <div
        ref={ref}
        className="relative bg-white overflow-hidden flex flex-col"
        style={{ width: 350, height: 530, fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif" }}
      >
        {/* Top logos */}
        <div className="flex items-center justify-center gap-4 pt-6 pb-4 px-8" style={{ height: 70 }}>
          {company === "SOTI" ? (
            <img src={sotiProtenBack} alt="SOTI | Proten" style={{ height: 40, width: "auto" }} className="object-contain" />
          ) : company === "OPAY" ? (
            <>
              <img src={logoOpay} alt="OPay" style={{ height: 40, width: "auto" }} className="object-contain" />
              <div className="w-px bg-gray-300" style={{ height: 30 }} />
              <img src={logoProten} alt="Proten" style={{ height: 28, width: "auto" }} className="object-contain" />
            </>
          ) : (
            <>
              <img src={logoBlueridge} alt="Blue Ridge" style={{ height: 40 }} className="object-contain" />
              <div className="w-px bg-gray-300" style={{ height: 30 }} />
              <img src={logoProten} alt="Proten" style={{ height: 28, width: "auto" }} className="object-contain" />
            </>
          )}
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

/* ───── WRAPPER ───── */

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
