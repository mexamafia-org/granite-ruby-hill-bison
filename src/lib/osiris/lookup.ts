import { estimateFromObservations } from "./trilateration.ts";
import { parseOcidQuery } from "./ocid-query.ts";
import { parsePhoneNumber } from "./phone.ts";
import type {
  CellTower,
  KmlFeature,
  LiveTelemetrySample,
  LookupResult,
  TowerObservation,
  TrilaterationResult,
} from "./types.ts";
import { STRICT_EVIDENCE_MODE } from "./types.ts";

export interface PhoneEvidenceRecord {
  digits: string;
  sources: string[];
  kmlFeatureIds: string[];
  notes: string[];
}

export interface LookupContext {
  kmlFeatures: KmlFeature[];
  phoneEvidence: Record<string, PhoneEvidenceRecord>;
  liveTelemetry: LiveTelemetrySample[];
  catalogTowersByCgi: CellTower[];
  selectedTowers: TowerObservation[];
}

const INFRA_DISCLAIMER =
  "Esta posición corresponde a infraestructura celular conocida; no representa necesariamente la posición actual del dispositivo.";

const KML_DISCLAIMER =
  "Las coordenadas KML son anotación humana de la capa KML INFRASTRUCTURE. No son un fix GPS del dispositivo ni una torre asociada.";

function latestTelemetry(
  samples: LiveTelemetrySample[],
  digits: string,
): LiveTelemetrySample | null {
  const hits = samples
    .filter((s) => s.phoneDigits === digits)
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  return hits[0] ?? null;
}

/**
 * sampleDigits: identificador telefónico que ya trae la muestra. null = no hay.
 * phone.digits: dígitos E.164 normalizados de un número real.
 * phone.nationalNumber: número nacional completo, si el plan lo produjo.
 * Solo igualdad exacta. Sin subcadenas, proximidad ni datos de torre.
 */
export function telemetryMatchesPhone(
  sampleDigits: string | null | undefined,
  phone: { digits: string; nationalNumber: string | null },
): boolean {
  const sample = (sampleDigits ?? "").replace(/\D/g, "");
  if (sample.length < 8) return false;
  const e164 = phone.digits.replace(/\D/g, "");
  const national = (phone.nationalNumber ?? "").replace(/\D/g, "");
  if (e164.length >= 8 && sample === e164) return true;
  if (national.length >= 8 && sample === national) return true;
  return false;
}

/** VoIP solo si quien produjo la muestra marcó origin "voip". El id no cuenta. */
export function isVoipSample(sample: { origin?: string | null }): boolean {
  return sample.origin === "voip";
}

export function lookupTarget(rawQuery: string, ctx: LookupContext): LookupResult {
  const queriedAt = new Date().toISOString();
  const ocid = parseOcidQuery(rawQuery);
  if (ocid?.kind === "cell") return lookupCgi(rawQuery, ocid, ctx, queriedAt);
  if (ocid?.kind === "lac") return lookupLac(rawQuery, ocid, ctx, queriedAt);
  return lookupPhone(rawQuery, ctx, queriedAt);
}

function basePhoneResult(
  raw: string,
  queriedAt: string,
  extras: Partial<LookupResult> & Pick<LookupResult, "reason" | "disclaimer">,
  phoneOverride?: LookupResult["phone"],
): LookupResult {
  const phone = phoneOverride ?? parsePhoneNumber(raw);
  const trilateration = extras.trilateration ?? {
    status: "INSUFFICIENT_DATA" as const,
    position: null,
    intersectionPoints: [],
    intersectionPolygon: null,
    method: "none" as const,
    confidence: "NONE" as const,
    accuracyM: null,
    residualsM: null,
    reason: extras.reason,
    usedObservations: 0,
  };
  return {
    queriedAt,
    phone,
    strictMode: STRICT_EVIDENCE_MODE,
    positionKind: extras.positionKind ?? "NOT_DETERMINED",
    estimatedPosition: extras.estimatedPosition ?? null,
    method: extras.method ?? "none",
    confidence: extras.confidence ?? "NONE",
    source: extras.source ?? "unknown",
    sources: extras.sources ?? [],
    lastUpdate: extras.lastUpdate ?? null,
    associatedTowers: extras.associatedTowers ?? [],
    kmlFeatures: extras.kmlFeatures ?? [],
    trilateration,
    liveTelemetry: extras.liveTelemetry ?? null,
    disclaimer: extras.disclaimer,
    reason: extras.reason,
    waitingForLiveTelemetry: extras.waitingForLiveTelemetry ?? true,
  };
}

