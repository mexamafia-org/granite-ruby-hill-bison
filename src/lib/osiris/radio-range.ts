/** Radii taken only from a timing-advance value that was supplied, or from a published range. */

const GSM_TA_STEP_M = 550;
const LTE_TA_STEP_M = 78.12;

/** GSM 05.10: one timing-advance step is 550 m. Returns the outer edge of that bin. */
export function gsmTaOuterM(ta: number): number | null {
  if (!Number.isInteger(ta) || ta < 0 || ta > 63) return null;
  return (ta + 1) * GSM_TA_STEP_M;
}

/** LTE: one timing-advance step is 16 Ts, about 78.12 m. Returns the outer edge of that bin. */
export function lteTaOuterM(ta: number): number | null {
  if (!Number.isInteger(ta) || ta < 0 || ta > 1282) return null;
  return (ta + 1) * LTE_TA_STEP_M;
}

export function radiusFromEvidence(input: {
  radio: string;
  ta: number | null;
  publishedRangeM: number | null;
}): { rangeM: number | null; source: "ta" | "catalog" | "none" } {
  let fromTa: number | null = null;
  if (input.ta != null && input.radio === "GSM") fromTa = gsmTaOuterM(input.ta);
  if (input.ta != null && input.radio === "LTE") fromTa = lteTaOuterM(input.ta);
  const published = input.publishedRangeM != null && input.publishedRangeM > 0 ? input.publishedRangeM : null;
  if (fromTa != null && published != null) return { rangeM: Math.min(fromTa, published), source: "ta" };
  if (fromTa != null) return { rangeM: fromTa, source: "ta" };
  if (published != null) return { rangeM: published, source: "catalog" };
  return { rangeM: null, source: "none" };
}
