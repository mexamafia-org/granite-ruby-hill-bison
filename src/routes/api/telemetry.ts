import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createFileRoute } from "@tanstack/react-router";
import { buildMeasurementRecord, type MeasurementRecord } from "@/lib/osiris/measurement-record";

/**
 * Telemetry the app actually received.
 * Empty store is the honest state: nothing is synthesized.
 * Files stay under .grok/ so a phone number is not committed.
 */
const DIR = join(process.cwd(), ".grok");
const FILE = join(DIR, "telemetry.json");
const RECORDS = join(DIR, "measurements");
const MAX = 50;
const MAX_FILES = 200;

function loadSamples(): unknown[] {
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as unknown;
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function saveSamples(samples: unknown[]) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(samples.slice(0, MAX)));
}

function loadRecords(): MeasurementRecord[] {
  try {
    const names = readdirSync(RECORDS)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .slice(-MAX_FILES);
    const out: MeasurementRecord[] = [];
    for (const name of names) {
      try {
        const parsed = JSON.parse(readFileSync(join(RECORDS, name), "utf8")) as MeasurementRecord;
        if (parsed && typeof parsed.id === "string" && typeof parsed.registeredAt === "string") out.push(parsed);
      } catch {
        /* skip a broken file */
      }
    }
    return out;
  } catch {
    return [];
  }
}

function writeRecord(sample: unknown) {
  const registeredAt = new Date().toISOString();
  const record = buildMeasurementRecord(sample, registeredAt);
  if (!record) return;
  mkdirSync(RECORDS, { recursive: true });
  const digest = createHash("sha256").update(record.id).digest("hex").slice(0, 16);
  const stamp = record.registeredAt.replace(/[:.]/g, "-");
  writeFileSync(join(RECORDS, `${stamp}-${digest}.json`), JSON.stringify(record, null, 2));
  const names = readdirSync(RECORDS).filter((name) => name.endsWith(".json")).sort();
  for (const name of names.slice(0, Math.max(0, names.length - MAX_FILES))) {
    unlinkSync(join(RECORDS, name));
  }
}

export const Route = createFileRoute("/api/telemetry")({
  server: {
    handlers: {
      GET: async () => {
        const samples = loadSamples();
        return Response.json({ samples, records: loadRecords(), waiting: samples.length === 0 });
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
        writeRecord(body);
        return Response.json({ ok: true, n: Math.min(samples.length, MAX) });
      },
    },
  },
});