const EMPTY_PHONE: LookupResult["phone"] = {
  raw: "análisis de infraestructura",
  digits: "",
  e164: null,
  country: null,
  countryCode: null,
  nationalNumber: null,
  areaCode: null,
  areaLabel: null,
  possibleOperator: null,
  numberType: null,
  planValid: false,
  planSource: null,
  formattedNational: null,
  formattedInternational: null,
};

export function lookupSelectedInfrastructure(ctx: LookupContext): LookupResult {
  const queriedAt = new Date().toISOString();
  const observations = ctx.selectedTowers.filter((o) => o.relationshipToUe === "USER_SELECTED");
  if (observations.length === 0) {
    return basePhoneResult(
      "análisis de infraestructura",
      queriedAt,
      {
        reason: "No hay torres seleccionadas para intersección. POSICIÓN NO DETERMINABLE.",
        disclaimer: INFRA_DISCLAIMER,
      },
      EMPTY_PHONE,
    );
  }
  const tri = estimateFromObservations(observations);
  return basePhoneResult(
    "análisis de infraestructura",
    queriedAt,
    {
      positionKind: tri.position ? "ESTIMATED_POSITION" : observations.length === 1 ? "INFRASTRUCTURE" : "NOT_DETERMINED",
      estimatedPosition: tri.position,
      method: tri.method,
      confidence: tri.confidence,
      source: "OpenCellID",
      sources: ["OpenCellID"],
      lastUpdate: null,
      associatedTowers: observations,
      kmlFeatures: [],
      trilateration: tri,
      waitingForLiveTelemetry: true,
      disclaimer: INFRA_DISCLAIMER,
      reason: tri.reason,
    },
    EMPTY_PHONE,
  );
}

function lookupCgi(
  raw: string,
  cgi: { mcc: number; net: number; area: number; cell: number },
  ctx: LookupContext,
  queriedAt: string,
): LookupResult {
  const tower = ctx.catalogTowersByCgi.find(
    (t) => t.mcc === cgi.mcc && t.net === cgi.net && t.area === cgi.area && t.cell === cgi.cell,
  );
  if (!tower) {
    return basePhoneResult(raw, queriedAt, {
      reason: `CGI ${cgi.mcc}-${cgi.net}-${cgi.area}-${cgi.cell} no aparece en el catálogo MCC 334 ni en la API OpenCellID. POSICIÓN NO DETERMINABLE.`,
      disclaimer: "La consulta de Cell ID no se completa con coordenadas genéricas.",
      waitingForLiveTelemetry: true,
    });
  }

  const obs: TowerObservation = {
    tower,
    rangeM: tower.rangeM,
    rssiDbm: null,
    rsrpDbm: null,
    rsrqDb: null,
    sinrDb: null,
    measuredAt: null,
    relationshipToUe: "INFRASTRUCTURE_ONLY",
    source: "OpenCellID",
  };
  const tri = estimateFromObservations([obs]);
  const lastUpdate = tower.updated ? new Date(tower.updated * 1000).toISOString() : null;
  return basePhoneResult(
    raw,
    queriedAt,
    {
      positionKind: "INFRASTRUCTURE",
      estimatedPosition: null,
      method: "tower_association",
      confidence: "NONE",
      source: "OpenCellID",
      sources: ["OpenCellID"],
      lastUpdate,
      associatedTowers: [obs],
      kmlFeatures: [],
      trilateration: tri,
      waitingForLiveTelemetry: true,
      disclaimer: INFRA_DISCLAIMER,
      reason: `CGI ${cgi.mcc}-${cgi.net}-${cgi.area}-${cgi.cell} resuelto como infraestructura ${tower.origin === "live" ? "en vivo" : "de catálogo"} (${tower.lat.toFixed(5)}, ${tower.lon.toFixed(5)}). No es la posición del UE.`,
    },
    infraPhone(raw, tower),
  );
}

