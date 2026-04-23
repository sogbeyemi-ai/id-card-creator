import { useMemo } from "react";
import {
  useVerifiedStaffCache,
  findStaffMatch,
  type VerifiedStaffRecord,
} from "@/hooks/useVerifiedStaffCache";

export type { VerifiedStaffRecord };

export interface NameLookupResult {
  status: "idle" | "searching" | "found" | "not_found";
  match: VerifiedStaffRecord | null;
}

/**
 * Instant in-memory lookup against the cached verified_staff dataset.
 * No debounce, no per-keystroke network call — once the cache is warm
 * (loaded once on app start), matching is synchronous and immediate.
 */
export const useStaffNameLookup = (fullName: string): NameLookupResult => {
  const { records, loading } = useVerifiedStaffCache();

  return useMemo<NameLookupResult>(() => {
    const trimmed = fullName.trim();
    if (trimmed.split(/\s+/).filter(Boolean).length < 2) {
      return { status: "idle", match: null };
    }
    if (loading && records.length === 0) {
      return { status: "searching", match: null };
    }
    const match = findStaffMatch(trimmed, records);
    return { status: match ? "found" : "not_found", match };
  }, [fullName, records, loading]);
};
