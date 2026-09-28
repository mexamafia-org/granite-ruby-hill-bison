import { useMemo, useState } from "react";
import { Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDossier } from "@/lib/osiris/dossier";
import { numberTypeLabel } from "@/lib/osiris/phone-plan";
import { parsePhoneNumber } from "@/lib/osiris/phone";

export function TargetSetup() {
  const cases = useDossier((s) => s.cases);
  const openCase = useDossier((s) => s.openCase);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState("");

  const preview = useMemo(() => (raw.trim() ? parsePhoneNumber(raw) : null), [raw]);

  const submit = (value: string) => {
    const result = openCase(value);
    if (!result.ok) setError(result.reason);
  };

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span className="size-2 rounded-full bg-ok" />
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">OSIRIS</p>
          <h1 className="text-lg font-medium tracking-tight">Apertura de caso</h1>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6 px-4 py-8">
        <div className="flex items-start gap-3">
          <Crosshair className="mt-1 size-5 text-accent" />
          <p className="text-sm leading-relaxed text-muted">
            El número no está fijo. Cada localización empieza con el número que ingreses aquí. Las
            observaciones de torres y las comunicaciones se guardan solo en este navegador: no se
            publican y no se convierten en coordenadas por sí solas.
          </p>
        </div>
        <form
          className="flex flex-col gap-3 rounded-[var(--radius-xl)] bg-surface p-4 shadow-[var(--shadow-panel)]"
          onSubmit={(e) => {
            e.preventDefault();
            submit(raw);
          }}
        >
          <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted" htmlFor="case-number">
            Número a localizar
          </label>
          <input
            id="case-number"
            value={raw}
            autoFocus
            autoComplete="off"
            inputMode="tel"
            onChange={(e) => {
              setRaw(e.target.value);
              setError("");
            }}
            placeholder="Ingresa el número de este caso"
            className="h-12 rounded-[var(--radius-md)] bg-elevated px-3 font-mono text-base text-fg shadow-[inset_0_0_0_1px_var(--color-border)] placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          {preview && preview.digits.length >= 8 ? (
            <p className="text-xs leading-relaxed text-muted">
              {preview.country ?? "País no clasificado"}
              {preview.numberType ? ` · ${numberTypeLabel(preview.numberType)}` : ""}
              {preview.planValid ? "" : " · patrón no confirmado"}. El plan de numeración no es una
              ubicación.
            </p>
          ) : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button type="submit">Abrir expediente</Button>
        </form>
        {cases.length > 0 ? (
          <section>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Casos en este navegador</p>
            <ul className="mt-2 space-y-2">
              {cases.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => submit(c.raw)}
                    className="flex w-full items-center justify-between rounded-[var(--radius-md)] bg-surface px-3 py-3 text-left"
                  >
                    <span className="font-mono text-sm text-fg">{c.raw}</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                      {c.observations.length} obs
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
