/**
 * Shared name-matching helpers used for staff verification and auto-fill.
 * - Case insensitive
 * - Ignores extra spaces and punctuation
 * - Order-independent
 * - Allows missing middle names
 */
export const normalizeName = (n: string): string[] =>
  n
    .toUpperCase()
    .replace(/[^A-Z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

export const namesMatch = (inputName: string, dbName: string): boolean => {
  const inputWords = normalizeName(inputName).sort();
  const dbWords = normalizeName(dbName).sort();
  if (inputWords.length === 0 || dbWords.length === 0) return false;

  if (
    inputWords.length === dbWords.length &&
    inputWords.every((w, i) => w === dbWords[i])
  )
    return true;

  if (inputWords.every((w) => dbWords.includes(w))) return true;
  if (dbWords.every((w) => inputWords.includes(w))) return true;

  const overlap = inputWords.filter((w) => dbWords.includes(w));
  if (overlap.length >= 2) return true;

  return false;
};
