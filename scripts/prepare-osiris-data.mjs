#!/usr/bin/env node
/**
 * Tile OpenCellID MCC 334 extract into static CGI / LAC / grid shards.
 * Coordinates come only from the source file. Nothing is invented.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_CANDIDATES = [
  path.join(ROOT, "attachments", "334.json"),
  path.join("/home/workdir/attachments", "334.json"),
];
const OUT = path.join(ROOT, "public", "data", "ocid");
const STEP = 0.5;
const BUCKETS = 256;

function num(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function fnvBucket(parts) {
  let h = 2166136261;
  const s = parts.join("-");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % BUCKETS;
}

function gridKey(lat, lon) {
  const glat = Math.floor(lat / STEP) * STEP;
  const glon = Math.floor(lon / STEP) * STEP;
  const fmt = (n) => (Object.is(n, -0) ? "-0.0" : n.toFixed(1));
  return `${fmt(glat)}_${fmt(glon)}`;
}

function rowOf(cell) {
  const lat = num(cell.lat);
  const lon = num(cell.lon);
  const mcc = num(cell.mcc);
  const net = num(cell.net);
  const area = num(cell.area);
  const cid = num(cell.cell);
  if (lat == null || lon == null || mcc == null || net == null || area == null || cid == null) {
    return null;
  }
  const range = num(cell.range);
  return [
    String(cell.radio || "UNKNOWN"),
    mcc,
    net,
    area,
    cid,
    lat,
    lon,
    range,
    num(cell.samples) ?? 0,
    num(cell.created),
    num(cell.updated),
  ];
}

const src = SRC_CANDIDATES.find((p) => fs.existsSync(p));
if (!src) {
  console.error("[ocid] 334.json not found");
  process.exit(1);
}

console.log("[ocid] reading", src);
const raw = JSON.parse(fs.readFileSync(src, "utf8"));
if (!Array.isArray(raw)) {
  console.error("[ocid] expected JSON array");
  process.exit(1);
}

const cgi = Array.from({ length: BUCKETS }, () => []);
const lac = Array.from({ length: BUCKETS }, () => []);
const grid = new Map();
const radioCounts = Object.create(null);
let minLat = 90,
  maxLat = -90,
  minLon = 180,
  maxLon = -180;
let kept = 0;
let dropped = 0;

for (const cell of raw) {
  const row = rowOf(cell);
  if (!row) {
    dropped += 1;
    continue;
  }
  const [radio, mcc, net, area, , lat, lon] = row;
  radioCounts[radio] = (radioCounts[radio] || 0) + 1;
  cgi[fnvBucket([mcc, net, area, row[4]])].push(row);
  lac[fnvBucket([mcc, net, area])].push(row);
  const gk = gridKey(lat, lon);
  const bucket = grid.get(gk);
  if (bucket) bucket.push(row);
  else grid.set(gk, [row]);
  if (lat < minLat) minLat = lat;
  if (lat > maxLat) maxLat = lat;
  if (lon < minLon) minLon = lon;
  if (lon > maxLon) maxLon = lon;
  kept += 1;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "cgi"), { recursive: true });
fs.mkdirSync(path.join(OUT, "lac"), { recursive: true });
fs.mkdirSync(path.join(OUT, "grid"), { recursive: true });

for (let i = 0; i < BUCKETS; i++) {
  fs.writeFileSync(path.join(OUT, "cgi", `${i}.json`), JSON.stringify(cgi[i]));
  fs.writeFileSync(path.join(OUT, "lac", `${i}.json`), JSON.stringify(lac[i]));
}
for (const [key, rows] of grid) {
  fs.writeFileSync(path.join(OUT, "grid", `${key}.json`), JSON.stringify(rows));
}

const meta = {
  catalog: "OpenCellID MCC 334",
  sourceFile: "334.json",
  doctrine: "Published coordinates only. Never invent a tower, CID, or radius.",
  towerCount: kept,
  dropped,
  radioCounts,
  bounds: { minLat, maxLat, minLon, maxLon },
  gridStep: STEP,
  buckets: BUCKETS,
  gridTiles: grid.size,
};

fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify(meta));
fs.writeFileSync(
  path.join(ROOT, "public", "data", "phone-evidence.json"),
  JSON.stringify({}),
);

console.log(
  `[ocid] ${kept} cells · ${grid.size} grid tiles · ${BUCKETS} cgi/lac buckets → ${OUT}`,
);
