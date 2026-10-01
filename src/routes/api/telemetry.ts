import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createFileRoute } from "@tanstack/react-router";

/**
 * Telemetry the app actually received.
 * Empty file is the honest state: nothing is synthesized.
 * Stored under .grok/ so a phone number in a sample is not committed.
 */
const FILE = join(process.cwd(), ".grok", "telemetry.json");
const MAX = 50;

function loadSamples(): unknown[] {
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as unknown;
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function saveSamples(samples: unknown[]) {
  mkdirSync(join(process.cwd(), ".grok"), { recursive: true });
  writeFileSync(FILE, JSON.stringify(samples.slice(0, MAX)));
}

export const Route = createFileRoute("/api/telemetry")({
  server: {
    handlers: {
      GET: async () => {
        const samples = loadSamples();
        return Response.json({ samples, waiting: samples.length === 0 });
      },
      POST: async ({ request }) => {
        const body = await request.json();
        if (!body || typeof body !== "object" || typeof (body as { id?: unknown }).id !== "string") {
          return Response.json({ ok: false, error: "id requerido" }, { status: 400 });
        }
        const samples = loadSamples().filter((row) => {
          return !row || typeof row !== "object" || (row as { id?: unknown }).id !== (body as { id: string }).id;
        });
        samples.unshift(body);
        saveSamples(samples);
        return Response.json({ ok: true, n: Math.min(samples.length, MAX) });
      },
    },
  },
});
