/** A published open access point. Coordinates belong to the network, not to a phone. */

export interface PublicWifiAp {
  bssid: string;
  ssid: string | null;
  lat: number;
  lon: number;
  encryption: "none";
  lastUpdate: string | null;
  source: "WiGLE";
}

export function normalizeBssid(raw: string): string | null {
  const hex = raw.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (hex.length !== 12) return null;
  return hex.match(/.{2}/g)!.join(":");
}

export function isOpenEncryption(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const v = value.trim().toLowerCase();
  return v === "none" || v === "open";
}

/** Keep a WiGLE row only when it is an open network with a real published point. */
export function apFromWigle(row: unknown): PublicWifiAp | null {
  if (!row || typeof row !== "object") return null;
  const rec = row as Record<string, unknown>;
  if (!isOpenEncryption(rec.encryption)) return null;
  const bssid = typeof rec.netid === "string" ? normalizeBssid(rec.netid) : null;
  const lat = typeof rec.trilat === "number" ? rec.trilat : Number(rec.trilat);
  const lon = typeof rec.trilong === "number" ? rec.trilong : Number(rec.trilong);
  if (!bssid || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  if (lat === 0 && lon === 0) return null;
  const ssid = typeof rec.ssid === "string" && rec.ssid.trim() ? rec.ssid.trim() : null;
  const lastUpdate = typeof rec.lastupdt === "string" && rec.lastupdt.trim() ? rec.lastupdt : null;
  return { bssid, ssid, lat, lon, encryption: "none", lastUpdate, source: "WiGLE" };
}
