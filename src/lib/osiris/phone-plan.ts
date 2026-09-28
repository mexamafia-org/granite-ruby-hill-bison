import { PHONE_PLAN_JSON } from "./phone-plan.generated.ts";
import type { NumberPlanType } from "./types.ts";

export type { NumberPlanType };

interface PlanTypePat {
  pat: string;
  len: number[];
}

interface PlanFormat {
  pat: string;
  leading: string | null;
  fmt: string;
  intl: string | null;
  npRule: string | null;
}

export interface PlanTerritory {
  id: string;
  cc: string;
  name: string;
  leading: string | null;
  main: boolean;
  portable: boolean;
  np: string | null;
  general: string | null;
  types: Partial<Record<Exclude<NumberPlanType, "fixed_or_mobile" | "unknown">, PlanTypePat>>;
  formats: PlanFormat[];
}

interface PlanFile {
  source: string;
  doctrine: string;
  territoryCount: number;
  territories: PlanTerritory[];
  byCc: Record<string, string[]>;
}

export interface PlanMatch {
  territory: PlanTerritory;
  national: string;
  e164Digits: string;
  numberType: NumberPlanType;
  valid: boolean;
  source: string;
  formattedNational: string;
  formattedInternational: string;
}

const PLAN = JSON.parse(PHONE_PLAN_JSON) as PlanFile;
const BY_ID = new Map(PLAN.territories.map((t) => [t.id, t]));
const CC_LEN_DESC = Object.keys(PLAN.byCc).sort((a, b) => b.length - a.length || b.localeCompare(a));

const regexCache = new Map<string, RegExp | null>();

function rx(pattern: string, prefix = false): RegExp | null {
  const key = `${prefix ? "^" : "full"}:${pattern}`;
  if (regexCache.has(key)) return regexCache.get(key) ?? null;
  try {
    const re = prefix ? new RegExp(`^(?:${pattern})`) : new RegExp(`^(?:${pattern})$`);
    regexCache.set(key, re);
    return re;
  } catch {
    regexCache.set(key, null);
    return null;
  }
}

function matches(pattern: string | null | undefined, value: string, prefix = false): boolean {
  if (!pattern) return false;
  const re = rx(pattern, prefix);
  return re ? re.test(value) : false;
}

function typeFits(spec: PlanTypePat | undefined, national: string): boolean {
  if (!spec) return false;
  if (spec.len.length > 0 && !spec.len.includes(national.length)) return false;
  return matches(spec.pat, national);
}

function classify(t: PlanTerritory, national: string): NumberPlanType {
  const types = t.types;
  const order: Exclude<NumberPlanType, "fixed_or_mobile" | "unknown" | "mobile" | "fixedLine">[] = [
    "premiumRate",
    "tollFree",
    "sharedCost",
    "personalNumber",
    "voip",
    "pager",
    "uan",
    "voicemail",
  ];
  for (const key of order) {
    if (typeFits(types[key], national)) return key;
  }
  const mobile = typeFits(types.mobile, national);
  const fixed = typeFits(types.fixedLine, national);
  if (mobile && fixed) return "fixed_or_mobile";
  if (mobile) return "mobile";
  if (fixed) return "fixedLine";
  return "unknown";
}

function applyFormat(template: string, groups: string[]): string {
  return template.replace(/\$(\d+)/g, (_, n) => groups[Number(n)] ?? "");
}

export function formatNational(t: PlanTerritory, national: string): string {
  for (const f of t.formats) {
    if (f.leading && !matches(f.leading, national, true)) continue;
    const re = rx(f.pat);
    const m = re ? national.match(re) : null;
    if (!m) continue;
    let out = applyFormat(f.fmt, m);
    if (t.np && f.npRule) {
      out = f.npRule.replace(/\$NP/g, t.np).replace(/\$FG/g, out);
    }
    return out;
  }
  return national;
}

export function formatInternational(t: PlanTerritory, national: string): string {
  for (const f of t.formats) {
    if (f.intl === "NA") continue;
    if (f.leading && !matches(f.leading, national, true)) continue;
    const re = rx(f.pat);
    const m = re ? national.match(re) : null;
    if (!m) continue;
    const body = applyFormat(f.intl || f.fmt, m);
    return `+${t.cc} ${body}`.trim();
  }
  return `+${t.cc}${national}`;
}

function pickForCc(cc: string, national: string): PlanTerritory | null {
  const ids = PLAN.byCc[cc] ?? [];
  const list = ids.map((id) => BY_ID.get(id)).filter((t): t is PlanTerritory => !!t);
  const byLead = list.filter((t) => t.leading && matches(t.leading, national, true));
  if (byLead.length === 1) return byLead[0];
  if (byLead.length > 1) {
    return byLead.find((t) => t.general && matches(t.general, national)) ?? byLead[0];
  }
  const generalHits = list.filter((t) => !t.leading && t.general && matches(t.general, national));
  if (generalHits.length === 1) return generalHits[0];
  const main = list.find((t) => t.main);
  if (main && (!main.general || matches(main.general, national) || generalHits.includes(main))) return main;
  return generalHits[0] ?? main ?? list[0] ?? null;
}

function pack(territory: PlanTerritory, national: string, valid: boolean, numberType: NumberPlanType): PlanMatch {
  return {
    territory,
    national,
    e164Digits: `${territory.cc}${national}`,
    numberType,
    valid,
    source: PLAN.source,
    formattedNational: formatNational(territory, national),
    formattedInternational: formatInternational(territory, national),
  };
}

export function matchNumberingPlan(
  digits: string,
  opts?: { international?: boolean },
): PlanMatch | null {
  if (!digits) return null;

  const mx = BY_ID.get("MX");
  if (!opts?.international && digits.length === 10 && mx?.general && matches(mx.general, digits)) {
    return pack(mx, digits, true, classify(mx, digits));
  }

  for (const cc of CC_LEN_DESC) {
    if (!digits.startsWith(cc)) continue;
    const national = digits.slice(cc.length);
    if (national.length < 5) continue;
    const territory = pickForCc(cc, national);
    if (!territory) continue;
    const numberType = classify(territory, national);
    const valid = territory.general ? matches(territory.general, national) : numberType !== "unknown";
    if (!valid && numberType === "unknown") continue;
    return pack(territory, national, valid, numberType);
  }

  return null;
}

export function numberTypeLabel(type: NumberPlanType): string {
  switch (type) {
    case "mobile":
      return "móvil";
    case "fixedLine":
      return "fijo";
    case "fixed_or_mobile":
      return "fijo o móvil (plan compartido)";
    case "tollFree":
      return "gratuito";
    case "premiumRate":
      return "tarifa adicional";
    case "sharedCost":
      return "costo compartido";
    case "personalNumber":
      return "número personal";
    case "voip":
      return "VoIP";
    case "pager":
      return "pager";
    case "uan":
      return "acceso universal";
    case "voicemail":
      return "buzón";
    default:
      return "sin clasificar";
  }
}

export function planStats(): { territoryCount: number; source: string; doctrine: string } {
  return { territoryCount: PLAN.territoryCount, source: PLAN.source, doctrine: PLAN.doctrine };
}
