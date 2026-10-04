/** A received sample, stored with the clock time of registration. No coordinates are added. */

export interface MeasurementCell {
  mcc: number;
  net: number;
  area: number;
  cell: number;
  measuredAt: string | null;
  rangeM: number | null;
}

export interface MeasurementRecord {
  id: string;
  /** Exact time this file was written. Not a radio measurement. */
  registeredAt: string;
  /** Time carried by the sample. Null if the sample did not include one. */
  measuredAt: string | null;
  /** Digits the sample already carried. Null if it named no phone. */
  phoneDigits: string | null;
  origin: string | null;
  cells: MeasurementCell[];
}

function iso(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Build a record from a sample. Drops anything the sample did not actually contain. */
export function buildMeasurementRecord(sample: unknown, registeredAt: string): MeasurementRecord | null {
  if (!sample || typeof sample !== "object") return null;
  const row = sample as Record<string, unknown>;
  if (typeof row.id !== "string" || row.id.trim() === "") return null;
  const registered = iso(registeredAt);
  if (!registered) return null;

  const cells: MeasurementCell[] = [];
  if (Array.isArray(row.cells)) {
    for (const item of row.cells) {
      if (!item || typeof item !== "object") continue;
      const c = item as Record<string, unknown>;
      const mcc = num(c.mcc);
      const net = num(c.net);
      const area = num(c.area);
      const cell = num(c.cell);
      if (mcc == null || net == null || area == null || cell == null) continue;
      cells.push({
        mcc,
        net,
        area,
        cell,
        measuredAt: iso(c.measuredAt),
        rangeM: num(c.rangeM),
      });
    }
  }

  const carried = [iso(row.measuredAt), ...cells.map((c) => c.measuredAt)].filter((v): v is string => Boolean(v));
  carried.sort();
  const digits = typeof row.phoneDigits === "string" ? row.phoneDigits.replace(/\D/g, "") : "";

  return {
    id: row.id,
    registeredAt: registered,
    measuredAt: carried.at(-1) ?? null,
    phoneDigits: digits.length >= 8 ? digits : null,
    origin: typeof row.origin === "string" ? row.origin : null,
    cells,
  };
}
