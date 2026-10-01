import { useMemo, useState } from "react";
import { useDossier, type CommChannel } from "@/lib/osiris/dossier";
import { useOsiris } from "@/lib/osiris/store";
import type { CellTower, RelationshipToUe } from "@/lib/osiris/types";
import { cn } from "@/lib/utils";

const RADIOS = ["", "GSM", "UMTS", "LTE", "NR"] as const;
const OPERATORS = ["", "Telcel", "Movistar", "AT&T", "Altan"] as const;
const CHANNELS: CommChannel[] = ["voz", "sms", "datos", "otro"];
const RELS: RelationshipToUe[] = ["SIGNAL_OBSERVED", "SERVING", "NEIGHBOR_MEASURED", "USER_SELECTED"];

type SideTab = "lugares" | "torres" | "caso";

function download(name: string, content: string, mime: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function CommandDock({
  onLocate,
  onObserve,
  onCommunicate,
  onGps,
  onChangeTarget,
  onToast,
  busy,
}: {
  onLocate: (raw: string) => void;
  onObserve: (tower: CellTower) => void;
  onCommunicate: (input: { channel: CommChannel; note: string; cgi: string; at: string }) => void;
  onGps: () => void;
  onChangeTarget: () => void;
  onToast: (message: string) => void;
  busy: boolean;
}) {
  const file = useDossier((s) => s.cases.find((c) => c.id === s.activeId) ?? null);
  const setRelationship = useDossier((s) => s.setRelationship);
  const forgetTower = useDossier((s) => s.forgetTower);
  const result = useOsiris((s) => s.result);
  const radioFilter = useOsiris((s) => s.radioFilter);
  const setRadioFilter = useOsiris((s) => s.setRadioFilter);
  const operatorFilter = useOsiris((s) => s.operatorFilter);
  const setOperatorFilter = useOsiris((s) => s.setOperatorFilter);
  const showCoverage = useOsiris((s) => s.showCoverage);
  const setShowCoverage = useOsiris((s) => s.setShowCoverage);
  const showTowers = useOsiris((s) => s.showTowers);
  const setShowTowers = useOsiris((s) => s.setShowTowers);
  const showPlaces = useOsiris((s) => s.showPlaces);
  const setShowPlaces = useOsiris((s) => s.setShowPlaces);
  const showLines = useOsiris((s) => s.showLines);
  const setShowLines = useOsiris((s) => s.setShowLines);
  const catalogCount = useOsiris((s) => s.catalogCount);
  const catalogReady = useOsiris((s) => s.catalogReady);
  const setMapFocus = useOsiris((s) => s.setMapFocus);
  const catalogLayer = useOsiris((s) => s.catalogLayer);
  const publicNote = useOsiris((s) => s.publicNote);
  const liveTelemetry = useOsiris((s) => s.liveTelemetry);
  const kmlFeatures = useOsiris((s) => s.kmlFeatures);

  const [tab, setTab] = useState<SideTab>("torres");
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState<CommChannel>("voz");
  const [note, setNote] = useState("");
  const [cgi, setCgi] = useState("");

  const towers = useMemo(() => {
    return catalogLayer.filter((t) => {
      if (radioFilter && t.radio !== radioFilter) return false;
      if (operatorFilter && !(t.operator ?? "").toLowerCase().includes(operatorFilter.toLowerCase())) return false;
      return true;
    });
  }, [catalogLayer, operatorFilter, radioFilter]);

  const places = useMemo(() => kmlFeatures, [kmlFeatures]);

  const hideFix =
    !result ||
    result.estimatedPosition == null ||
    result.positionKind === "INFRASTRUCTURE" ||
    result.positionKind === "KML_ANNOTATION" ||
    result.positionKind === "NOT_DETERMINED" ||
    result.positionKind === "COVERAGE_AREA";
  const pos = hideFix
    ? "POSICIÓN NO DETERMINABLE"
    : `${result!.estimatedPosition!.lat.toFixed(6)}, ${result!.estimatedPosition!.lon.toFixed(6)}`;

  const methodLabel =
    result?.method === "trilateration" || result?.method === "circle_intersection" ? "MATRIX" : (result?.method ?? "none");

  const fitView = () => {
    const pts = [
      ...((file?.observations ?? []).map((o) => ({ lat: o.tower.lat, lon: o.tower.lon }))),
      ...kmlFeatures.flatMap((f) => {
        if (f.geometry.type === "Point") {
          const [lon, lat] = f.geometry.coordinates;
          return [{ lat, lon }];
        }
        return [];
      }),
    ];
    if (pts.length === 0) {
      setMapFocus({ lat: 23.6345, lon: -102.5528, zoom: 5 });
      onToast("Sin lugares publicados. Vista de México.");
      return;
    }
    const lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
    const lon = pts.reduce((s, p) => s + p.lon, 0) / pts.length;
    setMapFocus({ lat, lon, zoom: pts.length === 1 ? 15 : 8 });
  };

  const exportCsv = () => {
    if (!towers.length) {
      onToast("Sin torres en el recuadro");
      return;
    }
    const header = "radio,operator,mcc,net,area,cell,lat,lon,range_m,samples";
    const rows = towers.map((t) =>
      [t.radio, t.operator ?? "", t.mcc, t.net, t.area, t.cellPublished === false ? "" : t.cell, t.lat, t.lon, t.rangeM ?? "", t.samples].join(","),
    );
    download("osiris_torres.csv", [header, ...rows].join("\n"), "text/csv");
    onToast(`CSV de ${towers.length.toLocaleString("es-MX")} torres del recuadro`);
  };

  const exportJson = () => {
    const payload = {
      places: places.map((f) => ({ id: f.id, name: f.name, geometry: f.geometry })),
      towers: towers.map(publicTower),
    };
    download("osiris_vista.json", JSON.stringify(payload), "application/json");
    onToast("JSON de la vista exportado");
  };

  const exportKml = () => {
    const rows = towers.slice(0, 500).map((t) => {
      const name = `${t.radio} ${t.mcc}-${t.net}-${t.area}-${t.cellPublished === false ? "cid-no-publicado" : t.cell}`;
      return `  <Placemark><name>${escapeXml(name)}</name><Point><coordinates>${t.lon},${t.lat},0</coordinates></Point></Placemark>`;
    });
    const kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>OSIRIS torres</name>\n${rows.join("\n")}\n</Document></kml>`;
    download("osiris_torres.kml", kml, "application/vnd.google-earth.kml+xml");
    onToast("KML de torres publicadas");
  };

  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-surface text-fg">
      <header className="border-b border-border px-3.5 py-3">
        <h1 className="text-base font-semibold tracking-[0.18em] text-accent">OSIRIS MAP</h1>
        <p className="mt-0.5 text-xs text-umts">Inteligencia geoespacial · MCC 334</p>
        <p className="mt-1.5 text-[11px] leading-snug text-muted">
          {catalogReady ? `${catalogCount.toLocaleString("es-MX")} torres de catálogo` : "Cargando catálogo"}
          {" · "}
          {kmlFeatures.length} lugares · {file?.observations.length ?? 0} observaciones
        </p>
        {publicNote ? <p className="mt-1 text-[11px] leading-snug text-muted">{publicNote}</p> : null}
      </header>

      <form
        className="mx-3 mt-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          setTab("caso");
          onLocate(q);
        }}
      >
        <label className="sr-only" htmlFor="locate-number">
          Número a localizar
        </label>
        <input
          id="locate-number"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Número a localizar"
          inputMode="tel"
          autoComplete="off"
          className="h-10 w-full rounded-[var(--radius-sm)] bg-elevated px-3 font-mono text-sm text-fg shadow-[inset_0_0_0_1px_var(--color-border)] placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
          aria-label="Número a localizar"
        />
      </form>
      <p className="mx-3 mt-1 text-[10px] leading-snug text-muted">
        Enter lee la telemetría de este número. Entregar una torre usa su medición pública. MATRIX solo con llamada VoIP real.
      </p>

      <div className="mt-2.5 grid grid-cols-3 border-b border-border">
        {(
          [
            ["lugares", "Lugares"],
            ["torres", "Torres"],
            ["caso", "Caso"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "h-10 text-xs font-semibold",
              tab === id ? "border-b-2 border-accent bg-elevated text-accent" : "text-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-1.5 border-b border-border px-3 py-2 text-xs text-umts">
        <p className="font-semibold text-accent">Capas activas</p>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showPlaces} onChange={(e) => setShowPlaces(e.target.checked)} />
          Placemarks
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showLines} onChange={(e) => setShowLines(e.target.checked)} />
          Líneas y rutas
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showTowers} onChange={(e) => setShowTowers(e.target.checked)} />
          Torres celulares
        </label>
      </div>

      {tab === "torres" ? (
        <div className="space-y-1.5 border-b border-border px-3 py-2">
          <p className="text-[11px] text-umts">Filtrar torres</p>
          <select
            value={radioFilter}
            onChange={(e) => setRadioFilter(e.target.value)}
            className="h-9 w-full rounded-[var(--radius-sm)] bg-elevated px-2 text-xs text-fg"
            aria-label="Filtrar tecnología"
          >
            {RADIOS.map((r) => (
              <option key={r || "all"} value={r}>
                {r ? `${r}` : "Todas las tecnologías"}
              </option>
            ))}
          </select>
          <select
            value={operatorFilter}
            onChange={(e) => setOperatorFilter(e.target.value)}
            className="h-9 w-full rounded-[var(--radius-sm)] bg-elevated px-2 text-xs text-fg"
            aria-label="Filtrar operador"
          >
            {OPERATORS.map((r) => (
              <option key={r || "op"} value={r}>
                {r || "Todos los operadores"}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs text-umts">
            <input type="checkbox" checked={showCoverage} onChange={(e) => setShowCoverage(e.target.checked)} />
            Mostrar radio publicado
          </label>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "lugares" ? (
          places.length === 0 ? (
            <p className="px-3.5 py-3 text-sm text-muted">No hay placemarks publicados en la capa.</p>
          ) : (
            places.map((f) => (
              <button
                key={f.id}
                type="button"
                className="block w-full border-b border-border px-3.5 py-2.5 text-left hover:bg-elevated"
                onClick={() => {
                  if (f.geometry.type !== "Point") return;
                  const [lon, lat] = f.geometry.coordinates;
                  setMapFocus({ lat, lon, zoom: 16 });
                }}
              >
                <p className="text-sm font-semibold text-accent">{f.name}</p>
                <p className="mt-0.5 text-[11px] text-muted">Anotación. No es GPS ni torre.</p>
              </button>
            ))
          )
        ) : null}

        {tab === "torres" ? (
          <>
            {towers.length > 80 ? (
              <p className="border-b border-border px-3.5 py-2 text-[11px] text-muted">
                Mostrando 80 de {towers.length.toLocaleString("es-MX")} en el recuadro. Acerca el mapa o filtra.
              </p>
            ) : null}
            {towers.length === 0 ? (
              <p className="px-3.5 py-3 text-sm text-muted">Acerca el mapa para cargar torres del catálogo.</p>
            ) : (
              towers.slice(0, 80).map((t) => (
                <div key={t.id} className="border-b border-border px-3.5 py-2.5">
                  <button
                    type="button"
                    className="block w-full text-left hover:bg-elevated"
                    onClick={() => setMapFocus({ lat: t.lat, lon: t.lon, zoom: 16 })}
                  >
                    <p className="text-sm font-semibold" style={{ color: radioVar(t.radio) }}>
                      {t.operator ?? "Operador no publicado"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {t.radio} · LAC {t.area} · CID {t.cellPublished === false ? "no publicado" : t.cell}
                    </p>
                    <p className="text-[11px] text-muted">
                      {t.samples > 0 ? `${t.samples} mediciones públicas` : "sin conteo público"}
                      {" · "}
                      {t.rangeM != null ? `radio ${t.rangeM} m` : "radio no publicado"}
                    </p>
                  </button>
                  <button
                    type="button"
                    disabled={busy || t.cellPublished === false}
                    onClick={() => onObserve(t)}
                    className="mt-1 h-8 rounded-[var(--radius-sm)] bg-elevated px-2 text-[10px] font-semibold uppercase tracking-wide text-accent disabled:text-muted"
                  >
                    {t.cellPublished === false ? "Sin CID publicado" : "Entregar telemetría"}
                  </button>
                </div>
              ))
            )}
          </>
        ) : null}

        {tab === "caso" ? (
          <div className="space-y-3 px-3.5 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Número del caso</p>
                <p className="font-mono text-sm text-fg">{file?.raw ?? "Sin número"}</p>
              </div>
              <button type="button" onClick={onChangeTarget} className="h-9 px-2 text-xs text-accent">
                Cambiar
              </button>
            </div>
            <p className="text-xs text-muted">
              Posición: {pos}. {methodLabel} · {result?.confidence ?? "NONE"}
            </p>
            <p className="text-[11px] text-muted">
              Telemetría del caso:{" "}
              {liveTelemetry.filter((s) => file && s.phoneDigits && (s.phoneDigits === file.id || file.id.endsWith(s.phoneDigits))).length}
              {" · "}
              GPS de este equipo: {liveTelemetry.filter((s) => s.origin === "equipment").length}
            </p>
            <p className="text-[11px] leading-relaxed text-muted">{result?.reason}</p>
            <ul className="space-y-2">
              {file?.observations.map((obs) => (
                <li key={obs.id} className="rounded-[var(--radius-sm)] bg-elevated p-2">
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => setMapFocus({ lat: obs.tower.lat, lon: obs.tower.lon, zoom: 15 })}
                  >
                    <p className="font-mono text-xs">
                      {obs.tower.mcc}-{obs.tower.net}-{obs.tower.area}-
                      {obs.tower.cellPublished === false ? "s/cid" : obs.tower.cell}
                    </p>
                    <p className="text-[11px] text-muted">
                      {obs.tower.radio} · {obs.tower.rangeM != null ? `${obs.tower.rangeM} m` : "radio no publicado"}
                    </p>
                  </button>
                  <div className="mt-1 flex gap-2">
                    <select
                      value={obs.relationship}
                      onChange={(e) => setRelationship(obs.tower.id, e.target.value as RelationshipToUe)}
                      className="h-8 min-w-0 flex-1 rounded-[var(--radius-sm)] bg-bg px-1 font-mono text-[10px]"
                      aria-label="Relación con el teléfono"
                    >
                      {RELS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="text-[11px] text-danger" onClick={() => forgetTower(obs.tower.id)}>
                      Quitar
                    </button>
                  </div>
                </li>
              ))}
              {file?.communications.map((c) => (
                <li key={c.id} className="rounded-[var(--radius-sm)] bg-elevated p-2 text-[11px] text-muted">
                  {c.channel} · {c.cgi || "sin CGI"} · {c.towerId ? "celda publicada" : "sin coordenada"}
                  {c.note ? ` · ${c.note}` : ""}
                </li>
              ))}
            </ul>
            <form
              className="grid gap-2 border-t border-border pt-3"
              onSubmit={(e) => {
                e.preventDefault();
                onCommunicate({ channel, note: note.trim(), cgi: cgi.trim(), at: new Date().toISOString() });
                setNote("");
                setCgi("");
                onToast("Comunicación guardada en el caso");
              }}
            >
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Registrar comunicación</p>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as CommChannel)}
                  className="h-10 rounded-[var(--radius-sm)] bg-elevated px-2 text-xs"
                  aria-label="Canal"
                >
                  {CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  value={cgi}
                  onChange={(e) => setCgi(e.target.value)}
                  placeholder="CGI si se observó"
                  aria-label="CGI observado"
                  className="h-10 rounded-[var(--radius-sm)] bg-elevated px-2 font-mono text-xs placeholder:text-muted"
                />
              </div>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nota, sin inventar lugar"
                aria-label="Nota de la comunicación"
                className="h-10 rounded-[var(--radius-sm)] bg-elevated px-2 text-xs placeholder:text-muted"
              />
              <div className="grid grid-cols-2 gap-2">
                <button type="submit" disabled={busy} className="h-10 rounded-[var(--radius-sm)] bg-accent text-xs font-semibold text-accent-fg">
                  Guardar
                </button>
                <button type="button" onClick={onGps} className="h-10 rounded-[var(--radius-sm)] bg-elevated text-xs text-fg">
                  GPS equipo
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </div>

      <footer className="grid grid-cols-4 gap-1.5 border-t border-border p-2.5">
        <button type="button" onClick={fitView} className="h-9 rounded-[var(--radius-sm)] bg-elevated text-[10px] font-semibold uppercase tracking-wide text-umts">
          Ver todo
        </button>
        <button type="button" onClick={exportKml} className="h-9 rounded-[var(--radius-sm)] bg-elevated text-[10px] font-semibold uppercase tracking-wide text-ok">
          KML
        </button>
        <button type="button" onClick={exportJson} className="h-9 rounded-[var(--radius-sm)] bg-elevated text-[10px] font-semibold uppercase tracking-wide text-warn">
          JSON
        </button>
        <button type="button" onClick={exportCsv} className="h-9 rounded-[var(--radius-sm)] bg-elevated text-[10px] font-semibold uppercase tracking-wide text-danger">
          CSV
        </button>
      </footer>
    </aside>
  );
}

function publicTower(t: CellTower) {
  return {
    radio: t.radio,
    operator: t.operator,
    mcc: t.mcc,
    net: t.net,
    area: t.area,
    cell: t.cellPublished === false ? null : t.cell,
    lat: t.lat,
    lon: t.lon,
    rangeM: t.rangeM,
    samples: t.samples,
  };
}

function radioVar(radio: string): string {
  if (radio === "GSM") return "var(--color-gsm)";
  if (radio === "UMTS") return "var(--color-umts)";
  if (radio === "LTE") return "var(--color-lte)";
  if (radio === "NR") return "var(--color-nr)";
  return "var(--color-accent)";
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
}
