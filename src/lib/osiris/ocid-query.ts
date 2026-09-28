export type OcidQuery =
  | { kind: "cell"; mcc: number; net: number; area: number; cell: number }
  | { kind: "lac"; mcc: number; net: number; area: number };

const CGI_HINT = /cgi|cellid|cell-id|cid/i;
const LAC_HINT = /\blac\b|\btac\b/i;

function ints(raw: string): number[] {
  return raw
    .trim()
    .split(/[^\d]+/)
    .filter(Boolean)
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n));
}

/**
 * Parse CGI (MCC-MNC-LAC-CID) or LAC (MCC-MNC-LAC).
 * A 10-digit Mexican phone is NOT a CGI — numbering plan owns that path.
 */
export function parseOcidQuery(raw: string): OcidQuery | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parts = ints(trimmed);
  if (parts.length === 4) {
    const [mcc, net, area, cell] = parts;
    if (mcc >= 200 && mcc <= 999) return { kind: "cell", mcc, net, area, cell };
  }
  if (parts.length === 3 && (LAC_HINT.test(trimmed) || trimmed.split(/[-:,\s/]+/).length >= 3)) {
    const [mcc, net, area] = parts;
    if (mcc >= 200 && mcc <= 999) {
      if (CGI_HINT.test(trimmed)) return null;
      return { kind: "lac", mcc, net, area };
    }
  }
  if (parts.length === 3) {
    const [mcc, net, area] = parts;
    if (mcc >= 200 && mcc <= 999 && String(mcc).length === 3 && net <= 999 && trimmed.includes("-")) {
      return { kind: "lac", mcc, net, area };
    }
  }
  return null;
}

export function cgiKey(mcc: number, net: number, area: number, cell: number): string {
  return `${mcc}-${net}-${area}-${cell}`;
}

export function lacKey(mcc: number, net: number, area: number): string {
  return `${mcc}-${net}-${area}`;
}
