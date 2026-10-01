import type { CatalogMeta, CellTower, CompactTowerRow, LiveTelemetrySample } from "./types.ts";
import type { PhoneEvidenceRecord } from "./lookup.ts";
import { fnvBucket, gridKeysForBbox, towerFromRow } from "./catalog.ts";

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return (await res.json()) as T;
}

export async function fetchCatalogMeta(): Promise<CatalogMeta & { towerCount: number }> {
  return getJson<CatalogMeta>("/data/ocid/meta.json");
}

export async function fetchKmlLayer(): Promise<{ features: import("./types.ts").KmlFeature[]; documentPhones: string[] }> {
  try {
    const data = await getJson<{ features?: import("./types.ts").KmlFeature[]; documentPhones?: string[] }>(
      "/data/kml/layer.json",
    );
    return { features: data.features ?? [], documentPhones: data.documentPhones ?? [] };
  } catch {
    return { features: [], documentPhones: [] };
  }
}

export async function fetchPhoneEvidence(): Promise<Record<string, PhoneEvidenceRecord>> {
  try {
    return await getJson<Record<string, PhoneEvidenceRecord>>("/data/phone-evidence.json");
  } catch {
    return {};
  }
}

async function catalogCgi(q: {
  mcc: number;
  net: number;
  area: number;
  cell: number;
}): Promise<CellTower | null> {
  try {
    const bucket = fnvBucket([q.mcc, q.net, q.area, q.cell]);
    const rows = await getJson<CompactTowerRow[]>(`/data/ocid/cgi/${bucket}.json`);
    const row = rows.find((r) => r[1] === q.mcc && r[2] === q.net && r[3] === q.area && r[4] === q.cell);
    return row ? towerFromRow(row, "catalog", true) : null;
  } catch {
    return null;
  }
}

async function catalogLac(q: { mcc: number; net: number; area: number }): Promise<CellTower[]> {
  try {
    const bucket = fnvBucket([q.mcc, q.net, q.area]);
    const rows = await getJson<CompactTowerRow[]>(`/data/ocid/lac/${bucket}.json`);
    return rows
      .filter((r) => r[1] === q.mcc && r[2] === q.net && r[3] === q.area)
      .map((r) => towerFromRow(r, "catalog", true));
  } catch {
    return [];
  }
}

export async function queryOcidCell(q: {
  mcc: number;
  net: number;
  area: number;
  cell: number;
}): Promise<CellTower | null> {
  const local = await catalogCgi(q);
  if (local) return local;
  const params = new URLSearchParams({
    kind: "cell",
    mcc: String(q.mcc),
    net: String(q.net),
    area: String(q.area),
    cell: String(q.cell),
    live: "1",
  });
  const data = await getJson<{ tower?: CellTower | null }>(`/api/ocid?${params}`);
  return data.tower ?? null;
}

export async function queryOcidLac(q: {
  mcc: number;
  net: number;
  area: number;
}): Promise<{ towers: CellTower[]; total: number; reason: string }> {
  const towers = await catalogLac(q);
  if (towers.length) {
    return {
      towers,
      total: towers.length,
      reason: `LAC ${q.mcc}-${q.net}-${q.area}: ${towers.length} celdas de catálogo MCC 334.`,
    };
  }
  const params = new URLSearchParams({
    kind: "lac",
    mcc: String(q.mcc),
    net: String(q.net),
    area: String(q.area),
  });
  return getJson(`/api/ocid?${params}`);
}

export async function queryOcidBbox(q: {
  west: number;
  south: number;
  east: number;
  north: number;
  zoom: number;
  live?: boolean;
}): Promise<{ towers: CellTower[]; reason: string }> {
  const keys = gridKeysForBbox(q.west, q.south, q.east, q.north);
  const catalog: CellTower[] = [];
  const seen = new Set<string>();
  await Promise.all(
    keys.map(async (key) => {
      try {
        const rows = await getJson<CompactTowerRow[]>(`/data/ocid/grid/${key}.json`);
        for (const row of rows) {
          const lat = row[5];
          const lon = row[6];
          if (lat < q.south || lat > q.north || lon < q.west || lon > q.east) continue;
          const t = towerFromRow(row, "catalog", true);
          if (seen.has(t.id)) continue;
          seen.add(t.id);
          catalog.push(t);
        }
      } catch {
        /* tile may not exist */
      }
    }),
  );
  let live: CellTower[] = [];
  let liveReason = "";
  if (q.live) {
    const params = new URLSearchParams({
      kind: "bbox",
      west: String(q.west),
      south: String(q.south),
      east: String(q.east),
      north: String(q.north),
      zoom: String(q.zoom),
      live: "1",
      catalog: "0",
    });
    try {
      const data = await getJson<{ towers: CellTower[]; reason: string }>(`/api/ocid?${params}`);
      live = data.towers ?? [];
      liveReason = data.reason ?? "";
    } catch {
      liveReason = "API en vivo no disponible.";
    }
  }
  const merged = [...catalog];
  for (const t of live) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    merged.push(t);
  }
  return {
    towers: merged,
    reason: `${catalog.length} catálogo MCC 334${live.length ? ` + ${live.length} en vivo` : ""}. ${liveReason}`.trim(),
  };
}

export async function resolveOcidCells(
  cells: Array<{ mcc: number; net: number; area: number; cell: number }>,
): Promise<CellTower[]> {
  if (cells.length === 0) return [];
  const out: CellTower[] = [];
  const missing: typeof cells = [];
  for (const c of cells.slice(0, 40)) {
    const t = await catalogCgi(c);
    if (t) out.push(t);
    else missing.push(c);
  }
  if (missing.length === 0) return out;
  const data = await getJson<{ towers: CellTower[] }>("/api/ocid?kind=resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cells: missing }),
  });
  return [...out, ...(data.towers ?? [])];
}

/** Persist a real sample. Does not invent cells or coordinates. */
export async function publishTelemetry(sample: LiveTelemetrySample): Promise<void> {
  const res = await fetch("/api/telemetry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sample),
  });
  if (!res.ok) throw new Error(`Telemetría HTTP ${res.status}`);
}
