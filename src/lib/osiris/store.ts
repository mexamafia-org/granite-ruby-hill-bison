import { create } from "zustand";
import type {
  CatalogMeta,
  CellTower,
  EventLogEntry,
  GeoPoint,
  KmlFeature,
  LiveTelemetrySample,
  LookupResult,
  TowerObservation,
} from "./types.ts";

interface MapFocus {
  lat: number;
  lon: number;
  zoom: number;
}

interface OsirisState {
  query: string;
  setQuery: (q: string) => void;
  searching: boolean;
  setSearching: (v: boolean) => void;
  result: LookupResult | null;
  setResult: (r: LookupResult | null) => void;
  connection: "ONLINE" | "DEGRADED" | "OFFLINE";
  setConnection: (c: OsirisState["connection"]) => void;
  catalogCount: number;
  catalogReady: boolean;
  catalogMeta: CatalogMeta | null;
  setCatalogReady: (ready: boolean, count: number, meta?: CatalogMeta | null) => void;
  selectedTowers: TowerObservation[];
  toggleTower: (tower: CellTower) => void;
  clearSelected: () => void;
  kmlFeatures: KmlFeature[];
  kmlPhones: string[];
  kmlVisible: boolean;
  setKmlFeatures: (features: KmlFeature[], phones?: string[]) => void;
  setKmlVisible: (v: boolean) => void;
  liveTelemetry: LiveTelemetrySample[];
  addTelemetry: (s: LiveTelemetrySample) => void;
  ownGps: GeoPoint | null;
  setOwnGps: (p: GeoPoint | null) => void;
  mapFocus: MapFocus | null;
  setMapFocus: (f: MapFocus | null) => void;
  catalogLayer: CellTower[];
  setCatalogLayer: (t: CellTower[]) => void;
  basemap: "dark" | "imagery" | "streets" | "topo";
  setBasemap: (b: OsirisState["basemap"]) => void;
  radioFilter: string;
  setRadioFilter: (v: string) => void;
  operatorFilter: string;
  setOperatorFilter: (v: string) => void;
  showCoverage: boolean;
  setShowCoverage: (v: boolean) => void;
  showTowers: boolean;
  setShowTowers: (v: boolean) => void;
  showPlaces: boolean;
  setShowPlaces: (v: boolean) => void;
  showLines: boolean;
  setShowLines: (v: boolean) => void;
  setSelectedTowers: (list: TowerObservation[]) => void;
  logEntries: EventLogEntry[];
  log: (level: EventLogEntry["level"], message: string) => void;
}

let seq = 0;

export const useOsiris = create<OsirisState>((set) => ({
  query: "",
  setQuery: (query) => set({ query }),
  searching: false,
  setSearching: (searching) => set({ searching }),
  result: null,
  setResult: (result) => set({ result }),
  connection: "ONLINE",
  setConnection: (connection) => set({ connection }),
  catalogCount: 0,
  catalogReady: false,
  catalogMeta: null,
  setCatalogReady: (catalogReady, catalogCount, catalogMeta = null) =>
    set({ catalogReady, catalogCount, catalogMeta: catalogMeta ?? null }),
  selectedTowers: [],
  toggleTower: (tower) =>
    set((s) => {
      const exists = s.selectedTowers.some((o) => o.tower.id === tower.id);
      if (exists) return { selectedTowers: s.selectedTowers.filter((o) => o.tower.id !== tower.id) };
      return {
        selectedTowers: [
          ...s.selectedTowers,
          {
            tower,
            rangeM: tower.rangeM,
            rssiDbm: null,
            rsrpDbm: null,
            rsrqDb: null,
            sinrDb: null,
            measuredAt: null,
            relationshipToUe: "USER_SELECTED",
            source: tower.source,
          },
        ],
      };
    }),
  clearSelected: () => set({ selectedTowers: [] }),
  kmlFeatures: [],
  kmlPhones: [],
  kmlVisible: true,
  setKmlFeatures: (kmlFeatures, kmlPhones = []) => set({ kmlFeatures, kmlPhones }),
  setKmlVisible: (kmlVisible) => set({ kmlVisible }),
  liveTelemetry: [],
  addTelemetry: (sample) =>
    set((s) => {
      if (s.liveTelemetry.some((x) => x.id === sample.id)) return s;
      return { liveTelemetry: [...s.liveTelemetry, sample].slice(-50) };
    }),
  ownGps: null,
  setOwnGps: (ownGps) => set({ ownGps }),
  mapFocus: null,
  setMapFocus: (mapFocus) => set({ mapFocus }),
  catalogLayer: [],
  setCatalogLayer: (catalogLayer) => set({ catalogLayer }),
  basemap: "imagery",
  setBasemap: (basemap) => set({ basemap }),
  radioFilter: "",
  setRadioFilter: (radioFilter) => set({ radioFilter }),
  operatorFilter: "",
  setOperatorFilter: (operatorFilter) => set({ operatorFilter }),
  showCoverage: false,
  setShowCoverage: (showCoverage) => set({ showCoverage }),
  showTowers: true,
  setShowTowers: (showTowers) => set({ showTowers }),
  showPlaces: true,
  setShowPlaces: (showPlaces) => set({ showPlaces }),
  showLines: true,
  setShowLines: (showLines) => set({ showLines }),
  setSelectedTowers: (selectedTowers) => set({ selectedTowers }),
  logEntries: [],
  log: (level, message) =>
    set((s) => ({
      logEntries: [
        { id: `e-${++seq}`, ts: new Date().toISOString(), level, message },
        ...s.logEntries,
      ].slice(0, 80),
    })),
}));
