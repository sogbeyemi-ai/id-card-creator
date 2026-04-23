import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { namesMatch, normalizeName } from "@/lib/nameMatch";

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
export const findStaffMatch = (
  fullName: string,
  records: VerifiedStaffRecord[]
): VerifiedStaffRecord | null => {
  const trimmed = fullName.trim();
  if (normalizeName(trimmed).length < 1) return null;
  return records.find((s) => namesMatch(trimmed, s.full_name)) || null;
};