function lookupLac(
  raw: string,
  lac: { mcc: number; net: number; area: number },
  ctx: LookupContext,
  queriedAt: string,
): LookupResult {
  const towers = ctx.catalogTowersByCgi.filter(
    (t) => t.mcc === lac.mcc && t.net === lac.net && t.area === lac.area,
  );
  if (towers.length === 0) {
    return basePhoneResult(raw, queriedAt, {
      reason: `LAC ${lac.mcc}-${lac.net}-${lac.area} sin celdas publicadas. POSICIÓN NO DETERMINABLE.`,
      disclaimer: INFRA_DISCLAIMER,
    });
  }
  const obs: TowerObservation[] = towers.map((tower) => ({
    tower,
    rangeM: tower.rangeM,
    rssiDbm: null,
    rsrpDbm: null,
    rsrqDb: null,
    sinrDb: null,
    measuredAt: null,
    relationshipToUe: "INFRASTRUCTURE_ONLY" as const,
    source: "OpenCellID" as const,
  }));
  const tri = estimateFromObservations(obs);
  return basePhoneResult(
    raw,
    queriedAt,
    {
      positionKind: "INFRASTRUCTURE",
      estimatedPosition: null,
      method: "tower_association",
      confidence: "NONE",
      source: "OpenCellID",
      sources: ["OpenCellID"],
      lastUpdate: null,
      associatedTowers: obs,
      kmlFeatures: [],
      trilateration: tri,
      waitingForLiveTelemetry: true,
      disclaimer: INFRA_DISCLAIMER,
      reason: `LAC ${lac.mcc}-${lac.net}-${lac.area}: ${towers.length} celdas de infraestructura. El área de LAC no es un fix del UE.`,
    },
    infraPhone(raw, towers[0]),
  );
}

function infraPhone(raw: string, tower: CellTower): LookupResult["phone"] {
  return {
    raw,
    digits: tower.id,
    e164: null,
    country: tower.country,
    countryCode: String(tower.mcc),
    nationalNumber: null,
    areaCode: null,
    areaLabel: null,
    possibleOperator: tower.operator,
    numberType: null,
    planValid: false,
    planSource: null,
    formattedNational: null,
    formattedInternational: null,
  };
}

function lookupPhone(raw: string, ctx: LookupContext, queriedAt: string): LookupResult {
  const phone = parsePhoneNumber(raw);
  const digits = phone.digits;
  const live = latestTelemetry(ctx.liveTelemetry, digits);
  const evidence = ctx.phoneEvidence[digits] ?? ctx.phoneEvidence[phone.nationalNumber ?? ""];
  const kmlFeatures = ctx.kmlFeatures.filter((f) =>
    f.associatedPhones.some((p) => p.replace(/\D/g, "") === digits || p === phone.e164),
  );

  const fromLiveCells: TowerObservation[] = [];
  if (live) {
    for (const c of live.cells) {
      const tower = ctx.catalogTowersByCgi.find(
        (t) => t.mcc === c.mcc && t.net === c.net && t.area === c.area && t.cell === c.cell,
      );
      if (!tower) continue;
      fromLiveCells.push({
        tower,
        rangeM: c.rangeM ?? tower.rangeM,
        rssiDbm: c.rssiDbm ?? null,
        rsrpDbm: c.rsrpDbm ?? null,
        rsrqDb: c.rsrqDb ?? null,
        sinrDb: c.sinrDb ?? null,
        measuredAt: c.measuredAt ?? live.receivedAt,
        relationshipToUe: c.relationshipToUe ?? "SIGNAL_OBSERVED",
        source: "live_telemetry",
      });
    }
  }

  if (live?.gps) {
    return basePhoneResult(raw, queriedAt, {
      positionKind: "GPS_REAL",
      estimatedPosition: { lat: live.gps.lat, lon: live.gps.lon },
      method: "gps",
      confidence: "HIGH",
      source: "GPS",
      sources: ["GPS"],
      lastUpdate: live.gps.measuredAt,
      associatedTowers: fromLiveCells,
      kmlFeatures,
      trilateration: {
        status: "POSITION_CALCULATED",
        position: { lat: live.gps.lat, lon: live.gps.lon },
        intersectionPoints: [],
        intersectionPolygon: null,
        method: "gps",
        confidence: "HIGH",
        accuracyM: live.gps.accuracyM,
        residualsM: null,
        reason: "Fix GNSS autorizado del dispositivo propio.",
        usedObservations: 0,
      },
      liveTelemetry: live,
      waitingForLiveTelemetry: false,
      disclaimer:
        "Fix GNSS autorizado del dispositivo propio. No se infiere desde código de área ni desde una torre.",
      reason: "Medición GPS real recibida por geolocalización autorizada.",
    });
  }

  if (fromLiveCells.length >= 3) {
    const tri = estimateFromObservations(fromLiveCells);
    return basePhoneResult(raw, queriedAt, {
      positionKind: tri.position ? "ESTIMATED_POSITION" : "NOT_DETERMINED",
      estimatedPosition: tri.position,
      method: tri.method,
      confidence: tri.confidence,
      source: "live_telemetry",
      sources: ["live_telemetry", "OpenCellID"],
      lastUpdate: live?.receivedAt ?? null,
      associatedTowers: fromLiveCells,
      kmlFeatures,
      trilateration: tri,
      liveTelemetry: live,
      waitingForLiveTelemetry: false,
      disclaimer: INFRA_DISCLAIMER,
      reason: tri.reason,
    });
  }

  if (fromLiveCells.length > 0) {
    const tri = estimateFromObservations(fromLiveCells);
    return basePhoneResult(raw, queriedAt, {
      positionKind: tri.position ? "ESTIMATED_POSITION" : "COVERAGE_AREA",
      estimatedPosition: tri.position,
      method: tri.method === "none" ? "tower_association" : tri.method,
      confidence: tri.confidence,
      source: "live_telemetry",
      sources: ["live_telemetry", "OpenCellID"],
      lastUpdate: live?.receivedAt ?? null,
      associatedTowers: fromLiveCells,
      kmlFeatures,
      trilateration: tri,
      liveTelemetry: live,
      waitingForLiveTelemetry: false,
      disclaimer: INFRA_DISCLAIMER,
      reason: tri.reason,
    });
  }

  if (kmlFeatures.length > 0) {
    return basePhoneResult(raw, queriedAt, {
      positionKind: "KML_ANNOTATION",
      estimatedPosition: null,
      method: "kml_annotation",
      confidence: "NONE",
      source: "KML",
      sources: ["KML"],
      lastUpdate: null,
      associatedTowers: [],
      kmlFeatures,
      liveTelemetry: live,
      waitingForLiveTelemetry: true,
      disclaimer: KML_DISCLAIMER,
      reason:
        "Hay evidencia KML asociada al número. POSICIÓN NO DETERMINABLE: la anotación no es GPS ni Cell ID. No se eligen torres por proximidad.",
    });
  }

  const notes = evidence?.notes?.join(" ") ?? "";
  return basePhoneResult(raw, queriedAt, {
    positionKind: "NOT_DETERMINED",
    estimatedPosition: null,
    method: "none",
    confidence: "NONE",
    source: "unknown",
    sources: [],
    lastUpdate: null,
    associatedTowers: [],
    kmlFeatures: [],
    liveTelemetry: live,
    waitingForLiveTelemetry: true,
    disclaimer:
      "STRICT_EVIDENCE_MODE: no se convierte el código de área en una coordenada y no se inventan torres.",
    reason: notes
      ? `${notes} POSICIÓN NO DETERMINABLE.`
      : phone.planValid
        ? `Número reconocido por el plan de numeración (${phone.country ?? "país"} · ${phone.numberType ?? "tipo desconocido"}). El plan ITU no es una coordenada. Sin CGI asociado, sin KML, sin telemetría. POSICIÓN NO DETERMINABLE.`
        : "Sin asociación celular, sin KML, sin telemetría en vivo. POSICIÓN NO DETERMINABLE.",
  });
}

