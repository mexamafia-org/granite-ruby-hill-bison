import type { CellTower } from "./types.ts";
import { countryOfMcc, operatorOf } from "./operators.ts";
import { bboxAreaKm2 } from "./geo.ts";
import { MAX_LIVE_AREA_KM2 } from "./catalog.ts";

const UA = "Mozilla/5.0 (compatible; OSIRIS-Locator/1.0; evidence-strict OpenCellID consumer)";
const SEARCH = "https://opencellid.org/ajax/searchCell.php";
const AREA = "https://www.opencellid.org/ajax/getCells.php";
const OFFICIAL_GET = "https://opencellid.org/cell/get";
const OFFICIAL_AREA = "https://opencellid.org/cell/getInArea";

function apiKey(): string | null {
  const k = process.env.OPENCELLID_API_KEY;
  return k && k.length > 8 ? k : null;
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function towerFromLive(
  rec: Record<string, unknown>,
  origin: CellTower["origin"] = "live",
): CellTower | null {
  const lat = num(rec.lat);
  const lon = num(rec.lon ?? rec.lng);
  const mcc = num(rec.mcc);
  const net = num(rec.mnc ?? rec.net);
  const area = num(rec.lac ?? rec.area);
  if (lat == null || lon == null || mcc == null || net == null || area == null) return null;
  const cellRaw = rec.cellid ?? rec.cell_id ?? rec.cell ?? rec.cid;
  const cellPublished = cellRaw != null && String(cellRaw) !== "" && Number.isFinite(Number(cellRaw));
  const cell = cellPublished ? Number(cellRaw) : 0;
  const range = num(rec.range ?? rec.rangeM);
  const samples = num(rec.samples ?? rec.nbSamples) ?? 0;
  return {
    id: cellPublished
      ? `ocid:${mcc}-${net}-${area}-${cell}`
      : `ocid-area:${mcc}-${net}-${area}:${lat},${lon}`,
    radio: String(rec.radio ?? rec.rat ?? "UNKNOWN"),
    mcc,
    net,
    area,
    cell,
    lat,
    lon,
    rangeM: range,
    samples,
    created: num(rec.created),
    updated: num(rec.updated),
    source: "OpenCellID",
    origin,
    cellPublished,
    operator: operatorOf(mcc, net),
    country: countryOfMcc(mcc),
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json,text/plain,*/*",
      "User-Agent": UA,
      Referer: "https://www.opencellid.org/",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return null;
  const text = await res.text();
  if (!text || text.trim() === "0" || text.trim() === "null") return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function liveLookupCgi(q: {
  mcc: number;
  net: number;
  area: number;
  cell: number;
}): Promise<CellTower | null> {
  const key = apiKey();
  if (key) {
    const url = `${OFFICIAL_GET}?key=${encodeURIComponent(key)}&mcc=${q.mcc}&mnc=${q.net}&lac=${q.area}&cellid=${q.cell}&format=json`;
    const json = await fetchJson(url);
    if (json && typeof json === "object" && !Array.isArray(json)) {
      const rec = json as Record<string, unknown>;
      if (rec.lat != null && rec.error == null) {
        return towerFromLive({ ...rec, mcc: rec.mcc ?? q.mcc, mnc: rec.mnc ?? q.net, lac: rec.lac ?? q.area, cellid: rec.cellid ?? q.cell });
      }
    }
  }
  const ajax = `${SEARCH}?mcc=${q.mcc}&mnc=${q.net}&lac=${q.area}&cell_id=${q.cell}`;
  const json = await fetchJson(ajax);
  if (!json || json === "Invalid Request") return null;
  if (typeof json === "object" && json !== null) {
    const rec = json as Record<string, unknown>;
    if (typeof rec === "string") return null;
    return towerFromLive({
      ...rec,
      mcc: rec.mcc ?? q.mcc,
      mnc: rec.mnc ?? q.net,
      lac: rec.lac ?? q.area,
      cellid: rec.cellid ?? rec.cell_id ?? q.cell,
    });
  }
  return null;
}

export async function liveLookupArea(bbox: {
  west: number;
  south: number;
  east: number;
  north: number;
}): Promise<{ towers: CellTower[]; reason: string; truncated: boolean }> {
  const km2 = bboxAreaKm2(bbox.west, bbox.south, bbox.east, bbox.north);
  if (km2 > MAX_LIVE_AREA_KM2) {
    return {
      towers: [],
      truncated: false,
      reason: `Área ${km2.toFixed(0)} km² supera el máximo de ${MAX_LIVE_AREA_KM2} km² para la API de recuadro. Acerca el zoom.`,
    };
  }
  const key = apiKey();
  if (key) {
    const official = `${OFFICIAL_AREA}?key=${encodeURIComponent(key)}&BBOX=${bbox.south},${bbox.west},${bbox.north},${bbox.east}&format=json&limit=200`;
    const json = await fetchJson(official);
    const cells = extractCells(json);
    if (cells.length) {
      return {
        towers: cells,
        truncated: cells.length >= 200,
        reason: `${cells.length} celdas OpenCellID (API oficial) en el recuadro.`,
      };
    }
  }
  const ajax = `${AREA}?bbox=${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
  const json = await fetchJson(ajax);
  const cells = extractCells(json);
  return {
    towers: cells,
    truncated: cells.length >= 200,
    reason: cells.length
      ? `${cells.length} celdas OpenCellID (API comunitaria) en el recuadro. CID no publicado no se inventa.`
      : "La API de recuadro no devolvió celdas para este BBOX.",
  };
}

function extractCells(json: unknown): CellTower[] {
  if (!json) return [];
  const out: CellTower[] = [];
  if (typeof json === "object" && json !== null && Array.isArray((json as { features?: unknown[] }).features)) {
    for (const f of (json as { features: Array<Record<string, unknown>> }).features) {
      if (!f || typeof f !== "object") continue;
      const props = (f.properties ?? {}) as Record<string, unknown>;
      const geom = f.geometry as { type?: string; coordinates?: number[] } | undefined;
      const coords = geom?.coordinates;
      const rec: Record<string, unknown> = { ...props };
      if (Array.isArray(coords) && coords.length >= 2) {
        rec.lon = rec.lon ?? coords[0];
        rec.lat = rec.lat ?? coords[1];
      }
      const t = towerFromLive(rec);
      if (t) out.push(t);
    }
    return out;
  }
  const list: unknown[] = Array.isArray(json)
    ? json
    : json && typeof json === "object" && Array.isArray((json as { cells?: unknown[] }).cells)
      ? (json as { cells: unknown[] }).cells
      : [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const t = towerFromLive(item as Record<string, unknown>);
    if (t) out.push(t);
  }
  return out;
}

export function liveAreaTooLarge(km2: number): boolean {
  return km2 > MAX_LIVE_AREA_KM2;
}
