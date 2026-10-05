import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createFileRoute } from "@tanstack/react-router";
import { buildMeasurementRecord } from "@/lib/osiris/measurement-record";
import { apFromWigle, normalizeBssid } from "@/lib/osiris/wifi";

function wigleAuth(): string | null {
  const name = process.env.WIGLE_API_NAME?.trim();
  const token = process.env.WIGLE_API_TOKEN?.trim();
  if (!name || !token) return null;
  return `Basic ${Buffer.from(`${name}:${token}`).toString("base64")}`;
}

export const Route = createFileRoute("/api/wifi")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as { bssid?: unknown; phoneDigits?: unknown; measuredAt?: unknown } | null;
        const bssid = normalizeBssid(typeof body?.bssid === "string" ? body.bssid : "");
        if (!bssid) {
          return Response.json({ ap: null, reason: "BSSID inválido. No se inventa la red." }, { status: 400 });
        }
        const auth = wigleAuth();
        if (!auth) {
          return Response.json({
            ap: null,
            reason: "Sin clave de WiGLE en el servidor. No se inventa una red abierta.",
          });
        }
        const res = await fetch(`https://api.wigle.net/api/v2/network/detail?netid=${encodeURIComponent(bssid)}`, {
          headers: { Authorization: auth, Accept: "application/json" },
          signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) {
          return Response.json({ ap: null, reason: `WiGLE respondió ${res.status}. Sin coordenada inventada.` });
        }
        const json = (await res.json()) as { results?: unknown };
        const row = Array.isArray(json.results) ? json.results[0] : json.results;
        const ap = apFromWigle(row);
        if (!ap) {
          return Response.json({
            ap: null,
            reason: "Esa red no está publicada como abierta, o no tiene coordenada. No se inventa.",
          });
        }
        const registeredAt = new Date().toISOString();
        const record = buildMeasurementRecord(
          {
            id: `wifi-${ap.bssid}-${registeredAt}`,
            phoneDigits: typeof body?.phoneDigits === "string" ? body.phoneDigits : null,
            measuredAt: typeof body?.measuredAt === "string" ? body.measuredAt : null,
            origin: "measurement",
            wifi: ap,
          },
          registeredAt,
        );
        if (record) {
          const dir = join(process.cwd(), ".grok", "measurements");
          mkdirSync(dir, { recursive: true });
          const digest = createHash("sha256").update(record.id).digest("hex").slice(0, 16);
          const stamp = record.registeredAt.replace(/[:.]/g, "-");
          writeFileSync(join(dir, `${stamp}-${digest}.json`), JSON.stringify(record, null, 2));
        }
        return Response.json({ ap, registeredAt });
      },
    },
  },
});
