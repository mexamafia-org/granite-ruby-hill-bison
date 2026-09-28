import type { GeoPoint } from "./types.ts";

const R = 6371000;

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function haversineM(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function destination(origin: GeoPoint, bearingDeg: number, distM: number): GeoPoint {
  const br = toRad(bearingDeg);
  const lat1 = toRad(origin.lat);
  const lon1 = toRad(origin.lon);
  const ang = distM / R;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(ang) + Math.cos(lat1) * Math.sin(ang) * Math.cos(br),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(br) * Math.sin(ang) * Math.cos(lat1),
      Math.cos(ang) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: toDeg(lat2), lon: ((toDeg(lon2) + 540) % 360) - 180 };
}

export function bboxAreaKm2(west: number, south: number, east: number, north: number): number {
  const midLat = (south + north) / 2;
  const heightM = haversineM({ lat: south, lon: west }, { lat: north, lon: west });
  const widthM = haversineM({ lat: midLat, lon: west }, { lat: midLat, lon: east });
  return (heightM * widthM) / 1_000_000;
}

export function localMeters(origin: GeoPoint, p: GeoPoint): { x: number; y: number } {
  const lat0 = toRad(origin.lat);
  const x = toRad(p.lon - origin.lon) * Math.cos(lat0) * R;
  const y = toRad(p.lat - origin.lat) * R;
  return { x, y };
}

export function fromLocalMeters(origin: GeoPoint, x: number, y: number): GeoPoint {
  const lat0 = toRad(origin.lat);
  return {
    lat: origin.lat + toDeg(y / R),
    lon: origin.lon + toDeg(x / (R * Math.cos(lat0))),
  };
}
