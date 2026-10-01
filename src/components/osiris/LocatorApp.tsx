import { useEffect, useRef, useState, type ComponentType } from "react";
import { CommandDock } from "@/components/osiris/CommandDock";
import { TargetSetup } from "@/components/osiris/TargetSetup";
import { fetchCatalogMeta, fetchKmlLayer, fetchPhoneEvidence, publishTelemetry, queryOcidCell } from "@/lib/osiris/data-client";
import { useDossier, type CommChannel } from "@/lib/osiris/dossier";
import { lookupFromCase, isVoipSample, telemetryMatchesPhone, type PhoneEvidenceRecord } from "@/lib/osiris/lookup";
import { parsePhoneNumber } from "@/lib/osiris/phone";
import { parseOcidQuery } from "@/lib/osiris/ocid-query";
import { useOsiris } from "@/lib/osiris/store";
import type { CellTower, KmlFeature, LiveTelemetrySample, LookupResult, RelationshipToUe, TowerObservation } from "@/lib/osiris/types";
import { cn } from "@/lib/utils";

type MobilePane = "map" | "case";

const mapCanvasPromise = typeof document !== "undefined" ? import("@/components/osiris/MapCanvas") : null;

function focusFromResult(result: LookupResult): { lat: number; lon: number; zoom: number } | null {
  if (result.estimatedPosition && result.positionKind === "ESTIMATED_POSITION") {
    return { lat: result.estimatedPosition.lat, lon: result.estimatedPosition.lon, zoom: 14 };
  }
  const points = result.trilateration.intersectionPoints;
  if (points.length > 0) {
    return { lat: points[0].lat, lon: points[0].lon, zoom: 13 };
  }
  const towers = result.associatedTowers.map((o) => o.tower);
  if (towers.length === 1) return { lat: towers[0].lat, lon: towers[0].lon, zoom: 15 };
  if (towers.length > 1) {
    const lats = towers.map((t) => t.lat);
    const lons = towers.map((t) => t.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const span = Math.max(maxLat - minLat, maxLon - minLon);
    const zoom = span > 8 ? 5 : span > 3 ? 6 : span > 1 ? 8 : span > 0.3 ? 10 : 12;
    return { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2, zoom };
  }
  return null;
}

function toObservations(file: { observations: Array<{ at: string; relationship: TowerObservation["relationshipToUe"]; tower: CellTower }> }): TowerObservation[] {
  return file.observations.map((o) => ({
    tower: o.tower,
    rangeM: o.tower.rangeM,
    rssiDbm: null,
    rsrpDbm: null,
    rsrqDb: null,
    sinrDb: null,
    measuredAt: o.at,
    relationshipToUe: o.relationship,
    source: o.tower.source,
  }));
}

export function LocatorApp() {
  const [MapCanvas, setMapCanvas] = useState<ComponentType<{ onObserve: (tower: CellTower) => void }> | null>(null);
  const [pane, setPane] = useState<MobilePane>("map");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const kmlRef = useRef<KmlFeature[]>([]);
  const evidenceRef = useRef<Record<string, PhoneEvidenceRecord>>({});

  const ready = useDossier((s) => s.ready);
  const activeId = useDossier((s) => s.activeId);
  const revision = useDossier((s) => s.revision);
  const hydrate = useDossier((s) => s.hydrate);
  const observeTower = useDossier((s) => s.observeTower);
  const logCommunication = useDossier((s) => s.logCommunication);
  const closeActive = useDossier((s) => s.closeActive);

  const liveTelemetry = useOsiris((s) => s.liveTelemetry);
  const connection = useOsiris((s) => s.connection);
  const setResult = useOsiris((s) => s.setResult);
  const setCatalogReady = useOsiris((s) => s.setCatalogReady);
  const setKmlFeatures = useOsiris((s) => s.setKmlFeatures);
  const setConnection = useOsiris((s) => s.setConnection);
  const setOwnGps = useOsiris((s) => s.setOwnGps);
  const setMapFocus = useOsiris((s) => s.setMapFocus);
  const setSelectedTowers = useOsiris((s) => s.setSelectedTowers);
  const log = useOsiris((s) => s.log);
  const addTelemetry = useOsiris((s) => s.addTelemetry);

  useEffect(() => {
    if (!mapCanvasPromise) return;
    void mapCanvasPromise.then((m) => setMapCanvas(() => m.MapCanvas));
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [meta, kml, evidence] = await Promise.all([
          fetchCatalogMeta(),
          fetchKmlLayer(),
          fetchPhoneEvidence(),
        ]);
        if (cancelled) return;
        kmlRef.current = kml.features;
        evidenceRef.current = evidence;
        setCatalogReady(true, meta.towerCount, meta);
        setKmlFeatures(kml.features, kml.documentPhones);
        log("info", `Catálogo OpenCellID listo: ${meta.towerCount.toLocaleString("es-MX")} celdas`);
      } catch (err) {
        setConnection("DEGRADED");
        log("error", err instanceof Error ? err.message : "Fallo al inicializar fuentes");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [log, setCatalogReady, setConnection, setKmlFeatures]);

  const focused = useRef("");
  const ingested = useRef(new Set<string>());

  const publishInteraction = async (tower: CellTower, relationship: RelationshipToUe) => {
    const file = useDossier.getState().active();
    if (!file) return;
    if (tower.cellPublished === false || !tower.cell) {
      log("warn", "Torre sin CID publicado. Queda como infraestructura y no entra como celda.");
      return;
    }
    const at = new Date().toISOString();
    const sample: LiveTelemetrySample = {
      id: `interaction-${file.id}-${tower.mcc}-${tower.net}-${tower.area}-${tower.cell}`,
      receivedAt: at,
      phoneDigits: file.id,
      origin: "interaction",
      gps: null,
      cells: [
        {
          mcc: tower.mcc,
          net: tower.net,
          area: tower.area,
          cell: tower.cell,
          radio: tower.radio,
          rangeM: tower.rangeM,
          relationshipToUe: relationship,
          measuredAt: at,
        },
      ],
      source: "live_telemetry",
    };
    addTelemetry(sample);
    ingested.current.add(sample.id);
    try {
      await publishTelemetry(sample);
    } catch (err) {
      log("error", err instanceof Error ? err.message : "No se pudo guardar la telemetría");
    }
  };

  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const res = await fetch("/api/telemetry");
        if (!res.ok) return;
        const data = (await res.json()) as { samples?: LiveTelemetrySample[] };
        if (cancelled || !Array.isArray(data.samples)) return;
        const file = useDossier.getState().active();
        const known = new Set((file?.observations ?? []).map((o) => o.tower.id));
        for (const sample of data.samples) {
          if (!sample || typeof sample.id !== "string") continue;
          addTelemetry(sample);
          if (!file || sample.origin === "equipment" || !telemetryMatchesPhone(sample.phoneDigits, { digits: file.id, nationalNumber: file.id })) {
            continue;
          }
          if (ingested.current.has(sample.id)) continue;
          ingested.current.add(sample.id);
          for (const cell of sample.cells ?? []) {
            const id = `ocid:${cell.mcc}-${cell.net}-${cell.area}-${cell.cell}`;
            if (known.has(id)) continue;
            const tower = await queryOcidCell(cell);
            if (cancelled || !tower) continue;
            known.add(tower.id);
            observeTower(tower, cell.relationshipToUe ?? (isVoipSample(sample) ? "SERVING" : "SIGNAL_OBSERVED"));
          }
        }
      } catch {
        /* empty telemetry is the honest state */
      }
    };
    void pull();
    const id = window.setInterval(pull, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [addTelemetry, observeTower]);

  useEffect(() => {
    if (!ready || !activeId) return;
    const file = useDossier.getState().active();
    if (!file) return;
    const voipIds = new Set(
      file.communications
        .filter((c) => c.channel === "voz" && c.note.startsWith("VoIP") && c.towerId)
        .map((c) => c.towerId as string),
    );
    const scoped =
      voipIds.size > 0
        ? { observations: file.observations.filter((o) => voipIds.has(o.tower.id)) }
        : file;
    const observations = toObservations(scoped);
    const orphans = file.communications.filter((c) => !c.towerId).length;
    const next = lookupFromCase(file.raw, observations, orphans, {
      kmlFeatures: kmlRef.current,
      phoneEvidence: evidenceRef.current,
      liveTelemetry,
      catalogTowersByCgi: [],
      selectedTowers: [],
    });
    if (voipIds.size > 0) {
      next.reason = `MATRIX sobre la telemetría de la llamada VoIP previa. ${next.reason}`;
    }
    setResult(next);
    setSelectedTowers(next.associatedTowers);
    const key = `${activeId}:${revision}`;
    if (key === focused.current) return;
    focused.current = key;
    const focus = focusFromResult(next);
    if (focus && observations.length > 0) setMapFocus(focus);
  }, [activeId, liveTelemetry, ready, revision, setMapFocus, setResult, setSelectedTowers]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2500);
  };

  const onLocate = async (raw: string) => {
    const phone = parsePhoneNumber(raw);
    const opened = useDossier.getState().openCase(raw);
    if (!opened.ok) {
      showToast(opened.reason);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/telemetry");
      const data = res.ok ? ((await res.json()) as { samples?: LiveTelemetrySample[] }) : { samples: [] };
      const samples = Array.isArray(data.samples) ? data.samples : [];
      for (const sample of samples) {
        if (sample && typeof sample.id === "string") addTelemetry(sample);
      }
      const matched = samples.filter((s) => telemetryMatchesPhone(s.phoneDigits, phone));
      const voip = matched.filter((s) => isVoipSample(s));
      let resolved = 0;
      let unpublished = 0;
      for (const sample of voip) {
        for (const cell of sample.cells ?? []) {
          const tower = await queryOcidCell({
            mcc: cell.mcc,
            net: cell.net,
            area: cell.area,
            cell: cell.cell,
          });
          const cgi = `${cell.mcc}-${cell.net}-${cell.area}-${cell.cell}`;
          if (!tower) {
            unpublished += 1;
            logCommunication({
              channel: "voz",
              note: "VoIP previa sin celda publicada",
              cgi,
              at: sample.receivedAt || new Date().toISOString(),
              towerId: null,
            });
            continue;
          }
          observeTower(tower, cell.relationshipToUe ?? "SERVING");
          logCommunication({
            channel: "voz",
            note: "VoIP previa",
            cgi,
            at: sample.receivedAt || new Date().toISOString(),
            towerId: tower.id,
          });
          resolved += 1;
        }
      }
      if (voip.length === 0) {
        const interactions = matched.filter((s) => s.origin === "interaction").length;
        log(
          interactions ? "info" : "warn",
          interactions
            ? `Telemetría de interacción: ${interactions}. Sin llamada VoIP. MATRIX no se aplica.`
            : "Sin telemetría de este número. El catálogo público no se convierte en su posición.",
        );
        showToast(interactions ? "Hay interacción. Sin VoIP, MATRIX no corre." : "Sin telemetría de este número.");
      } else if (resolved === 0) {
        log("warn", "La llamada VoIP no tiene celdas publicadas. No se inventa torre ni coordenada.");
        showToast("VoIP sin celdas publicadas. Sin triangulación.");
      } else {
        log(
          "info",
          `MATRIX: ${resolved} celda(s) de la llamada VoIP en catálogo${unpublished ? `, ${unpublished} sin publicar` : ""}. Una sola torre no es la posición.`,
        );
        showToast("Telemetría VoIP ligada. MATRIX evalúa esas torres.");
      }
      setPane("map");
    } finally {
      setBusy(false);
    }
  };

  const onObserve = async (tower: CellTower) => {
    let published = tower;
    if (tower.cellPublished !== false && tower.cell) {
      const fresh = await queryOcidCell({
        mcc: tower.mcc,
        net: tower.net,
        area: tower.area,
        cell: tower.cell,
      });
      if (fresh) published = fresh;
    }
    observeTower(published, "SIGNAL_OBSERVED");
    await publishInteraction(published, "SIGNAL_OBSERVED");
    log("info", `Telemetría pública entregada: ${published.radio} ${published.mcc}-${published.net}-${published.area}. No es la posición del teléfono.`);
    showToast("Telemetría de la torre entregada. No es la posición del teléfono.");
    setPane("map");
  };

  const onCommunicate = async (input: { channel: CommChannel; note: string; cgi: string; at: string }) => {
    setBusy(true);
    try {
      let towerId: string | null = null;
      const parsed = input.cgi ? parseOcidQuery(input.cgi) : null;
      if (parsed?.kind === "cell") {
        const tower = await queryOcidCell(parsed);
        if (tower) {
          observeTower(tower, "SERVING");
          towerId = tower.id;
          await publishInteraction(tower, "SERVING");
          log("info", "Comunicación ligada a una celda publicada. Una sola torre sigue sin ser la posición del teléfono.");
        } else {
          log("warn", "Comunicación guardada. Ese CGI no está publicado. No se inventa coordenada.");
        }
      } else if (input.cgi) {
        log("warn", "CGI no reconocido. La comunicación queda sin celda y sin coordenada.");
      } else {
        log("info", "Comunicación registrada sin celda. POSICIÓN NO DETERMINABLE hasta una observación.");
      }
      logCommunication({ ...input, towerId });
    } finally {
      setBusy(false);
    }
  };

  const onGps = () => {
    if (!navigator.geolocation) {
      log("error", "Geolocalización no disponible en este navegador");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setOwnGps(p);
        setMapFocus({ ...p, zoom: 14 });
        const at = new Date().toISOString();
        const sample: LiveTelemetrySample = {
          id: `equipment-gps-${at}`,
          receivedAt: at,
          phoneDigits: null,
          origin: "equipment",
          gps: { lat: p.lat, lon: p.lon, accuracyM: pos.coords.accuracy, source: "GPS", measuredAt: at },
          cells: [],
          source: "GPS",
        };
        addTelemetry(sample);
        void publishTelemetry(sample).catch(() => log("warn", "El GPS del equipo no se pudo guardar en el servidor."));
        log("info", "GPS de este equipo registrado. No se asigna al número buscado.");
      },
      (err) => log("error", `GPS denegado o fallido: ${err.message}`),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  if (!ready) {
    return (
      <div className="flex h-dvh items-center justify-center bg-bg font-mono text-xs uppercase tracking-[0.2em] text-muted">
        OSIRIS
      </div>
    );
  }

  if (!activeId) return <TargetSetup />;

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-bg text-fg">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface/95 px-3">
        <span className={cn("size-2 rounded-full", connection === "ONLINE" ? "bg-ok" : "bg-warn")} />
        <p className="text-xs font-semibold tracking-[0.14em] text-accent">OSIRIS COMMAND CENTER</p>
        <span className="hidden rounded-[var(--radius-xs)] border border-border px-1.5 py-0.5 font-mono text-[10px] text-umts sm:inline">
          AOR México · MCC 334
        </span>
        <span className="rounded-[var(--radius-xs)] border border-border px-1.5 py-0.5 font-mono text-[10px] text-umts">
          {connection === "ONLINE" ? "Mapa en línea" : "Mapa degradado"}
        </span>
        <div className="ml-auto flex gap-1.5">
          <button
            type="button"
            onClick={() => setMapFocus({ lat: 21.88, lon: -102.29, zoom: 12 })}
            className="h-8 rounded-[var(--radius-xs)] border border-border bg-elevated px-2 font-mono text-[10px] uppercase tracking-wide text-accent"
          >
            Área
          </button>
          <button
            type="button"
            onClick={() => setMapFocus({ lat: 23.6345, lon: -102.5528, zoom: 5 })}
            className="h-8 rounded-[var(--radius-xs)] border border-border bg-elevated px-2 font-mono text-[10px] uppercase tracking-wide text-accent"
          >
            México
          </button>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(300px,360px)_1fr]">
        <div className={cn("h-full min-h-0 overflow-hidden border-r border-border", pane === "case" ? "block" : "hidden md:block")}>
          <CommandDock
            busy={busy}
            onToast={showToast}
            onLocate={(raw) => void onLocate(raw)}
            onObserve={(tower) => void onObserve(tower)}
            onCommunicate={(input) => void onCommunicate(input)}
            onGps={onGps}
            onChangeTarget={() => {
              closeActive();
              setResult(null);
            }}
          />
        </div>
        <div className={cn("h-full min-h-0", pane === "map" ? "block" : "hidden md:block")}>
          {MapCanvas ? (
            <MapCanvas onObserve={onObserve} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted">Cargando mapa</div>
          )}
        </div>
      </div>
      <nav className="grid grid-cols-2 gap-1 border-t border-border bg-surface p-1 md:hidden">
        {(["map", "case"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setPane(id)}
            className={cn(
              "h-11 rounded-[var(--radius-md)] font-mono text-[11px] uppercase tracking-[0.14em]",
              pane === id ? "bg-elevated text-fg" : "text-muted",
            )}
          >
            {id === "map" ? "Mapa" : "Panel"}
          </button>
        ))}
      </nav>
      {toast ? (
        <div className="pointer-events-none fixed bottom-16 left-1/2 z-[800] -translate-x-1/2 rounded-[var(--radius-sm)] border border-accent/40 bg-elevated px-4 py-2 text-sm text-accent md:bottom-8">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
