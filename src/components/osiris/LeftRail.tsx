import { Radio, Search, SatelliteDish } from "lucide-react";
import { Button } from "@/components/ui/button";
import { numberTypeLabel } from "@/lib/osiris/phone-plan";
import { useOsiris } from "@/lib/osiris/store";
import { cn } from "@/lib/utils";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-x-3 border-b border-border py-2 last:border-0">
      <dt className="text-[11px] uppercase tracking-[0.14em] text-muted">{label}</dt>
      <dd className="font-mono text-xs text-fg break-all">{value}</dd>
    </div>
  );
}

export function LeftRail({
  onSearch,
  onGps,
  onAnalyze,
}: {
  onSearch: () => void;
  onGps: () => void;
  onAnalyze: () => void;
}) {
  const query = useOsiris((s) => s.query);
  const setQuery = useOsiris((s) => s.setQuery);
  const result = useOsiris((s) => s.result);
  const searching = useOsiris((s) => s.searching);
  const connection = useOsiris((s) => s.connection);
  const catalogCount = useOsiris((s) => s.catalogCount);
  const catalogReady = useOsiris((s) => s.catalogReady);
  const catalogMeta = useOsiris((s) => s.catalogMeta);
  const selectedTowers = useOsiris((s) => s.selectedTowers);

  const phone = result?.phone;
  const hideFix =
    !result ||
    result.estimatedPosition == null ||
    result.positionKind === "INFRASTRUCTURE" ||
    result.positionKind === "KML_ANNOTATION" ||
    result.positionKind === "NOT_DETERMINED";
  const pos = hideFix
    ? "POSICIÓN NO DETERMINABLE"
    : `${result.estimatedPosition!.lat.toFixed(6)}, ${result.estimatedPosition!.lon.toFixed(6)}`;

  return (
    <aside className="flex h-full min-h-0 w-full flex-col gap-3 overflow-hidden rounded-[var(--radius-xl)] bg-surface p-3 shadow-[var(--shadow-panel)] md:p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted">OSIRIS</p>
          <h1 className="mt-1 text-xl font-medium tracking-tight text-fg">Locator</h1>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-elevated px-3 py-1.5">
          <span
            className={cn(
              "size-1.5 rounded-full",
              connection === "ONLINE" ? "bg-ok" : connection === "DEGRADED" ? "bg-warn" : "bg-danger",
            )}
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">{connection}</span>
        </div>
      </header>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSearch();
        }}
      >
        <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted" htmlFor="osiris-query">
          Número, CGI o LAC
        </label>
        <input
          id="osiris-query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="334-2-318-34"
          className="h-11 rounded-[var(--radius-md)] bg-elevated px-3 font-mono text-sm text-fg shadow-[inset_0_0_0_1px_var(--color-border)] placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <Button type="submit" disabled={searching || !query.trim()}>
          <Search className="size-4" />
          {searching ? "Consultando" : "Buscar"}
        </Button>
      </form>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="sm" className="whitespace-nowrap" onClick={onGps}>
          <SatelliteDish className="size-3.5" />
          GPS propio
        </Button>
        <Button variant="secondary" size="sm" className="whitespace-nowrap" onClick={onAnalyze} disabled={selectedTowers.length === 0}>
          <Radio className="size-3.5" />
          Intersectar
        </Button>
      </div>

      <section className="min-h-0 flex-1 overflow-auto rounded-[var(--radius-lg)] bg-elevated p-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Resultado</p>
        {result ? (
          <dl className="mt-2">
            <Field
              label="Número"
              value={phone?.formattedInternational ?? phone?.e164 ?? phone?.raw ?? "—"}
            />
            <Field label="País" value={phone?.country ?? "desconocido"} />
            <Field
              label="Tipo"
              value={
                phone?.planSource && phone.numberType
                  ? `${numberTypeLabel(phone.numberType)}${phone.planValid ? "" : " · patrón no válido"} · plan, no ubicación`
                  : "—"
              }
            />
            <Field
              label="Área"
              value={
                phone?.areaCode
                  ? `${phone.areaCode} ${phone.areaLabel ?? ""} · no es coordenada`.trim()
                  : "—"
              }
            />
            <Field
              label="Operador"
              value={phone?.possibleOperator ?? result.associatedTowers[0]?.tower.operator ?? "sin evidencia"}
            />
            <Field label="Método" value={result.method} />
            <Field label="Confianza" value={result.confidence} />
            <Field label="Fuente" value={typeof result.source === "string" ? result.source : "mixed"} />
            <Field label="Posición" value={pos} />
            <Field label="Clase" value={result.positionKind} />
            <Field label="Actualizado" value={result.lastUpdate ?? "sin marca temporal"} />
          </dl>
        ) : (
          <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
            <p>
              Catálogo OpenCellID MCC 334
              {catalogReady ? ` · ${catalogCount.toLocaleString("es-MX")} celdas` : ""} + API mundial CGI y área.
            </p>
            {catalogMeta ? (
              <p className="font-mono text-[11px] text-muted">
                GSM {catalogMeta.radioCounts.GSM?.toLocaleString("es-MX") ?? 0} · UMTS{" "}
                {catalogMeta.radioCounts.UMTS?.toLocaleString("es-MX") ?? 0} · LTE{" "}
                {catalogMeta.radioCounts.LTE?.toLocaleString("es-MX") ?? 0}
              </p>
            ) : null}
            <p>
              Consulta CGI contra el catálogo México y la API OpenCellID mundial. En zoom 13+ el mapa pide celdas
              del recuadro. Un número sin evidencia no inventa coordenadas. El plan ITU (libphonenumber) clasifica
              el número: nunca es un GPS.
            </p>
          </div>
        )}
      </section>

      {result ? (
        <p className="text-[11px] leading-relaxed text-muted">{result.reason}</p>
      ) : (
        <p className="text-[11px] leading-relaxed text-muted">
          Ejemplos: 334-2-318-34 (CGI MX) · 310-410-7033-17811 (CGI mundial) · 334-20-535 (LAC)
        </p>
      )}
    </aside>
  );
}
