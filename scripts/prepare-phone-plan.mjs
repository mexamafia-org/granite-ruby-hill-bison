#!/usr/bin/env node
/**
 * Compile libphonenumber PhoneNumberMetadata.xml into a compact numbering plan.
 * Patterns identify country, type, and national format only. Never coordinates.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const XML_CANDIDATES = [
  path.join(ROOT, "attachments", "PhoneNumberMetadata.xml"),
  path.join("/home/workdir/attachments", "PhoneNumberMetadata.xml"),
];
const OUT = path.join(ROOT, "src", "lib", "osiris", "phone-plan.generated.ts");

const NAME_ES = {
  MX: "México",
  US: "Estados Unidos",
  CA: "Canadá",
  GT: "Guatemala",
  SV: "El Salvador",
  HN: "Honduras",
  NI: "Nicaragua",
  CR: "Costa Rica",
  PA: "Panamá",
  CO: "Colombia",
  VE: "Venezuela",
  EC: "Ecuador",
  PE: "Perú",
  BO: "Bolivia",
  PY: "Paraguay",
  UY: "Uruguay",
  AR: "Argentina",
  CL: "Chile",
  BR: "Brasil",
  ES: "España",
  CU: "Cuba",
  DO: "República Dominicana",
  PR: "Puerto Rico",
  HT: "Haití",
  JM: "Jamaica",
  BZ: "Belice",
  GY: "Guyana",
  SR: "Surinam",
  FR: "Francia",
  DE: "Alemania",
  IT: "Italia",
  GB: "Reino Unido",
  PT: "Portugal",
  NL: "Países Bajos",
  BE: "Bélgica",
  CH: "Suiza",
  AT: "Austria",
  IE: "Irlanda",
  PL: "Polonia",
  RU: "Rusia",
  UA: "Ucrania",
  TR: "Turquía",
  CN: "China",
  JP: "Japón",
  KR: "Corea del Sur",
  IN: "India",
  AU: "Australia",
  NZ: "Nueva Zelanda",
  ZA: "Sudáfrica",
  NG: "Nigeria",
  EG: "Egipto",
  MA: "Marruecos",
  IL: "Israel",
  AE: "Emiratos Árabes Unidos",
  SA: "Arabia Saudita",
  PH: "Filipinas",
  TH: "Tailandia",
  VN: "Vietnam",
  ID: "Indonesia",
  MY: "Malasia",
  SG: "Singapur",
  TW: "Taiwán",
  HK: "Hong Kong",
  GR: "Grecia",
  SE: "Suecia",
  NO: "Noruega",
  DK: "Dinamarca",
  FI: "Finlandia",
  CZ: "Chequia",
  HU: "Hungría",
  RO: "Rumanía",
  BG: "Bulgaria",
  HR: "Croacia",
  RS: "Serbia",
  SK: "Eslovaquia",
  SI: "Eslovenia",
  LT: "Lituania",
  LV: "Letonia",
  EE: "Estonia",
  IS: "Islandia",
  LU: "Luxemburgo",
  MT: "Malta",
  CY: "Chipre",
  AL: "Albania",
  BA: "Bosnia y Herzegovina",
  MK: "Macedonia del Norte",
  ME: "Montenegro",
  XK: "Kosovo",
  MD: "Moldavia",
  BY: "Bielorrusia",
  GE: "Georgia",
  AM: "Armenia",
  AZ: "Azerbaiyán",
  KZ: "Kazajistán",
  UZ: "Uzbekistán",
  PK: "Pakistán",
  BD: "Bangladés",
  LK: "Sri Lanka",
  NP: "Nepal",
  MM: "Myanmar",
  KH: "Camboya",
  LA: "Laos",
  MN: "Mongolia",
  AF: "Afganistán",
  IQ: "Irak",
  IR: "Irán",
  JO: "Jordania",
  LB: "Líbano",
  SY: "Siria",
  YE: "Yemen",
  KW: "Kuwait",
  QA: "Catar",
  BH: "Baréin",
  OM: "Omán",
  TN: "Túnez",
  DZ: "Argelia",
  LY: "Libia",
  SD: "Sudán",
  KE: "Kenia",
  TZ: "Tanzania",
  UG: "Uganda",
  ET: "Etiopía",
  GH: "Ghana",
  CI: "Costa de Marfil",
  SN: "Senegal",
  CM: "Camerún",
  AO: "Angola",
  MZ: "Mozambique",
  ZW: "Zimbabue",
  ZM: "Zambia",
  NA: "Namibia",
  BW: "Botsuana",
  MG: "Madagascar",
  MU: "Mauricio",
  RE: "Reunión",
  GP: "Guadalupe",
  MQ: "Martinica",
  GF: "Guayana Francesa",
  TT: "Trinidad y Tobago",
  BB: "Barbados",
  BS: "Bahamas",
  AG: "Antigua y Barbuda",
  LC: "Santa Lucía",
  GD: "Granada",
  VC: "San Vicente y las Granadinas",
  KN: "San Cristóbal y Nieves",
  DM: "Dominica",
  AW: "Aruba",
  CW: "Curazao",
  SX: "Sint Maarten",
  KY: "Islas Caimán",
  BM: "Bermudas",
  VI: "Islas Vírgenes de EE. UU.",
  VG: "Islas Vírgenes Británicas",
  AI: "Anguila",
  MS: "Montserrat",
  TC: "Islas Turcas y Caicos",
  GL: "Groenlandia",
  FO: "Islas Feroe",
  GI: "Gibraltar",
  AD: "Andorra",
  MC: "Mónaco",
  SM: "San Marino",
  VA: "Ciudad del Vaticano",
  LI: "Liechtenstein",
  "001": "Servicio internacional",
};

const TYPES = [
  "premiumRate",
  "tollFree",
  "sharedCost",
  "personalNumber",
  "voip",
  "pager",
  "uan",
  "voicemail",
  "mobile",
  "fixedLine",
];

function compactPattern(raw) {
  return raw
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function parseLengths(attr) {
  if (!attr) return [];
  const out = new Set();
  for (const part of attr.split(",")) {
    const p = part.trim();
    const range = p.match(/^\[(\d+)-(\d+)\]$/);
    if (range) {
      for (let n = Number(range[1]); n <= Number(range[2]); n++) out.add(n);
      continue;
    }
    if (/^\d+$/.test(p)) out.add(Number(p));
  }
  return [...out].sort((a, b) => a - b);
}

function commentName(block) {
  const m = block.match(/<!--\s*([^-]+?)\s*\(([A-Z0-9]{2,3})\)\s*-->/);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

function childPattern(block, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`);
  const m = block.match(re);
  if (!m) return null;
  const pat = m[1].match(/<nationalNumberPattern>([\s\S]*?)<\/nationalNumberPattern>/);
  const lens = m[1].match(/<possibleLengths([^>]*)\/>/);
  const national = lens?.[1].match(/national="([^"]+)"/)?.[1];
  if (!pat) return null;
  return { pat: compactPattern(pat[1]), len: parseLengths(national) };
}

function parseFormats(inner) {
  const formats = [];
  const re = /<numberFormat\b([^>]*)>([\s\S]*?)<\/numberFormat>/g;
  let m;
  while ((m = re.exec(inner))) {
    const attrs = m[1];
    const body = m[2];
    const pattern = attrs.match(/\bpattern="([^"]+)"/)?.[1];
    if (!pattern) continue;
    const npRule = attrs.match(/\bnationalPrefixFormattingRule="([^"]+)"/)?.[1] ?? null;
    const leadings = [...body.matchAll(/<leadingDigits>([\s\S]*?)<\/leadingDigits>/g)].map((x) =>
      compactPattern(x[1]),
    );
    const format = body.match(/<format>([\s\S]*?)<\/format>/)?.[1]?.trim() ?? null;
    const intlRaw = body.match(/<intlFormat>([\s\S]*?)<\/intlFormat>/)?.[1]?.trim() ?? null;
    if (!format) continue;
    formats.push({
      pat: compactPattern(pattern),
      leading: leadings.length ? leadings[leadings.length - 1] : null,
      fmt: format,
      intl: intlRaw === "NA" ? "NA" : intlRaw || null,
      npRule,
    });
  }
  return formats;
}

function parseTerritory(full, inner) {
  const id = inner.match(/\bid="([^"]+)"/)?.[1];
  const cc = inner.match(/\bcountryCode="([^"]+)"/)?.[1];
  if (!id || !cc) return null;
  const leading = inner.match(/\bleadingDigits="([^"]+)"/)?.[1] ?? null;
  const main = /\bmainCountryForCode="true"/.test(inner);
  const portable = /\bmobileNumberPortableRegion="true"/.test(inner);
  const np = inner.match(/\bnationalPrefix="([^"]+)"/)?.[1] ?? null;
  const nameEn = commentName(full) || id;
  const general = inner.match(
    /<generalDesc>[\s\S]*?<nationalNumberPattern>([\s\S]*?)<\/nationalNumberPattern>/,
  );
  const types = {};
  for (const tag of TYPES) {
    const t = childPattern(inner, tag);
    if (t?.pat) types[tag] = t;
  }
  return {
    id,
    cc,
    name: NAME_ES[id] || nameEn,
    leading: leading ? compactPattern(leading) : null,
    main,
    portable,
    np,
    general: general ? compactPattern(general[1]) : null,
    types,
    formats: parseFormats(inner),
  };
}

const xmlPath = XML_CANDIDATES.find((p) => fs.existsSync(p));
if (!xmlPath) {
  console.error("[phone-plan] PhoneNumberMetadata.xml not found");
  process.exit(1);
}

const xml = fs.readFileSync(xmlPath, "utf8");
const territories = [];
const re = /((?:<!--[\s\S]*?-->\s*)*)<territory\b([^>]*)>([\s\S]*?)<\/territory>/g;
let m;
while ((m = re.exec(xml))) {
  const t = parseTerritory(m[1], `${m[2]}>${m[3]}`);
  if (t) territories.push(t);
}

const byCc = {};
for (const t of territories) {
  (byCc[t.cc] ||= []).push(t.id);
}

const out = {
  source: "libphonenumber PhoneNumberMetadata.xml",
  license: "Apache-2.0",
  generatedAt: new Date().toISOString(),
  doctrine: "Numbering plan only. Never a coordinate, tower, or GPS fix.",
  territoryCount: territories.length,
  territories,
  byCc,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  `/* Autogenerated from PhoneNumberMetadata.xml. Numbering plan only — not coordinates. */\nexport const PHONE_PLAN_JSON = ${JSON.stringify(JSON.stringify(out))};\n`,
);
const kb = Math.round(Buffer.byteLength(JSON.stringify(out)) / 1024);
console.log(`[phone-plan] ${territories.length} territories → ${OUT} (${kb} KB payload)`);
