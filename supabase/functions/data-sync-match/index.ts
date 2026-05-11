import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- header alias dictionary ---
const HEADER_ALIASES: Record<string, string[]> = {
  full_name: ["full name", "name", "staff name", "employee name", "fullname", "employee", "staff"],
  email: ["email", "email address", "e-mail", "mail"],
  phone: ["phone", "phone number", "mobile", "contact", "tel"],
  tax_id: ["tin", "tax id", "tax number", "taxid"],
  pension_id: ["pension", "pension no", "pension id", "pension number", "rsa"],
  department: ["department", "dept", "division"],
  role: ["role", "position", "title", "job title", "designation"],
  bank_name: ["bank", "bank name"],
  bank_account: ["account", "account number", "bank account", "acct no"],
  state: ["state", "location", "region"],
  staff_id: ["staff id", "employee id", "id number", "emp id", "staff no"],
  base_salary: ["base salary", "basic", "basic salary", "salary"],
  net_pay: ["net pay", "net salary", "take home", "net"],
  gross_pay: ["gross pay", "gross salary", "gross"],
};

function norm(s: string) {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

function dice(a: string, b: string) {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return na === nb ? 1 : 0;
  const grams = (s: string) => {
    const set = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      set.set(g, (set.get(g) ?? 0) + 1);
    }
    return set;
  };
  const A = grams(na), B = grams(nb);
  let overlap = 0;
  for (const [g, c] of A) overlap += Math.min(c, B.get(g) ?? 0);
  return (2 * overlap) / (na.length - 1 + nb.length - 1);
}

function alignHeaders(sourceHeaders: string[], masterHeaders: string[]) {
  const mapping: Record<string, string | null> = {};
  for (const sh of sourceHeaders) {
    let best: { h: string; score: number } | null = null;
    for (const mh of masterHeaders) {
      // direct dice
      let s = dice(sh, mh);
      // alias bonus
      const nsh = norm(sh), nmh = norm(mh);
      for (const aliases of Object.values(HEADER_ALIASES)) {
        if (aliases.includes(nsh) && aliases.includes(nmh)) s = Math.max(s, 0.98);
      }
      if (!best || s > best.score) best = { h: mh, score: s };
    }
    mapping[sh] = best && best.score >= 0.55 ? best.h : null;
  }
  return mapping;
}

// Common honorifics/titles stripped before comparing names.
const TITLES = new Set([
  "mr", "mrs", "ms", "miss", "mister", "madam", "mdm",
  "dr", "prof", "professor", "engr", "engineer",
  "rev", "reverend", "pst", "pastor", "hon", "honorable",
  "sir", "alhaji", "alhaja", "chief", "barr", "barrister",
]);

function tokens(s: string): string[] {
  return norm(s).split(" ").filter(Boolean).filter((w) => !TITLES.has(w));
}

function nameKey(name: string) {
  return tokens(name).sort().join(" ");
}

/**
 * Token-aware name match. Per-token fuzzy + initial handling + subset boost.
 * Returns 0..100.
 *  - 100: identical token multisets
 *  - 90-99: one side is a subset (missing middle names ok)
 *  - 70-89: strong per-token fuzzy overlap (typos, partial spellings)
 *  - 40-69: weak — flagged for manual review
 *  - <40: unmatched
 */
function nameMatchScore(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.length || !B.length) return 0;

  const sortedA = [...A].sort().join(" ");
  const sortedB = [...B].sort().join(" ");
  if (sortedA === sortedB) return 100;

  // Per-token match: exact, initial, or dice>=0.85 (handles typos like ADEYMI/ADEYEMI)
  const tokenMatches = (x: string, y: string): boolean => {
    if (x === y) return true;
    // initial vs full word, either direction
    if (x.length === 1 && y.startsWith(x)) return true;
    if (y.length === 1 && x.startsWith(y)) return true;
    // prefix containment for truncated names (>=4 chars)
    if (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x))) return true;
    if (x.length >= 3 && y.length >= 3 && dice(x, y) >= 0.82) return true;
    return false;
  };

  // Greedy bipartite matching A <-> B
  const usedB = new Array(B.length).fill(false);
  let matched = 0;
  for (const ta of A) {
    let bestIdx = -1, bestScore = 0;
    for (let i = 0; i < B.length; i++) {
      if (usedB[i]) continue;
      if (!tokenMatches(ta, B[i])) continue;
      const s = ta === B[i] ? 2 : 1;
      if (s > bestScore) { bestScore = s; bestIdx = i; }
    }
    if (bestIdx >= 0) { usedB[bestIdx] = true; matched++; }
  }

  const minLen = Math.min(A.length, B.length);
  const maxLen = Math.max(A.length, B.length);
  const sizeDiff = maxLen - minLen;

  // CRITICAL: if both names have >=2 tokens, require at least 2 matching tokens.
  // A single shared first name (e.g. "Christiana") between two otherwise different
  // full names must NOT be considered a match — it produces false positives.
  if (A.length >= 2 && B.length >= 2 && matched < 2) {
    return 0;
  }

  // Surname check: when both have >=2 tokens, the last (surname) token must match
  // OR at least be a strong fuzzy match. Different surnames = different people.
  if (A.length >= 2 && B.length >= 2) {
    const surnameA = A[A.length - 1];
    const surnameB = B[B.length - 1];
    // Also try sorted last-by-alphabet — but typically family name is last in input.
    const surnameOk =
      surnameA === surnameB ||
      (surnameA.length >= 4 && surnameB.length >= 4 &&
        (surnameA.startsWith(surnameB) || surnameB.startsWith(surnameA))) ||
      dice(surnameA, surnameB) >= 0.85;
    if (!surnameOk) {
      // Surnames clearly differ — cap score so it never auto-applies; usually unmatched.
      return matched >= 2 ? 45 : 0;
    }
  }

  // Strong: all tokens of shorter side matched (missing middle names is fine)
  if (matched === minLen && minLen >= 1) {
    if (minLen === 1 && maxLen > 1) {
      return 55; // single name match, ambiguous → manual review only
    }
    return Math.max(80, Math.min(99, 95 - sizeDiff * 3));
  }

  // Partial overlap (already guaranteed matched>=2 here for multi-token names)
  const coverage = matched / maxLen;
  if (matched >= 2) return Math.round(50 + coverage * 35); // 50..85
  if (matched === 1 && maxLen <= 2) return Math.round(40 + coverage * 25);

  const d = dice(sortedA, sortedB);
  if (d >= 0.7) return Math.round(40 + d * 40);
  return Math.round(d * 35);
}

