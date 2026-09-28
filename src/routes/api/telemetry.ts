import { createFileRoute } from "@tanstack/react-router";

/**
 * Live telemetry ingest. Empty store is the honest state:
 * issabel_last_calls.json is [] and no invented samples are emitted.
 */
const samples: unknown[] = [];

export const Route = createFileRoute("/api/telemetry")({
  server: {
    handlers: {
      GET: async () => Response.json({ samples, waiting: true }),
      POST: async ({ request }) => {
        const body = await request.json();
        if (body && typeof body === "object" && typeof (body as { id?: unknown }).id === "string") {
          samples.unshift(body);
          if (samples.length > 50) samples.length = 50;
        }
        return Response.json({ ok: true, n: samples.length });
      },
    },
  },
});
