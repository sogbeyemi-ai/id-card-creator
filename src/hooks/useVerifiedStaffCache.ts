import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { nameMatchScore, normalizeName } from "@/lib/nameMatch";

export interface VerifiedStaffRecord {
  id: string;
  full_name: string;
  role: string | null;
  department: string | null;
}

// Module-level cache shared across all hook consumers in the same browser session.
// This avoids paying the network cost again on every keystroke or remount.
let cachedRecords: VerifiedStaffRecord[] | null = null;
let inflight: Promise<VerifiedStaffRecord[]> | null = null;
const subscribers = new Set<(r: VerifiedStaffRecord[]) => void>();

const CACHE_KEY = "verified_staff_cache_v1";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const loadFromSession = (): VerifiedStaffRecord[] | null => {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed.records as VerifiedStaffRecord[];
  } catch {
    return null;
  }
};

const saveToSession = (records: VerifiedStaffRecord[]) => {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), records }));
  } catch {
    /* quota / private mode — ignore */
  }
};

const fetchAll = async (): Promise<VerifiedStaffRecord[]> => {
  const all: VerifiedStaffRecord[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("verified_staff")
      .select("id, full_name, role, department")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
};

const ensureLoaded = (): Promise<VerifiedStaffRecord[]> => {
  if (cachedRecords) return Promise.resolve(cachedRecords);
  if (inflight) return inflight;

  // Try sessionStorage first for instant warm start across page navigations
  const fromSession = loadFromSession();
  if (fromSession) {
    cachedRecords = fromSession;
    // Refresh in background (don't block)
    inflight = fetchAll()
      .then((records) => {
        cachedRecords = records;
        saveToSession(records);
        subscribers.forEach((cb) => cb(records));
        return records;
      })
      .catch(() => fromSession)
      .finally(() => {
        inflight = null;
      });
    return Promise.resolve(fromSession);
  }

  inflight = fetchAll()
    .then((records) => {
      cachedRecords = records;
      saveToSession(records);
      subscribers.forEach((cb) => cb(records));
      return records;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
};

export const invalidateVerifiedStaffCache = () => {
  cachedRecords = null;
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
};

/**
 * Returns the cached list of verified staff. Triggers a load on first use.
 * The cache is shared module-wide so all components stay in sync without
 * re-fetching.
 */
export const useVerifiedStaffCache = () => {
  const [records, setRecords] = useState<VerifiedStaffRecord[] | null>(cachedRecords);
  const [loading, setLoading] = useState(!cachedRecords);

  useEffect(() => {
    let mounted = true;
    const onUpdate = (r: VerifiedStaffRecord[]) => {
      if (mounted) setRecords(r);
    };
    subscribers.add(onUpdate);

    if (!cachedRecords) {
      ensureLoaded()
        .then((r) => {
          if (mounted) {
            setRecords(r);
            setLoading(false);
          }
        })
        .catch(() => {
          if (mounted) setLoading(false);
        });
    } else {
      setLoading(false);
    }

    return () => {
      mounted = false;
      subscribers.delete(onUpdate);
    };
  }, []);

  return { records: records || [], loading };
};

/**
 * Synchronous lookup against the in-memory cache. Returns the matched record
 * or null. Use this together with useVerifiedStaffCache so the data is loaded.
 */
/**
 * Synchronous lookup against the in-memory cache. Scores ALL candidates and
 * returns the highest-scoring record so that exact matches always beat
 * partial overlaps (e.g. "ADEKUNLE MARY OLUWAYEMISI" must NOT resolve to
 * "FALEKE MARY OLUWAYEMISI" just because two words happen to overlap).
 *
 * Returns null when the best score is ambiguous (tie at the weak-overlap
 * tier) or below the confidence threshold.
 */
export const findStaffMatch = (
  fullName: string,
  records: VerifiedStaffRecord[]
): VerifiedStaffRecord | null => {
  const trimmed = fullName.trim();
  if (normalizeName(trimmed).length < 1) return null;

  let best: VerifiedStaffRecord | null = null;
  let bestScore = 0;
  let tiedAtBest = false;

  for (const rec of records) {
    const score = nameMatchScore(trimmed, rec.full_name);
    if (score <= 0) continue;
    if (score > bestScore) {
      bestScore = score;
      best = rec;
      tiedAtBest = false;
    } else if (score === bestScore) {
      tiedAtBest = true;
    }
  }

  if (!best) return null;

  // Exact (1000) always wins, even if duplicates exist (same person uploaded
  // twice will have identical role/department — safe to return either).
  if (bestScore >= 1000) return best;

  // Strong subset matches (>=900) are reliable.
  if (bestScore >= 900) return best;

  // Weak overlap tier: if multiple different people tie, refuse to guess.
  if (tiedAtBest) return null;
  return best;
};

export interface StaffCandidate {
  record: VerifiedStaffRecord;
  score: number;
}

/**
 * Returns the top-N scoring candidates (descending) for a given name input.
 * Used by the UI to show a confidence indicator and a disambiguation picker
 * when multiple staff records could plausibly match.
 */
export const findStaffCandidates = (
  fullName: string,
  records: VerifiedStaffRecord[],
  limit = 5
): StaffCandidate[] => {
  const trimmed = fullName.trim();
  if (normalizeName(trimmed).length < 1) return [];

  const scored: StaffCandidate[] = [];
  for (const rec of records) {
    const score = nameMatchScore(trimmed, rec.full_name);
    if (score > 0) scored.push({ record: rec, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
};
