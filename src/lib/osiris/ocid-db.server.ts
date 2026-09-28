import fs from "node:fs";
import path from "node:path";
import type { CatalogMeta, CellTower, CompactTowerRow } from "./types.ts";
import { fnvBucket, gridKeysForBbox, towerFromRow } from "./catalog.ts";

const ROOT = path.join(process.cwd(), "public", "data", "ocid");

function readJson<T>(file: string): T | null {
  try {
    const raw = fs.readFileSync(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadMeta(): CatalogMeta | null {
  return readJson<CatalogMeta>(path.join(ROOT, "meta.json"));
}

export function lookupCgiCatalog(q: {
  mcc: number;
  net: number;
  area: number;
  cell: number;
}): CellTower | null {
  const bucket = fnvBucket([q.mcc, q.net, q.area, q.cell]);
  const rows = readJson<CompactTowerRow[]>(path.join(ROOT, "cgi", `${bucket}.json`));
  if (!rows) return null;
  const row = rows.find(
    (r) => r[1] === q.mcc && r[2] === q.net && r[3] === q.area && r[4] === q.cell,
  );
  return row ? towerFromRow(row, "catalog", true) : null;
}

export function lookupLacCatalog(q: { mcc: number; net: number; area: number }): CellTower[] {
  const bucket = fnvBucket([q.mcc, q.net, q.area]);
  const rows = readJson<CompactTowerRow[]>(path.join(ROOT, "lac", `${bucket}.json`));
  if (!rows) return [];
  return rows
    .filter((r) => r[1] === q.mcc && r[2] === q.net && r[3] === q.area)
    .map((r) => towerFromRow(r, "catalog", true));
}

export function lookupBboxCatalog(bbox: {
  west: number;
  south: number;
  east: number;
  north: number;
}): CellTower[] {
  const keys = gridKeysForBbox(bbox.west, bbox.south, bbox.east, bbox.north);
  const out: CellTower[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    const rows = readJson<CompactTowerRow[]>(path.join(ROOT, "grid", `${key}.json`));
    if (!rows) continue;
    for (const row of rows) {
      const lat = row[5];
      const lon = row[6];
      if (lat < bbox.south || lat > bbox.north || lon < bbox.west || lon > bbox.east) continue;
      const t = towerFromRow(row, "catalog", true);
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
    }
  }
  return out;
}

export function resolveCatalogCells(
  cells: Array<{ mcc: number; net: number; area: number; cell: number }>,
): CellTower[] {
  const out: CellTower[] = [];
  const seen = new Set<string>();
  for (const c of cells) {
    const t = lookupCgiCatalog(c);
    if (!t || seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}
