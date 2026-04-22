import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { namesMatch } from "@/lib/nameMatch";

export interface VerifiedStaffRecord {
  id: string;
  full_name: string;
  role: string | null;
  department: string | null;
}

export interface NameLookupResult {
  status: "idle" | "searching" | "found" | "not_found";
  match: VerifiedStaffRecord | null;
}

/**
 * Debounced lookup against verified_staff. Returns the matched record (if any)
 * so the form can auto-fill role/department.
 */
export const useStaffNameLookup = (fullName: string, debounceMs = 450): NameLookupResult => {
  const [result, setResult] = useState<NameLookupResult>({ status: "idle", match: null });

  useEffect(() => {
    const trimmed = fullName.trim();
    if (trimmed.split(/\s+/).filter(Boolean).length < 2) {
      setResult({ status: "idle", match: null });
      return;
    }

    let cancelled = false;
    setResult({ status: "searching", match: null });

    const timer = setTimeout(async () => {
      try {
        // Fetch all verified staff (paginated, default limit 1000)
        let all: VerifiedStaffRecord[] = [];
        let from = 0;
        const pageSize = 1000;
        while (true) {
          const { data, error } = await supabase
            .from("verified_staff")
            .select("id, full_name, role, department")
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          all = all.concat(data);
          if (data.length < pageSize) break;
          from += pageSize;
        }

        if (cancelled) return;
        const match = all.find((s) => namesMatch(trimmed, s.full_name)) || null;
        setResult({ status: match ? "found" : "not_found", match });
      } catch {
        if (!cancelled) setResult({ status: "not_found", match: null });
      }
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fullName, debounceMs]);

  return result;
};
