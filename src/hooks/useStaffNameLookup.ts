import { useMemo } from "react";
import {
  useVerifiedStaffCache,
  findStaffMatch,
  findStaffCandidates,
  type VerifiedStaffRecord,
  type StaffCandidate,
} from "@/hooks/useVerifiedStaffCache";

export type { VerifiedStaffRecord, StaffCandidate };

export type Confidence = "exact" | "high" | "low";

export interface NameLookupResult {
  status: "idle" | "searching" | "found" | "ambiguous" | "not_found";
  match: VerifiedStaffRecord | null;
  confidence: Confidence | null;
  score: number;
  candidates: StaffCandidate[];
}

/**
 * Instant in-memory lookup against the cached verified_staff dataset.
 * Returns the best match plus the next-best alternatives so the UI can
 * surface a confidence label and offer a "choose correct staff" picker
 * when the match is ambiguous.
 */
export const useStaffNameLookup = (fullName: string): NameLookupResult => {
  const { records, loading } = useVerifiedStaffCache();

  return useMemo<NameLookupResult>(() => {
    const trimmed = fullName.trim();
    if (trimmed.split(/\s+/).filter(Boolean).length < 2) {
      return { status: "idle", match: null, confidence: null, score: 0, candidates: [] };
    }
    if (loading && records.length === 0) {
      return { status: "searching", match: null, confidence: null, score: 0, candidates: [] };
    }

    const candidates = findStaffCandidates(trimmed, records, 5);
    const best = findStaffMatch(trimmed, records);

    if (!best || candidates.length === 0) {
      return { status: "not_found", match: null, confidence: null, score: 0, candidates: [] };
    }

    const topScore = candidates[0].score;
    let confidence: Confidence;
    if (topScore >= 1000) confidence = "exact";
    else if (topScore >= 900) confidence = "high";
    else confidence = "low";

    // Ambiguous when low confidence AND there are multiple plausible candidates
    // OR when a high-tier match has another close competitor.
    const closeRunnerUp =
      candidates.length > 1 && candidates[1].score >= Math.max(100, topScore - 50);
    const ambiguous = confidence === "low" || (confidence === "high" && closeRunnerUp);

    return {
      status: ambiguous ? "ambiguous" : "found",
      match: best,
      confidence,
      score: topScore,
      candidates,
    };
  }, [fullName, records, loading]);
};
