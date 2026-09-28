import type { CellTower, CompactTowerRow } from "./types.ts";
import { countryOfMcc, operatorOf } from "./operators.ts";

export const CATALOG_MIN_ZOOM = 9;
export const CATALOG_LIVE_MIN_ZOOM = 13;
export const MAX_LIVE_AREA_KM2 = 80;
export const GRID_STEP = 0.5;
export const CGI_BUCKETS = 256;

export function fnvBucket(parts: Array<string | number>, buckets = CGI_BUCKETS): number {
  let h = 2166136261;
  const s = parts.join("-");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % buckets;
}

export function gridKey(lat: number, lon: number, step = GRID_STEP): string {
  const glat = Math.floor(lat / step) * step;
  const glon = Math.floor(lon / step) * step;
  const fmt = (n: number) => (Object.is(n, -0) ? "-0.0" : n.toFixed(1));
  return `${fmt(glat)}_${fmt(glon)}`;
}

export function gridKeysForBbox(
  west: number,
  south: number,
  east: number,
  north: number,
  step = GRID_STEP,
): string[] {
  const keys: string[] = [];
  const lat0 = Math.floor(south / step) * step;
  const lon0 = Math.floor(west / step) * step;
  for (let lat = lat0; lat <= north + 1e-9; lat += step) {
    for (let lon = lon0; lon <= east + 1e-9; lon += step) {
      keys.push(gridKey(lat, lon, step));
    }
  }
  return keys;
}

export function towerFromRow(
  row: CompactTowerRow,
  origin: CellTower["origin"] = "catalog",
  cellPublished = true,
): CellTower {
  const [radio, mcc, net, area, cell, lat, lon, range, samples, created, updated] = row;
  return {
    id: cellPublished ? `ocid:${mcc}-${net}-${area}-${cell}` : `ocid-area:${mcc}-${net}-${area}:${lat},${lon}`,
    radio,
    mcc,
    net,
    area,
    cell,
    lat,
    lon,
    rangeM: range,
    samples,
    created,
    updated,
    source: "OpenCellID",
    origin,
    cellPublished,
    operator: operatorOf(mcc, net),
    country: countryOfMcc(mcc),
  };
}

export function mergePreferCgi(lists: CellTower[][]): CellTower[] {
  const byId = new Map<string, CellTower>();
  for (const list of lists) {
    for (const t of list) {
      const prev = byId.get(t.id);
      if (!prev) {
        byId.set(t.id, t);
        continue;
      }
      const prefer =
        (t.cellPublished !== false && prev.cellPublished === false) ||
        (t.origin === "catalog" && prev.origin === "live" && t.cellPublished !== false);
      if (prefer) byId.set(t.id, t);
    }
  }
  return [...byId.values()];
}
