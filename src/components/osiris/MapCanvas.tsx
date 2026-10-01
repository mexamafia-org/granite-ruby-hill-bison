import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, CircleMarker, MapContainer, Popup, Polyline, TileLayer, useMap, useMapEvents, ZoomControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { queryOcidBbox } from "@/lib/osiris/data-client";
import { CATALOG_LIVE_MIN_ZOOM, CATALOG_MIN_ZOOM, MAX_LIVE_AREA_KM2 } from "@/lib/osiris/catalog";
import { bboxAreaKm2 } from "@/lib/osiris/geo";
import { useOsiris } from "@/lib/osiris/store";
import type { CellTower } from "@/lib/osiris/types";

const HOME: [number, number] = [21.88, -102.29];

const BASEMAPS = {
  imagery: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  streets: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  topo: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
  dark: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
} as const;

const BASEMAP_LABELS: Array<{ id: keyof typeof BASEMAPS; label: string }> = [
  { id: "imagery", label: "Satélite" },
  { id: "streets", label: "Calles" },
  { id: "topo", label: "Topo" },
  { id: "dark", label: "Gris" },
];

const PRESETS: Array<{ id: string; label: string; lat: number; lon: number; zoom: number }> = [
  { id: "area", label: "Área", lat: 21.88, lon: -102.29, zoom: 12 },
  { id: "cdmx", label: "CDMX", lat: 19.4326, lon: -99.1332, zoom: 12 },
  { id: "gdl", label: "GDL", lat: 20.6597, lon: -103.3496, zoom: 12 },
  { id: "mty", label: "MTY", lat: 25.6866, lon: -100.3161, zoom: 12 },
  { id: "cun", label: "CUN", lat: 21.1619, lon: -86.8515, zoom: 12 },
];

function radioColor(radio: string): string {
  if (radio === "GSM") return "var(--color-gsm)";
  if (radio === "UMTS") return "var(--color-umts)";
  if (radio === "LTE") return "var(--color-lte)";
  if (radio === "NR") return "var(--color-nr)";
  return "var(--color-accent)";
}

function FocusController() {
  const map = useMap();
  const focus = useOsiris((s) => s.mapFocus);
  useEffect(() => {
    if (!focus) return;
    map.flyTo([focus.lat, focus.lon], focus.zoom, { duration: 0.8 });
  }, [focus, map]);
  return null;
}

