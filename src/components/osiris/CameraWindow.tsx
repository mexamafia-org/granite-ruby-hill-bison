import { PUBLIC_CAMERAS } from "@/lib/osiris/public-cameras";

export function CameraWindow({
  onClose,
  onFocus,
}: {
  onClose: () => void;
  onFocus: (lat: number, lon: number) => void;
}) {
  return (
    <section className="absolute bottom-3 right-3 z-[500] flex max-h-[calc(100%-1.5rem)] w-[min(440px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-[var(--radius-sm)] border border-border bg-bg shadow-lg">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg">Cámaras de libre acceso</p>
        <button type="button" onClick={onClose} className="ml-auto text-[11px] text-muted">
          Cerrar
        </button>
      </header>
      <div className="space-y-3 overflow-y-auto p-3">
        <p className="text-[11px] leading-relaxed text-muted">
          Solo vistas publicadas para cualquiera. Las cámaras del C5 y las privadas no están aquí. Esta ventana no localiza un teléfono.
        </p>
        {PUBLIC_CAMERAS.map((cam) => (
          <article key={cam.id} className="overflow-hidden rounded-[var(--radius-sm)] border border-border">
            <iframe
              title={cam.name}
              src={cam.embedUrl}
              className="aspect-video w-full bg-black"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
            <div className="space-y-1 p-2 text-[11px] text-muted">
              <p className="font-semibold text-fg">{cam.name}</p>
              <p>{cam.place}</p>
              <p>{cam.publisher}</p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onFocus(cam.lat, cam.lon)}
                  className="h-8 rounded-[var(--radius-sm)] bg-elevated px-2 text-[11px] text-fg"
                >
                  Ver lugar
                </button>
                <a
                  href={cam.watchUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center rounded-[var(--radius-sm)] bg-accent px-2 text-[11px] font-semibold text-accent-fg"
                >
                  Abrir ventana
                </a>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