function hitsToKind(tri: TrilaterationResult, count: number): LookupResult["positionKind"] {
  if (tri.position) return "ESTIMATED_POSITION";
  if (count === 1) return "INFRASTRUCTURE";
  if (tri.status === "REGION_ONLY") return "COVERAGE_AREA";
  return "NOT_DETERMINED";
}

/** Localize a user-chosen number from observations already tied to that case. */
export function lookupFromCase(
  raw: string,
  observations: TowerObservation[],
  communicationsWithoutCell: number,
  ctx: LookupContext,
): LookupResult {
  const orphan =
    communicationsWithoutCell > 0
      ? `${communicationsWithoutCell} comunicación(es) sin celda publicada: no generan coordenada. `
      : "";
  if (observations.length === 0) {
    const base = lookupPhone(raw, ctx, new Date().toISOString());
    return orphan ? { ...base, reason: `${orphan}${base.reason}` } : base;
  }
  const phone = parsePhoneNumber(raw);
  const tri = estimateFromObservations(observations);
  const latest = observations
    .map((o) => o.measuredAt)
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1) ?? null;
  return basePhoneResult(
    raw,
    new Date().toISOString(),
    {
      positionKind: hitsToKind(tri, observations.length),
      estimatedPosition: tri.position,
      method: tri.position ? tri.method : "tower_association",
      confidence: tri.confidence,
      source: "OpenCellID",
      sources: ["OpenCellID"],
      lastUpdate: latest,
      associatedTowers: observations,
      kmlFeatures: [],
      trilateration: tri,
      waitingForLiveTelemetry: tri.position == null,
      disclaimer: INFRA_DISCLAIMER,
      reason: `${orphan}${observations.length} observación(es) de torre ligadas a este número. ${tri.reason}`,
    },
    phone,
  );
}