function CatalogLayer() {
  const setCatalogLayer = useOsiris((s) => s.setCatalogLayer);
  const setPublicNote = useOsiris((s) => s.setPublicNote);
  const log = useOsiris((s) => s.log);
  const timer = useRef<number | null>(null);
  const map = useMapEvents({
    moveend: () => schedule(),
    zoomend: () => schedule(),
  });

  function schedule() {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void pull();
    }, 280);
  }

  async function pull() {
    const z = map.getZoom();
    if (z < CATALOG_MIN_ZOOM) {
      setCatalogLayer([]);
      setPublicNote("Acerca el mapa para leer la telemetría pública de las torres.");
      return;
    }
    const b = map.getBounds();
    const west = b.getWest();
    const south = b.getSouth();
    const east = b.getEast();
    const north = b.getNorth();
    const km2 = bboxAreaKm2(west, south, east, north);
    const live = z >= CATALOG_LIVE_MIN_ZOOM && km2 <= MAX_LIVE_AREA_KM2;
    try {
      const data = await queryOcidBbox({ west, south, east, north, zoom: z, live });
      const towers = data.towers.slice(0, 800);
      const withRange = towers.filter((t) => t.rangeM != null && t.rangeM > 0).length;
      const withSamples = towers.filter((t) => t.samples > 0).length;
      setCatalogLayer(towers);
      setPublicNote(
        `${towers.length} torres públicas · ${withRange} con radio · ${withSamples} con mediciones. No se asignan al número.`,
      );
    } catch (err) {
      log("error", err instanceof Error ? err.message : "Fallo recuadro OpenCellID");
    }
  }

  useEffect(() => {
    schedule();
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function ClickProbe({ onPick }: { onPick: (text: string) => void }) {
  useMapEvents({
    click: (e) => onPick(`${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`),
  });
  return null;
}

function TowerDot({
  tower,
  emphasized,
  showRange,
  onObserve,
}: {
  tower: CellTower;
  emphasized?: boolean;
  showRange?: boolean;
  onObserve: (tower: CellTower) => void;
}) {
  const color = radioColor(tower.radio);
  return (
    <>
      {showRange && tower.rangeM != null && tower.rangeM > 0 ? (
        <Circle
          center={[tower.lat, tower.lon]}
          radius={tower.rangeM}
          pathOptions={{ color, weight: 1, fillOpacity: emphasized ? 0.08 : 0.04, opacity: 0.55 }}
        />
      ) : null}
      <CircleMarker
        center={[tower.lat, tower.lon]}
        radius={emphasized ? 8 : 5}
        pathOptions={{
          color,
          weight: emphasized ? 2 : 1,
          fillColor: color,
          fillOpacity: emphasized ? 0.95 : 0.8,
        }}
      >
        <Popup>
          <div className="min-w-[200px] font-mono text-xs">
            <p className="text-sm text-fg">Torre publicada</p>
            <p className="mt-1 text-muted">
              {tower.radio} · {tower.operator ?? "operador desconocido"} · {tower.origin ?? "catalog"}
            </p>
            <p className="mt-1">
              {tower.mcc}-{tower.net}-{tower.area}-
              {tower.cellPublished === false ? "CID no publicado" : tower.cell}
            </p>
            <p>
              {tower.lat.toFixed(5)}, {tower.lon.toFixed(5)}
            </p>
            <p>{tower.rangeM != null ? `radio publicado ${tower.rangeM} m` : "radio no publicado"}</p>
            <p>{tower.samples > 0 ? `${tower.samples} mediciones públicas` : "sin conteo de mediciones"}</p>
            <p className="mt-1 text-muted">Infraestructura publicada. No es la posición del teléfono.</p>
            <button
              type="button"
              className="mt-2 h-9 rounded-[var(--radius-sm)] bg-accent px-3 text-[11px] font-medium uppercase tracking-[0.12em] text-accent-fg"
              onClick={() => onObserve(tower)}
            >
              Entregar telemetría
            </button>
          </div>
        </Popup>
      </CircleMarker>
    </>
  );
}

export function MapCanvas({ onObserve }: { onObserve: (tower: CellTower) => void }) {
  const result = useOsiris((s) => s.result);
  const catalogLayer = useOsiris((s) => s.catalogLayer);
  const kmlFeatures = useOsiris((s) => s.kmlFeatures);
  const kmlVisible = useOsiris((s) => s.kmlVisible);
  const showPlaces = useOsiris((s) => s.showPlaces);
  const showLines = useOsiris((s) => s.showLines);
  const ownGps = useOsiris((s) => s.ownGps);
  const basemap = useOsiris((s) => s.basemap);
  const radioFilter = useOsiris((s) => s.radioFilter);
  const operatorFilter = useOsiris((s) => s.operatorFilter);
  const showCoverage = useOsiris((s) => s.showCoverage);
  const showTowers = useOsiris((s) => s.showTowers);
  const setMapFocus = useOsiris((s) => s.setMapFocus);
  const setBasemap = useOsiris((s) => s.setBasemap);

  const associated = result?.associatedTowers.map((o) => o.tower) ?? [];
  const associatedIds = useMemo(() => new Set(associated.map((t) => t.id)), [associated]);

  const background = useMemo(() => {
    return catalogLayer.filter((t) => {
      if (associatedIds.has(t.id)) return false;
      if (radioFilter && t.radio !== radioFilter) return false;
      if (operatorFilter && !(t.operator ?? "").toLowerCase().includes(operatorFilter.toLowerCase())) return false;
      return true;
    });
  }, [associatedIds, catalogLayer, operatorFilter, radioFilter]);

  const [picked, setPicked] = useState("Pulsa el mapa");
  const intersections = result?.trilateration.intersectionPoints ?? [];

  return (
    <div className="relative h-full min-h-[280px] w-full overflow-hidden bg-bg">
      <MapContainer center={HOME} zoom={12} className="h-full w-full" zoomControl={false} attributionControl>
        <TileLayer
          key={basemap}
          url={BASEMAPS[basemap]}
          attribution="&copy; Esri, OpenStreetMap"
          maxZoom={19}
        />
        <ZoomControl position="topleft" />
        <FocusController />
        <CatalogLayer />
        <ClickProbe onPick={setPicked} />
        {showTowers
          ? background.map((t) => (
              <TowerDot key={t.id} tower={t} showRange={showCoverage} onObserve={onObserve} />
            ))
          : null}
        {associated.map((t) => (
          <TowerDot key={`hit-${t.id}`} tower={t} emphasized showRange onObserve={onObserve} />
        ))}
        {intersections.length === 2 ? (
          <Polyline
            positions={intersections.map((p) => [p.lat, p.lon] as [number, number])}
            pathOptions={{ color: "var(--color-warn)", weight: 1, dashArray: "4 4" }}
          />
        ) : null}
        {intersections.map((p, i) => (
          <CircleMarker
            key={`ix-${i}`}
            center={[p.lat, p.lon]}
            radius={6}
            pathOptions={{ color: "var(--color-warn)", fillOpacity: 0.2, weight: 2 }}
          >
            <Popup>Ambigüedad geométrica. No es una posición elegida.</Popup>
          </CircleMarker>
        ))}
        {result?.estimatedPosition && result.positionKind === "ESTIMATED_POSITION" ? (
          <CircleMarker
            center={[result.estimatedPosition.lat, result.estimatedPosition.lon]}
            radius={9}
            pathOptions={{ color: "var(--color-fg)", fillColor: "var(--color-accent)", fillOpacity: 0.95, weight: 2 }}
          >
            <Popup>
              <div className="font-mono text-xs">
                <p>Posición estimada</p>
                <p>
                  {result.estimatedPosition.lat.toFixed(6)}, {result.estimatedPosition.lon.toFixed(6)}
                </p>
                <p>
                  {result.method} · {result.confidence}
                </p>
              </div>
            </Popup>
          </CircleMarker>
        ) : null}
        {ownGps ? (
          <CircleMarker
            center={[ownGps.lat, ownGps.lon]}
            radius={8}
            pathOptions={{ color: "var(--color-ok)", fillColor: "var(--color-ok)", fillOpacity: 0.9 }}
          >
            <Popup>GPS de este equipo. No es el número buscado.</Popup>
          </CircleMarker>
        ) : null}
        {showPlaces
          ? kmlFeatures.map((f) => {
              if (f.geometry.type === "LineString") {
                if (!showLines) return null;
                return (
                  <Polyline
                    key={f.id}
                    positions={f.geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number])}
                    pathOptions={{ color: "var(--color-umts)", weight: 3, opacity: 0.85, dashArray: "6 4" }}
                  />
                );
              }
              if (f.geometry.type !== "Point" || !kmlVisible) return null;
              const [lon, lat] = f.geometry.coordinates;
              return (
                <CircleMarker
                  key={f.id}
                  center={[lat, lon]}
                  radius={6}
                  pathOptions={{ color: "var(--color-umts)", fillColor: "var(--color-umts)", fillOpacity: 0.8 }}
                >
                  <Popup>
                    <div className="font-mono text-xs">
                      <p>{f.name}</p>
                      <p>Anotación. No es GPS ni torre.</p>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })
          : null}
      </MapContainer>

      <div className="absolute right-3 top-3 z-[500] flex flex-col gap-1">
        {BASEMAP_LABELS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setBasemap(item.id)}
            className={
              basemap === item.id
                ? "h-8 rounded-[var(--radius-xs)] bg-surface px-2.5 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-fg shadow-[inset_0_0_0_1px_var(--color-accent)]"
                : "h-8 rounded-[var(--radius-xs)] bg-surface/90 px-2.5 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted"
            }
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="absolute left-3 top-16 z-[500] flex flex-col gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setMapFocus({ lat: p.lat, lon: p.lon, zoom: p.zoom })}
            className="h-8 rounded-[var(--radius-xs)] border border-white/30 bg-surface/80 px-2.5 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-fg"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-full bg-surface/90 px-3 py-1 font-mono text-[10px] text-muted">
        {picked}
      </div>
      <div className="pointer-events-none absolute bottom-8 right-3 z-[500] rounded-[var(--radius-md)] border border-accent/25 bg-surface/90 px-3 py-2 font-mono text-[10px] text-umts">
        <p className="font-semibold tracking-[0.14em] text-accent">Leyenda</p>
        <p className="mt-1 flex items-center gap-2">
          <span className="inline-block size-2 rounded-full bg-umts" /> Placemarks
        </p>
        <p className="flex items-center gap-2">
          <span className="inline-block size-2 rounded-full bg-ok" /> Observación del caso
        </p>
        <p className="mt-1 font-semibold text-accent">Torres</p>
        <p className="flex items-center gap-2">
          <span className="inline-block size-2.5 rounded-[2px] bg-gsm" /> GSM
        </p>
        <p className="flex items-center gap-2">
          <span className="inline-block size-2.5 rounded-[2px] bg-umts" /> UMTS
        </p>
        <p className="flex items-center gap-2">
          <span className="inline-block size-2.5 rounded-[2px] bg-lte" /> LTE
        </p>
        <p className="flex items-center gap-2">
          <span className="inline-block size-2.5 rounded-[2px] bg-nr" /> NR
        </p>
      </div>
    </div>
  );
}