function pickNameField(headers: string[]): string | null {
  const aliases = HEADER_ALIASES.full_name;
  for (const h of headers) {
    if (aliases.includes(norm(h))) return h;
  }
  // fuzzy
  let best: { h: string; s: number } | null = null;
  for (const h of headers) {
    const s = Math.max(...aliases.map((a) => dice(h, a)));
    if (!best || s > best.s) best = { h, s };
  }
  return best && best.s >= 0.5 ? best.h : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { workspace_id, source_file_name, source_headers, source_rows, threshold } = await req.json();
    if (!workspace_id || !Array.isArray(source_rows)) {
      return new Response(JSON.stringify({ error: "Bad payload" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load master sheet (headers) + master rows
    const { data: sheet } = await supabase
      .from("sync_master_sheets")
      .select("headers")
      .eq("workspace_id", workspace_id)
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const masterHeaders: string[] = (sheet?.headers as string[]) || [];
    const { data: masterRows } = await supabase
      .from("sync_master_rows")
      .select("id, data, name_key")
      .eq("workspace_id", workspace_id);
    const master = masterRows ?? [];

    const headerMapping = alignHeaders(source_headers, masterHeaders);
    const srcNameField = pickNameField(source_headers);
    const mstNameField = pickNameField(masterHeaders);

    // create run
    const { data: run, error: runErr } = await supabase
      .from("sync_runs")
      .insert({
        workspace_id,
        source_file_name,
        status: "previewed",
        header_mapping: headerMapping,
        threshold: threshold ?? 80,
        created_by: user.id,
      })
      .select()
      .single();
    if (runErr) throw runErr;

    const items: any[] = [];
    for (const srow of source_rows as Record<string, any>[]) {
      const srcName = srcNameField ? String(srow[srcNameField] ?? "") : "";
      let best: { row: any; score: number } | null = null;
      if (srcName && mstNameField) {
        for (const mrow of master) {
          const mname = String((mrow.data as any)[mstNameField] ?? "");
          if (!mname) continue;
          const s = nameMatchScore(srcName, mname);
          if (!best || s > best.score) best = { row: mrow, score: s };
        }
      }
      const confidence = best?.score ?? 0;
      let decision: string;
      let diff: Record<string, { from: any; to: any }> = {};
      if (best && confidence >= 100) decision = "auto_update";
      else if (best && confidence >= (threshold ?? 80)) decision = "auto_update";
      else if (best && confidence >= 60) decision = "manual";
      else decision = "unmatched";

      if (best && decision !== "unmatched") {
        for (const sh of source_headers) {
          const mh = headerMapping[sh];
          if (!mh) continue;
          const newVal = srow[sh];
          if (newVal === null || newVal === undefined || String(newVal).trim() === "") continue;
          const oldVal = (best.row.data as any)[mh];
          if (String(oldVal ?? "") !== String(newVal)) {
            diff[mh] = { from: oldVal ?? null, to: newVal };
          }
        }
      }

      items.push({
        run_id: run.id,
        source_row: srow,
        match_master_row_id: best?.row?.id ?? null,
        confidence,
        decision,
        diff,
      });
    }

    // chunk insert
    for (let i = 0; i < items.length; i += 500) {
      const slice = items.slice(i, i + 500);
      const { error } = await supabase.from("sync_run_items").insert(slice);
      if (error) throw error;
    }

    return new Response(JSON.stringify({ run_id: run.id, header_mapping: headerMapping, total: items.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
