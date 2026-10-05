import { create } from "zustand";
import { parsePhoneNumber } from "./phone.ts";
import type { CellTower, RelationshipToUe } from "./types.ts";
import type { PublicWifiAp } from "./wifi.ts";

export type CommChannel = "voz" | "sms" | "datos" | "otro";

export interface TowerHit {
  id: string;
  at: string;
  relationship: RelationshipToUe;
  tower: CellTower;
}

export interface CommHit {
  id: string;
  at: string;
  channel: CommChannel;
  note: string;
  cgi: string;
  towerId: string | null;
}

export interface WifiHit {
  id: string;
  at: string;
  ap: PublicWifiAp;
}

export interface CaseFile {
  id: string;
  raw: string;
  createdAt: string;
  updatedAt: string;
  observations: TowerHit[];
  communications: CommHit[];
  wifi: WifiHit[];
}

const CASES_KEY = "osiris.cases.v1";
const ACTIVE_KEY = "osiris.activeCase.v1";
const MAX_OBS = 40;
const MAX_COMMS = 80;

function readJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function caseIdFor(raw: string): string | null {
  const phone = parsePhoneNumber(raw);
  const id = phone.digits;
  if (id.length < 8) return null;
  return id;
}

export function upsertCase(cases: CaseFile[], raw: string, id: string, now: string): CaseFile[] {
  const existing = cases.find((c) => c.id === id);
  if (existing) {
    return cases.map((c) => (c.id === id ? { ...c, raw: raw.trim(), updatedAt: now } : c));
  }
  return [
    {
      id,
      raw: raw.trim(),
      createdAt: now,
      updatedAt: now,
      observations: [],
      communications: [],
      wifi: [],
    },
    ...cases,
  ].slice(0, 24);
}

export function addTowerHit(
  file: CaseFile,
  tower: CellTower,
  relationship: RelationshipToUe,
  at: string,
): CaseFile {
  const without = file.observations.filter((o) => o.tower.id !== tower.id);
  const hit: TowerHit = { id: `obs-${tower.id}`, at, relationship, tower };
  return {
    ...file,
    updatedAt: at,
    observations: [hit, ...without].slice(0, MAX_OBS),
  };
}

export function patchTowerHit(
  file: CaseFile,
  towerId: string,
  relationship: RelationshipToUe,
): CaseFile {
  return {
    ...file,
    observations: file.observations.map((o) =>
      o.tower.id === towerId ? { ...o, relationship } : o,
    ),
  };
}

export function dropTowerHit(file: CaseFile, towerId: string): CaseFile {
  return {
    ...file,
    observations: file.observations.filter((o) => o.tower.id !== towerId),
    communications: file.communications.map((c) =>
      c.towerId === towerId ? { ...c, towerId: null } : c,
    ),
  };
}

export function addCommHit(
  file: CaseFile,
  hit: Omit<CommHit, "id"> & { id?: string },
): CaseFile {
  const row: CommHit = {
    id: hit.id ?? `com-${hit.at}-${file.communications.length}`,
    at: hit.at,
    channel: hit.channel,
    note: hit.note,
    cgi: hit.cgi,
    towerId: hit.towerId,
  };
  return {
    ...file,
    updatedAt: hit.at,
    communications: [row, ...file.communications].slice(0, MAX_COMMS),
  };
}

interface DossierState {
  ready: boolean;
  cases: CaseFile[];
  activeId: string | null;
  revision: number;
  hydrate: () => void;
  openCase: (raw: string) => { ok: true; id: string } | { ok: false; reason: string };
  closeActive: () => void;
  active: () => CaseFile | null;
  observeTower: (tower: CellTower, relationship?: RelationshipToUe, at?: string) => void;
  setRelationship: (towerId: string, relationship: RelationshipToUe) => void;
  forgetTower: (towerId: string) => void;
  logCommunication: (input: {
    channel: CommChannel;
    note: string;
    cgi: string;
    at: string;
    towerId: string | null;
  }) => void;
  noteWifi: (ap: PublicWifiAp, at: string) => void;
}

function withWifi(file: CaseFile): CaseFile {
  return { ...file, wifi: Array.isArray(file.wifi) ? file.wifi : [] };
}

function persist(cases: CaseFile[], activeId: string | null) {
  if (typeof localStorage === "undefined") return;
  writeJson(CASES_KEY, cases);
  if (activeId) writeJson(ACTIVE_KEY, activeId);
  else localStorage.removeItem(ACTIVE_KEY);
}

function mutate(
  set: (partial: Partial<DossierState>) => void,
  get: () => DossierState,
  recipe: (file: CaseFile) => CaseFile,
) {
  const { cases, activeId, revision } = get();
  if (!activeId) return;
  const found = cases.find((c) => c.id === activeId);
  if (!found) return;
  const current = withWifi(found);
  const nextCases = cases.map((c) => (c.id === activeId ? recipe(current) : c));
  persist(nextCases, activeId);
  set({ cases: nextCases, revision: revision + 1 });
}

export const useDossier = create<DossierState>((set, get) => ({
  ready: false,
  cases: [],
  activeId: null,
  revision: 0,
  hydrate: () => {
    const cases = readJson<CaseFile[]>(CASES_KEY, [])
      .filter((c) => c && typeof c.id === "string" && Array.isArray(c.observations))
      .map(withWifi);
    const activeId = readJson<string | null>(ACTIVE_KEY, null);
    const valid = activeId && cases.some((c) => c.id === activeId) ? activeId : null;
    set({ ready: true, cases, activeId: valid });
  },
  openCase: (raw) => {
    const id = caseIdFor(raw);
    if (!id) return { ok: false, reason: "Ingresa un número de al menos 8 dígitos. No queda ningún número fijo." };
    const now = new Date().toISOString();
    const cases = upsertCase(get().cases, raw, id, now);
    persist(cases, id);
    set({ cases, activeId: id, revision: get().revision + 1 });
    return { ok: true, id };
  },
  closeActive: () => {
    persist(get().cases, null);
    set({ activeId: null });
  },
  active: () => {
    const { cases, activeId } = get();
    return cases.find((c) => c.id === activeId) ?? null;
  },
  observeTower: (tower, relationship = "SIGNAL_OBSERVED", at) => {
    const stamp = at && Number.isFinite(Date.parse(at)) ? new Date(at).toISOString() : new Date().toISOString();
    mutate(set, get, (file) => addTowerHit(file, tower, relationship, stamp));
  },
  setRelationship: (towerId, relationship) => {
    mutate(set, get, (file) => patchTowerHit(file, towerId, relationship));
  },
  forgetTower: (towerId) => {
    mutate(set, get, (file) => dropTowerHit(file, towerId));
  },
  logCommunication: (input) => {
    mutate(set, get, (file) => addCommHit(file, input));
  },
  noteWifi: (ap, at) => {
    const stamp = Number.isFinite(Date.parse(at)) ? new Date(at).toISOString() : new Date().toISOString();
    mutate(set, get, (file) => {
      const hit: WifiHit = { id: `wifi-${ap.bssid}`, at: stamp, ap };
      return {
        ...file,
        updatedAt: stamp,
        wifi: [hit, ...file.wifi.filter((row) => row.ap.bssid !== ap.bssid)].slice(0, 40),
      };
    });
  },
}));
