import { createFileRoute } from "@tanstack/react-router";
import {
  lookupBboxCatalog,
  lookupCgiCatalog,
  lookupLacCatalog,
  resolveCatalogCells,
  loadMeta,
} from "@/lib/osiris/ocid-db.server";
import { liveLookupArea, liveLookupCgi } from "@/lib/osiris/ocid-live";
import { CATALOG_LIVE_MIN_ZOOM, CATALOG_MIN_ZOOM, mergePreferCgi } from "@/lib/osiris/catalog";
import { bboxAreaKm2 } from "@/lib/osiris/geo";
import { MAX_LIVE_AREA_KM2 } from "@/lib/osiris/catalog";

function num(sp: URLSearchParams, key: string): number | null {
  const v = sp.get(key);
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const Route = createFileRoute("/api/ocid")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const kind = url.searchParams.get("kind") ?? "stats";
        try {
          if (kind === "stats") {
            return Response.json({ meta: loadMeta() });
          }
          if (kind === "cell") {
            const mcc = num(url.searchParams, "mcc");
            const net = num(url.searchParams, "net");
            const area = num(url.searchParams, "area");
            const cell = num(url.searchParams, "cell");
            if (mcc == null || net == null || area == null || cell == null) {
              return Response.json({ error: "mcc, net, area, cell required" }, { status: 400 });
            }
            const catalog = lookupCgiCatalog({ mcc, net, area, cell });
            if (catalog) return Response.json({ tower: catalog, origin: "catalog" });
            if (url.searchParams.get("live") === "1") {
              const live = await liveLookupCgi({ mcc, net, area, cell });
              return Response.json({ tower: live, origin: live ? "live" : null });
            }
            return Response.json({ tower: null, origin: null });
          }
          if (kind === "lac") {
            const mcc = num(url.searchParams, "mcc");
            const net = num(url.searchParams, "net");
            const area = num(url.searchParams, "area");
            if (mcc == null || net == null || area == null) {
              return Response.json({ error: "mcc, net, area required" }, { status: 400 });
            }
            const towers = lookupLacCatalog({ mcc, net, area });
            return Response.json({
              towers,
              total: towers.length,
              reason: towers.length
                ? `LAC ${mcc}-${net}-${area}: ${towers.length} celdas de catálogo MCC 334.`
                : `LAC ${mcc}-${net}-${area} sin celdas en el catálogo MCC 334.`,
            });
          }
          if (kind === "bbox") {
            const west = num(url.searchParams, "west");
            const south = num(url.searchParams, "south");
            const east = num(url.searchParams, "east");
            const north = num(url.searchParams, "north");
            const zoom = num(url.searchParams, "zoom") ?? 0;
            if (west == null || south == null || east == null || north == null) {
              return Response.json({ error: "bbox required" }, { status: 400 });
            }
            if (zoom < CATALOG_MIN_ZOOM) {
              return Response.json({
                towers: [],
                reason: `Zoom ${zoom} < ${CATALOG_MIN_ZOOM}: el catálogo no se pinta a esta escala.`,
              });
            }
            const wantCatalog = url.searchParams.get("catalog") !== "0";
            const catalog = wantCatalog ? lookupBboxCatalog({ west, south, east, north }) : [];
            let live: typeof catalog = [];
            let liveReason = "";
            if (url.searchParams.get("live") === "1" && zoom >= CATALOG_LIVE_MIN_ZOOM) {
              const km2 = bboxAreaKm2(west, south, east, north);
              if (km2 > MAX_LIVE_AREA_KM2) {
                liveReason = `Recuadro ${km2.toFixed(0)} km² > ${MAX_LIVE_AREA_KM2} km²; API en vivo omitida.`;
              } else {
                const area = await liveLookupArea({ west, south, east, north });
                live = area.towers;
                liveReason = area.reason;
              }
            }
            const towers = mergePreferCgi([catalog, live]);
            return Response.json({
              towers,
              reason: `${catalog.length} catálogo MCC 334${live.length ? ` + ${live.length} en vivo` : ""}. ${liveReason}`.trim(),
            });
          }
          return Response.json({ error: "unknown kind" }, { status: 400 });
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : "ocid failure" },
            { status: 500 },
          );
        }
      },
      POST: async ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("kind") !== "resolve") {
          return Response.json({ error: "POST requires kind=resolve" }, { status: 400 });
        }
        const body = (await request.json()) as {
          cells?: Array<{ mcc: number; net: number; area: number; cell: number }>;
        };
        const cells = Array.isArray(body.cells) ? body.cells.slice(0, 40) : [];
        const catalog = resolveCatalogCells(cells);
        const missing = cells.filter(
          (c) =>
            !catalog.some((t) => t.mcc === c.mcc && t.net === c.net && t.area === c.area && t.cell === c.cell),
        );
        const live = [];
        for (const c of missing) {
          const t = await liveLookupCgi(c);
          if (t) live.push(t);
        }
        return Response.json({ towers: mergePreferCgi([catalog, live]) });
      },
    },
  },
});
