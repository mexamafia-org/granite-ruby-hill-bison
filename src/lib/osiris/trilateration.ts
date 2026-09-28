import { fromLocalMeters, haversineM, localMeters } from "./geo.ts";
import type { GeoPoint, TowerObservation, TrilaterationResult } from "./types.ts";

function invert2(a: number, b: number, c: number, d: number): [number, number, number, number] | null {
  const det = a * d - b * c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  return [d * inv, -b * inv, -c * inv, a * inv];
}

function circleCircle(
  a: { x: number; y: number; r: number },
  b: { x: number; y: number; r: number },
): { x: number; y: number }[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return [];
  if (d > a.r + b.r + 1 || d < Math.abs(a.r - b.r) - 1) return [];
  const dClamped = Math.max(d, 1e-6);
  const ex = dx / dClamped;
  const ey = dy / dClamped;
  const x = (a.r * a.r - b.r * b.r + dClamped * dClamped) / (2 * dClamped);
  const y2 = a.r * a.r - x * x;
  const h = y2 > 0 ? Math.sqrt(y2) : 0;
  const px = a.x + x * ex;
  const py = a.y + x * ey;
  if (h < 1) return [{ x: px, y: py }];
  return [
    { x: px + h * ey, y: py - h * ex },
    { x: px - h * ey, y: py + h * ex },
  ];
}

function empty(reason: string, used: number, status: TrilaterationResult["status"] = "INSUFFICIENT_DATA"): TrilaterationResult {
  return {
    status,
    position: null,
    intersectionPoints: [],
    intersectionPolygon: null,
    method: "none",
    confidence: "NONE",
    accuracyM: null,
    residualsM: null,
    reason,
    usedObservations: used,
  };
}

/**
 * Planar least-squares trilateration. Never averages tower centroids.
 * A single tower is infrastructure, not a UE fix.
 */
export function estimateFromObservations(observations: TowerObservation[]): TrilaterationResult {
  const usable = observations.filter(
    (o) =>
      Number.isFinite(o.tower.lat) &&
      Number.isFinite(o.tower.lon) &&
      o.rangeM != null &&
      o.rangeM > 0,
  );
  if (usable.length === 0) {
    return empty("Sin radios publicados. POSICIÓN NO DETERMINABLE.", 0);
  }
  if (usable.length === 1) {
    return {
      status: "INSUFFICIENT_DATA",
      position: null,
      intersectionPoints: [],
      intersectionPolygon: null,
      method: "tower_association",
      confidence: "NONE",
      accuracyM: null,
      residualsM: null,
      reason:
        "Una sola torre con radio publicado es infraestructura. No se coloca el UE en el mástil ni en el centroide. POSICIÓN NO DETERMINABLE.",
      usedObservations: 1,
    };
  }

  const origin: GeoPoint = {
    lat: usable.reduce((s, o) => s + o.tower.lat, 0) / usable.length,
    lon: usable.reduce((s, o) => s + o.tower.lon, 0) / usable.length,
  };
  const locals = usable.map((o) => {
    const p = localMeters(origin, { lat: o.tower.lat, lon: o.tower.lon });
    return { ...p, r: o.rangeM as number };
  });

  if (usable.length === 2) {
    const pts = circleCircle(locals[0], locals[1]).map((p) => fromLocalMeters(origin, p.x, p.y));
    if (pts.length === 0) {
      return empty(
        "Dos círculos de cobertura no se intersectan con los radios publicados. POSICIÓN NO DETERMINABLE.",
        2,
      );
    }
    if (pts.length === 1) {
      return {
        status: "POSITION_CALCULATED",
        position: pts[0],
        intersectionPoints: pts,
        intersectionPolygon: null,
        method: "circle_intersection",
        confidence: "LOW",
        accuracyM: Math.max(locals[0].r, locals[1].r),
        residualsM: [0],
        reason: "Tangencia de dos radios publicados. Confianza baja: geometría degenerada.",
        usedObservations: 2,
      };
    }
    return {
      status: "REGION_ONLY",
      position: null,
      intersectionPoints: pts,
      intersectionPolygon: null,
      method: "circle_intersection",
      confidence: "LOW",
      accuracyM: null,
      residualsM: null,
      reason:
        "Dos radios publicados producen ambigüedad de dos puntos. No se elige un centroide. POSICIÓN NO DETERMINABLE.",
      usedObservations: 2,
    };
  }

  const n = locals.length - 1;
  const A: number[][] = [];
  const b: number[] = [];
  const last = locals[n];
  for (let i = 0; i < n; i++) {
    const pi = locals[i];
    A.push([2 * (pi.x - last.x), 2 * (pi.y - last.y)]);
    b.push(pi.r * pi.r - last.r * last.r - pi.x * pi.x + last.x * last.x - pi.y * pi.y + last.y * last.y);
  }
  let ata00 = 0,
    ata01 = 0,
    ata11 = 0,
    atb0 = 0,
    atb1 = 0;
  for (let i = 0; i < A.length; i++) {
    const [a0, a1] = A[i];
    ata00 += a0 * a0;
    ata01 += a0 * a1;
    ata11 += a1 * a1;
    atb0 += a0 * b[i];
    atb1 += a1 * b[i];
  }
  const inv = invert2(ata00, ata01, ata01, ata11);
  if (!inv) {
    return empty(
      "Geometría colineal: el sistema Ax=b no es invertible. POSICIÓN NO DETERMINABLE.",
      usable.length,
      "COLINEAR_FAIL",
    );
  }
  const x = inv[0] * atb0 + inv[1] * atb1;
  const y = inv[2] * atb0 + inv[3] * atb1;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return empty("Solución no numérica. POSICIÓN NO DETERMINABLE.", usable.length);
  }
  const position = fromLocalMeters(origin, x, y);
  const residuals = usable.map((o) => Math.abs(haversineM(position, { lat: o.tower.lat, lon: o.tower.lon }) - (o.rangeM as number)));
  const rms = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length);
  const meanR = locals.reduce((s, p) => s + p.r, 0) / locals.length;
  const ratio = rms / Math.max(meanR, 1);
  const confidence: TrilaterationResult["confidence"] =
    ratio < 0.25 ? "HIGH" : ratio < 0.6 ? "MEDIUM" : "LOW";
  return {
    status: "POSITION_CALCULATED",
    position,
    intersectionPoints: [],
    intersectionPolygon: null,
    method: "trilateration",
    confidence,
    accuracyM: Math.round(rms),
    residualsM: residuals.map((r) => Math.round(r)),
    reason: `Trilateración planar con ${usable.length} radios publicados (RMS ${Math.round(rms)} m).`,
    usedObservations: usable.length,
  };
}
