import { CompanyTemplate } from "./StaffForm";

interface IDCardPreviewProps {
  fullName: string;
  role: string;
  department: string;
  company: CompanyTemplate;
  photoUrl: string | null;
  id?: string;
}

const templateStyles: Record<CompanyTemplate, {
  bg: string;
  headerBg: string;
  accentBar: string;
  textColor: string;
  labelColor: string;
  companyName: string;
}> = {
  SOTI: {
    bg: "bg-gradient-to-br from-[hsl(220,70%,15%)] to-[hsl(220,60%,25%)]",
    headerBg: "bg-[hsl(45,90%,55%)]",
    accentBar: "bg-[hsl(45,90%,55%)]",
    textColor: "text-[hsl(0,0%,95%)]",
    labelColor: "text-[hsl(45,90%,55%)]",
    companyName: "SOTI",
  },
  OPAY: {
    bg: "bg-gradient-to-br from-[hsl(170,80%,30%)] to-[hsl(170,60%,45%)]",
    headerBg: "bg-[hsl(0,0%,100%)]",
    accentBar: "bg-[hsl(170,80%,25%)]",
    textColor: "text-[hsl(0,0%,100%)]",
    labelColor: "text-[hsl(170,80%,80%)]",
    companyName: "OPAY",
  },
  "Blue Ridge": {
    bg: "bg-gradient-to-br from-[hsl(210,60%,40%)] to-[hsl(210,50%,55%)]",
    headerBg: "bg-[hsl(0,0%,100%)]",
    accentBar: "bg-[hsl(210,60%,30%)]",
    textColor: "text-[hsl(0,0%,100%)]",
    labelColor: "text-[hsl(210,40%,80%)]",
    companyName: "Blue Ridge",
  },
};

const IDCardPreview = ({ fullName, role, department, company, photoUrl, id }: IDCardPreviewProps) => {
  const style = templateStyles[company];

  return (
    <div className={`relative w-full max-w-[340px] aspect-[85.6/54] rounded-xl overflow-hidden shadow-elevated animate-scale-in ${style.bg}`}>
      {/* Accent bar */}
      <div className={`absolute top-0 left-0 w-full h-1.5 ${style.accentBar}`} />

      {/* Company header */}
      <div className="absolute top-4 left-5 right-5 flex items-center justify-between">
        <h3 className={`font-display text-lg font-bold tracking-tight ${style.textColor}`}>
          {style.companyName}
        </h3>
        <span className={`text-[10px] font-medium uppercase tracking-widest ${style.labelColor}`}>
          Staff ID
        </span>
      </div>

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-5 flex gap-4 items-end">
        {/* Photo */}
        <div className="w-16 h-20 rounded-lg overflow-hidden border-2 border-white/20 flex-shrink-0 bg-white/10">
          {photoUrl ? (
            <img src={photoUrl} alt={fullName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/30 text-xs">
              Photo
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className={`font-display font-bold text-sm truncate ${style.textColor}`}>
            {fullName || "Full Name"}
          </p>
          <p className={`text-xs font-medium truncate ${style.labelColor}`}>
            {role || "Role"}
          </p>
          <p className={`text-[10px] truncate ${style.labelColor} opacity-80`}>
            {department || "Department"}
          </p>
          {id && (
            <p className={`text-[8px] font-mono mt-1 ${style.labelColor} opacity-60`}>
              ID: {id.slice(0, 8).toUpperCase()}
            </p>
          )}
        </div>
      </div>

      {/* Decorative circle */}
      <div className="absolute top-8 right-4 w-24 h-24 rounded-full border border-white/5" />
      <div className="absolute top-12 right-8 w-16 h-16 rounded-full border border-white/5" />
    </div>
  );
};

export default IDCardPreview;
