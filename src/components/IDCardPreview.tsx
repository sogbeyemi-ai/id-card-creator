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
    // All three templates use OPay logo at the top
    const topLogo = logoOpay;

    const isBlueRidge = company === "Blue Ridge";

    return (
      <div
        ref={ref}
        className="relative bg-white overflow-hidden flex flex-col"
        style={{ width: 350, height: 530, fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif" }}
      >
        {/* Top Logo – OPay for all */}
        <div className="flex justify-center pt-5 pb-2 px-6">
          {isBlueRidge ? (
            <img src={logoBlueridge} alt="Blue Ridge" className="h-16 w-auto object-contain" />
          ) : (
            <img src={topLogo} alt="OPay" className="h-16 w-auto object-contain" />
          )}
        </div>

        {/* Photo */}
        <div className="flex justify-center px-6 py-2 flex-1 items-center">
          {isBlueRidge ? (
            <div
              className="rounded-full overflow-hidden flex-shrink-0 bg-gray-100"
              style={{ width: 180, height: 180, border: "3px solid #a8c8e8" }}
            >
              {photoUrl ? (
                <img src={photoUrl} alt={fullName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">Photo</div>
              )}
            </div>
          ) : (
            <div
              className="overflow-hidden flex-shrink-0 bg-gray-100"
              style={{ width: 165, height: 195, border: "1px solid #c0dde8" }}
            >
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
            className="text-lg uppercase tracking-wide"
            style={{ color: isBlueRidge ? "#0033cc" : "#1a8c7a", fontWeight: 800 }}
          >
            {fullName || "FULL NAME"}
          </p>
          <p
            className="text-sm uppercase tracking-wide"
            style={{ color: isBlueRidge ? "#4a5568" : "#2d3748", fontWeight: 600 }}
          >
            {roleDepartment || "ROLE - DEPARTMENT"}
          </p>
          <p
            className="text-base uppercase tracking-wide"
            style={{ color: isBlueRidge ? "#1a1a1a" : "#1a8c7a", fontWeight: 700 }}
          >
            {state || "STATE"}
          </p>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Footer – company-specific */}
        {company === "SOTI" ? (
          /* SOTI: white bg, SOTI logo left, teal sig box center, PROTEN right */
          <div className="px-3 py-2 flex items-center justify-between" style={{ minHeight: 56 }}>
            <img src={logoSoti} alt="SOTI" className="h-10 w-auto object-contain" />
            <div
              className="rounded-sm flex items-center justify-center overflow-hidden"
              style={{ width: 120, height: 48, backgroundColor: "#2cc4ad" }}
            >
              <div className="bg-white rounded-sm overflow-hidden flex items-center justify-center" style={{ width: 100, height: 40 }}>
                <img src={signatureImg} alt="Signature" className="w-full h-full object-contain" style={{ padding: 2 }} />
              </div>
            </div>
            <img src={logoProten} alt="Proten" className="h-9 w-auto object-contain" />
          </div>
        ) : company === "OPAY" ? (
          /* OPAY: teal bar left+center, PROTEN on white right */
          <div className="flex items-stretch" style={{ minHeight: 56 }}>
            <div
              className="flex-1 flex items-center justify-between px-4"
              style={{ backgroundColor: "#2cc4ad" }}
            >
              <span className="text-sm font-bold text-white" style={{ maxWidth: 100 }}>
                Authorised Signature
              </span>
              <div className="bg-white rounded-sm flex items-center justify-center overflow-hidden" style={{ width: 100, height: 44 }}>
                <img src={signatureImg} alt="Signature" className="w-full h-full object-contain" style={{ padding: 2 }} />
              </div>
            </div>
            <div className="flex items-center justify-center px-3 bg-white">
              <img src={logoProten} alt="Proten" className="h-9 w-auto object-contain" />
            </div>
          </div>
        ) : (
          /* Blue Ridge: blue bar left+center, PROTEN on white right */
          <div className="flex items-stretch" style={{ minHeight: 56 }}>
            <div
              className="flex-1 flex items-center justify-between px-4"
              style={{ backgroundColor: "#0000ff" }}
            >
              <span className="text-sm font-bold text-white" style={{ maxWidth: 100 }}>
                Authorised Signature
              </span>
              <div className="bg-white rounded-sm flex items-center justify-center overflow-hidden" style={{ width: 100, height: 44 }}>
                <img src={signatureImg} alt="Signature" className="w-full h-full object-contain" style={{ padding: 2 }} />
              </div>
            </div>
            <div className="flex items-center justify-center px-3 bg-white">
              <img src={logoProten} alt="Proten" className="h-9 w-auto object-contain" />
            </div>
          </div>
        )}
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
        <div className="flex items-center justify-center gap-4 pt-6 pb-4 px-8">
          {company === "SOTI" ? (
            /* SOTI back uses the combined SOTI | PROTEN image */
            <img src={sotiProtenBack} alt="SOTI | Proten" className="h-12 w-auto object-contain" />
          ) : company === "OPAY" ? (
            <>
              <img src={logoOpay} alt="OPay" className="h-12 w-auto object-contain" />
              <div className="w-px h-10 bg-gray-300" />
              <img src={logoProten} alt="Proten" className="h-10 w-auto object-contain" />
            </>
          ) : (
            <>
              <img src={logoBlueridge} alt="Blue Ridge" className="h-12 w-auto object-contain" />
              <div className="w-px h-10 bg-gray-300" />
              <img src={logoProten} alt="Proten" className="h-10 w-auto object-contain" />
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
