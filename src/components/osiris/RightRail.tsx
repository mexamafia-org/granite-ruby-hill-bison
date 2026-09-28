import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOsiris } from "@/lib/osiris/store";
import { cn } from "@/lib/utils";

export function RightRail() {
  const result = useOsiris((s) => s.result);
  const selectedTowers = useOsiris((s) => s.selectedTowers);
  const toggleTower = useOsiris((s) => s.toggleTower);
  const kmlFeatures = useOsiris((s) => s.kmlFeatures);
  const kmlVisible = useOsiris((s) => s.kmlVisible);
  const setKmlVisible = useOsiris((s) => s.setKmlVisible);
  const logEntries = useOsiris((s) => s.logEntries);
  const catalogLayer = useOsiris((s) => s.catalogLayer);

  const towers = result?.associatedTowers ?? [];

  return (
    <aside className="flex h-full min-h-0 w-full flex-col gap-3 overflow-hidden rounded-[var(--radius-xl)] bg-surface p-3 shadow-[var(--shadow-panel)] md:p-4">
      <section className="min-h-0 flex-1 overflow-auto">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Evidencia</p>
        <p className="mt-1 text-xs text-muted">
          {towers.length} torres asociadas · {selectedTowers.length} seleccionadas · {catalogLayer.length} en recuadro
        </p>
        <ul className="mt-3 space-y-2">
          {towers.length === 0 ? (
            <li className="rounded-[var(--radius-md)] bg-elevated p-3 text-sm text-muted">
              Sin torres ligadas a esta consulta. El plan de numeración no genera celdas.
            </li>
          ) : (
            towers.map((obs) => {
              const t = obs.tower;
              const selected = selectedTowers.some((s) => s.tower.id === t.id);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => toggleTower(t)}
                    className={cn(
                      "w-full rounded-[var(--radius-md)] bg-elevated p-3 text-left transition-opacity",
                      selected && "ring-1 ring-accent/60",
                    )}
                  >
                    <p className="font-mono text-xs text-fg">
                      {t.mcc}-{t.net}-{t.area}-{t.cellPublished === false ? "CID no publicado" : t.cell}
                    </p>
                    <p className="mt-1 text-[11px] text-muted">
                      {t.radio} · {t.operator ?? "operador desconocido"} · {t.origin ?? "catalog"}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-muted">
                      {t.lat.toFixed(5)}, {t.lon.toFixed(5)}
                      {t.rangeM != null ? ` · r ${t.rangeM} m` : " · radio no publicado"}
                    </p>
                    <p className="mt-1 text-[11px] text-muted">{obs.relationshipToUe}</p>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="mt-4 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">KML</p>
          <Button variant="ghost" size="sm" onClick={() => setKmlVisible(!kmlVisible)}>
            {kmlVisible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            {kmlVisible ? "visible" : "oculta"}
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted">
          {kmlFeatures.length === 0
            ? "Sin capa KML adjunta. Independiente del número y de las torres."
            : `${kmlFeatures.length} entidades de anotación humana.`}
        </p>
      </section>

      <section className="max-h-40 overflow-auto rounded-[var(--radius-lg)] bg-elevated p-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Bitácora</p>
        <ul className="mt-2 space-y-1.5">
          {logEntries.slice(0, 12).map((e) => (
            <li key={e.id} className="font-mono text-[11px] leading-snug text-muted">
              <span
                className={cn(
                  "mr-1 uppercase",
                  e.level === "error" ? "text-danger" : e.level === "warn" ? "text-warn" : "text-ok",
                )}
              >
                {e.level}
              </span>
              {e.message}
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
