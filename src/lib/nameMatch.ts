/**
 * Shared name-matching helpers used for staff verification and auto-fill.
 * - Case insensitive
 * - Ignores extra spaces and punctuation
 * - Order-independent
 * - Allows missing middle names
 *
 * IMPORTANT: When multiple records share some name parts (e.g. two people
 * sharing first + middle names), we must score candidates and pick the BEST
 * match — not the first fuzzy hit. Otherwise the wrong role/department gets
 * auto-filled.
 */
export const normalizeName = (n: string): string[] =>
  n
    .toUpperCase()
    .replace(/[^A-Z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

/**
 * Returns a match score between input and DB name.
 *  - 1000  : exact match (same words, same count)
 *  - 900   : input is a strict subset of DB (input has all DB words minus extras) or vice-versa, AND every input word is in DB
 *  - 100 + overlapCount : weak overlap (≥2 words shared) — only used as last resort
 *  - 0     : no meaningful match
 */
export const nameMatchScore = (inputName: string, dbName: string): number => {
  const inputWords = normalizeName(inputName);
  const dbWords = normalizeName(dbName);
  if (inputWords.length === 0 || dbWords.length === 0) return 0;

  const inputSorted = [...inputWords].sort();
  const dbSorted = [...dbWords].sort();

  // Exact set match (same multiset of words)
  if (
    inputSorted.length === dbSorted.length &&
    inputSorted.every((w, i) => w === dbSorted[i])
  ) {
    return 1000;
  }

  const inputSet = new Set(inputWords);
  const dbSet = new Set(dbWords);

  // Every input word is in DB (input ⊆ DB) — strong match, missing middle names OK
  const inputSubsetOfDb = inputWords.every((w) => dbSet.has(w));
  // Every DB word is in input (DB ⊆ input) — also strong
  const dbSubsetOfInput = dbWords.every((w) => inputSet.has(w));

  if (inputSubsetOfDb || dbSubsetOfInput) {
    // Higher score when more words match overall (favors fuller name overlap)
    const overlap = inputWords.filter((w) => dbSet.has(w)).length;
    // Penalize size difference so a 3/3 match beats a 2/3 partial subset
    const sizeDiff = Math.abs(inputWords.length - dbWords.length);
    return 900 + overlap * 10 - sizeDiff;
  }

  // Weak overlap: at least 2 words in common but neither is a subset of the other.
  // This is risky (different people sharing first+middle names) — we still
  // return a score but lower than any subset match, and the caller MUST pick
  // the highest-scoring candidate rather than the first one found.
  const overlap = inputWords.filter((w) => dbSet.has(w)).length;
  if (overlap >= 2) return 100 + overlap;

  return 0;
};

export const namesMatch = (inputName: string, dbName: string): boolean =>
  nameMatchScore(inputName, dbName) > 0;
