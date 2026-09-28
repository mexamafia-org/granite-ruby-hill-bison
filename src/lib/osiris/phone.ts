import type { PhoneNumberInfo } from "./types.ts";
import { mxAreaLabel } from "./operators.ts";
import { matchNumberingPlan } from "./phone-plan.ts";

export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

function emptyPhone(raw: string, digits: string): PhoneNumberInfo {
  return {
    raw,
    digits,
    e164: null,
    country: null,
    countryCode: null,
    nationalNumber: null,
    areaCode: null,
    areaLabel: null,
    possibleOperator: null,
    numberType: null,
    planValid: false,
    planSource: null,
    formattedNational: null,
    formattedInternational: null,
  };
}

/**
 * Strip historic Mexican dialling tokens removed from the plan in August 2019
 * but still seen in records: 01, 044, 045, and the +52 1 mobile token.
 */
function stripHistoricMx(digits: string): string {
  if (digits.startsWith("521") && digits.length === 13) return `52${digits.slice(3)}`;
  if (digits.startsWith("52") && digits.length === 12) return digits;
  if (digits.startsWith("044") && digits.length === 13) return digits.slice(3);
  if (digits.startsWith("045") && digits.length === 13) return digits.slice(3);
  if (digits.startsWith("01") && digits.length === 12) return digits.slice(2);
  return digits;
}

export function parsePhoneNumber(raw: string): PhoneNumberInfo {
  const trimmed = raw.trim();
  let digits = digitsOnly(trimmed);
  if (!digits) return emptyPhone(trimmed, "");

  if (digits.startsWith("00")) digits = digits.slice(2);

  const international = trimmed.startsWith("+") || digitsOnly(trimmed).startsWith("00");
  digits = stripHistoricMx(digits);

  const plan = matchNumberingPlan(digits, { international });
  if (!plan) {
    return {
      ...emptyPhone(trimmed, digits),
      e164: digits.length >= 8 ? `+${digits}` : null,
    };
  }

  const nationalNumber = plan.national;
  const countryCode = plan.territory.cc;
  const e164 = `+${plan.e164Digits}`;

  let areaCode: string | null = null;
  let areaLabel: string | null = null;
  if (countryCode === "52") {
    const area = mxAreaLabel(nationalNumber);
    if (area) {
      areaCode = area.areaCode;
      areaLabel = area.areaLabel;
    }
  }

  return {
    raw: trimmed,
    digits: plan.e164Digits,
    e164,
    country: plan.territory.name,
    countryCode,
    nationalNumber,
    areaCode,
    areaLabel,
    possibleOperator: null,
    numberType: plan.numberType,
    planValid: plan.valid,
    planSource: "libphonenumber",
    formattedNational: plan.formattedNational,
    formattedInternational: plan.formattedInternational,
  };
}

export function parseCgiQuery(raw: string): {
  mcc: number;
  net: number;
  area: number;
  cell: number;
} | null {
  const parts = raw
    .trim()
    .split(/[^\d]+/)
    .filter(Boolean)
    .map((n) => Number(n));
  if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
    const [mcc, net, area, cell] = parts;
    return { mcc, net, area, cell };
  }
  return null;
}

export type { NumberPlanType } from "./types.ts";
