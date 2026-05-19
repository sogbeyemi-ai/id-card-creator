# Improve NIN Extraction Reliability

The current extractor uses a single pass of `google/gemini-2.5-flash` with a generic "read all text" prompt, then runs a strict regex for 11 consecutive digits. When a NIN on a slip is spaced (e.g. `1234 5678 901`), partially obscured, slightly rotated, or printed in a low-contrast font, Flash can either skip it or return it broken across characters that the regex misses.

## Changes (all in `supabase/functions/nin-extract/index.ts`)

### 1. Stronger OCR prompt
Replace the generic prompt with a NIN-focused instruction telling the model to:
- Look specifically for an 11-digit National Identification Number on NIN slips, NIN cards, or international passports.
- Return strictly a JSON object: `{ "nin": "<11 digits or null>", "raw_text": "<all visible text>" }`.
- Normalise the NIN by stripping spaces/dashes before returning.
- Read carefully even if the number is spaced, faint, rotated, or near edges.

Parse the JSON response; fall back to raw text + regex if JSON parsing fails.

### 2. Smarter NIN parsing (`findNIN`)
Make the regex tolerant of common slip formatting:
- Strip spaces, dashes, dots, and non-breaking spaces before matching.
- Also scan for `NIN[:\s]*([\d\s-]{11,17})` style labelled patterns and clean to digits.
- Prefer the labelled match if present; otherwise fall back to any standalone 11-digit run.
- Reject obvious non-NINs (all same digit, sequential like `12345678901`).

### 3. Model fallback for misses
In `process_row`, if the first pass with `google/gemini-2.5-flash` returns no NIN:
- Retry once with `google/gemini-2.5-pro` (stronger vision, catches faint/spaced numbers Flash misses).
- Only then mark the row `no_nin_found`.

Keep a small helper `runOcr(dataUrl, model)` to avoid duplication.

### 4. Keep everything else as-is
- No schema changes, no UI changes, no new actions.
- Batch flow, dedup, retry button all continue to work unchanged.
- Existing `no_nin_found` rows can be re-extracted via the existing "Retry failed" button — they'll now go through the stronger pipeline.

## Files
- `supabase/functions/nin-extract/index.ts` — update `ocrWithGemini`, `findNIN`, and the `process_row` branch.

## Expected outcome
Slips where the NIN is clearly visible but spaced, faintly printed, or near image edges should now extract on the Flash pass; the Pro fallback catches the remaining hard cases without changing cost for the majority of rows that already work.
