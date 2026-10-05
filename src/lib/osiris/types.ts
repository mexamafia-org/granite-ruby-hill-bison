export const STRICT_EVIDENCE_MODE = true as const;

export type RadioTech = "GSM" | "UMTS" | "LTE" | "NR" | "UNKNOWN" | string;

export type Confidence = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export type EstimateMethod =
  | "trilateration"
  | "circle_intersection"
  | "tower_association"
  | "gps"
  | "kml_annotation"
  | "unknown"
  | "none";

export type DataSource =
  | "OpenCellID"
  | "dataset local"
  | "KML"
  | "GPS"
  | "medición de señal"
  | "live_telemetry"
  | "unknown";

export type CellOrigin = "catalog" | "live";

export type PositionKind =
  | "INFRASTRUCTURE"
  | "COVERAGE_AREA"
  | "ESTIMATED_POSITION"
  | "GPS_REAL"
  | "NOT_DETERMINED"
  | "KML_ANNOTATION";

export type RelationshipToUe =
  | "SERVING"
  | "NEIGHBOR_MEASURED"
  | "SIGNAL_OBSERVED"
  | "INFRASTRUCTURE_ONLY"
  | "USER_SELECTED";

export interface CellTower {
  id: string;
  radio: RadioTech;
  mcc: number;
  net: number;
  area: number;
  cell: number;
  lat: number;
  lon: number;
  rangeM: number | null;
  samples: number;
  created: number | null;
  updated: number | null;
  source: DataSource;
  origin?: CellOrigin;
  /** False when OpenCellID area query omitted Cell ID. Never invent a CID. */
  cellPublished?: boolean;
  operator: string | null;
  country: string | null;
}

export interface TowerObservation {
  tower: CellTower;
  rangeM: number | null;
  rssiDbm: number | null;
  rsrpDbm: number | null;
  rsrqDb: number | null;
  sinrDb: number | null;
  measuredAt: string | null;
  relationshipToUe: RelationshipToUe;
  source: DataSource;
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface KmlFeature {
  id: string;
  name: string;
  entityType: "RAW_KML_LOCATION" | "POI" | "LINESTRING";
  geometry:
    | { type: "Point"; coordinates: [number, number] }
    | { type: "LineString"; coordinates: [number, number][] };
  associatedPhones: string[];
  sourceFile: string;
  source: "KML";
  declaredOriginType: "HUMAN_ANNOTATION";
  authority: "GEO_EVIDENCE_SOURCE";
}

export type NumberPlanType =
  | "premiumRate"
  | "tollFree"
  | "sharedCost"
  | "personalNumber"
  | "voip"
  | "pager"
  | "uan"
  | "voicemail"
  | "mobile"
  | "fixedLine"
  | "fixed_or_mobile"
  | "unknown";

export interface PhoneNumberInfo {
  raw: string;
  digits: string;
  e164: string | null;
  country: string | null;
  countryCode: string | null;
  nationalNumber: string | null;
  areaCode: string | null;
  areaLabel: string | null;
  possibleOperator: string | null;
  /** ITU/libphonenumber classification. Not a location. */
  numberType: NumberPlanType | null;
  planValid: boolean;
  planSource: "libphonenumber" | null;
  formattedNational: string | null;
  formattedInternational: string | null;
}

export interface LiveTelemetrySample {
  id: string;
  receivedAt: string;
  phoneDigits: string | null;
  /** voip: llamada previa. interaction: torre pública sin teléfono. equipment: este navegador. measurement: medición registrada en el caso. */
  origin?: "voip" | "interaction" | "equipment" | "measurement";
  gps: {
    lat: number;
    lon: number;
    accuracyM: number | null;
    source: "GPS";
    measuredAt: string;
  } | null;
  cells: Array<{
    mcc: number;
    net: number;
    area: number;
    cell: number;
    radio?: string;
    rssiDbm?: number | null;
    rsrpDbm?: number | null;
    rsrqDb?: number | null;
    sinrDb?: number | null;
    rangeM?: number | null;
    /** Timing advance as reported. Absent means it was not measured. */
    ta?: number | null;
    relationshipToUe?: RelationshipToUe;
    measuredAt?: string;
  }>;
  source: "live_telemetry" | "GPS";
}

export interface EventLogEntry {
  id: string;
  ts: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface TrilaterationResult {
  status: "POSITION_CALCULATED" | "REGION_ONLY" | "INSUFFICIENT_DATA" | "COLINEAR_FAIL";
  position: GeoPoint | null;
  intersectionPoints: GeoPoint[];
  intersectionPolygon: [number, number][] | null;
  method: EstimateMethod;
  confidence: Confidence;
  accuracyM: number | null;
  residualsM: number[] | null;
  reason: string;
  usedObservations: number;
}

export interface LookupResult {
  queriedAt: string;
  phone: PhoneNumberInfo;
  strictMode: true;
  positionKind: PositionKind;
  estimatedPosition: GeoPoint | null;
  method: EstimateMethod;
  confidence: Confidence;
  source: DataSource | "mixed";
  sources: DataSource[];
  lastUpdate: string | null;
  associatedTowers: TowerObservation[];
  kmlFeatures: KmlFeature[];
  trilateration: TrilaterationResult;
  liveTelemetry: LiveTelemetrySample | null;
  disclaimer: string;
  reason: string;
  waitingForLiveTelemetry: boolean;
}

export const OCID_FIELDS = [
  "radio",
  "mcc",
  "net",
  "area",
  "cell",
  "lat",
  "lon",
  "range",
  "samples",
  "created",
  "updated",
] as const;

export type CompactTowerRow = [
  string,
  number,
  number,
  number,
  number,
  number,
  number,
  number | null,
  number,
  number | null,
  number | null,
];

export interface CatalogMeta {
  catalog: string;
  sourceFile: string;
  doctrine: string;
  towerCount: number;
  dropped: number;
  radioCounts: Record<string, number>;
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  gridStep: number;
  buckets: number;
  gridTiles: number;
}
