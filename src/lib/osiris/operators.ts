/** Public MCC/MNC and Mexican numbering metadata. No coordinates. */

import { MCC_COUNTRY } from "./mcc-countries.ts";

export { MCC_COUNTRY };

export const MNC_OPERATOR: Record<string, string> = {
  "334-1": "Comercializadora de Telefonía",
  "334-2": "Telcel",
  "334-3": "Movistar",
  "334-20": "Telcel",
  "334-30": "Movistar",
  "334-50": "AT&T Mexico",
  "334-90": "AT&T Mexico",
  "334-95": "AT&T Mexico",
  "334-140": "Altan Redes",
  "310-120": "Sprint",
  "310-150": "AT&T",
  "310-260": "T-Mobile",
  "310-410": "AT&T",
  "311-480": "Verizon",
  "732-101": "Claro",
  "732-103": "Tigo",
  "732-123": "Movistar",
  "714-1": "Cable & Wireless",
  "714-3": "Claro",
  "714-20": "Movistar",
  "704-1": "Claro",
  "704-2": "Tigo",
  "704-3": "Movistar",
  "706-1": "Claro",
  "706-2": "Digicel",
  "706-3": "Tigo",
  "708-1": "Claro",
  "708-2": "Tigo",
  "710-21": "Claro",
  "710-30": "Movistar",
  "712-3": "Claro",
  "712-4": "Movistar",
  "716-6": "Movistar",
  "716-10": "Claro",
  "722-7": "Movistar",
  "722-34": "Personal",
  "724-5": "Claro",
  "724-6": "Vivo",
  "724-10": "Vivo",
  "730-1": "Entel",
  "730-2": "Movistar",
  "730-3": "Claro",
};

/** Mexican LADA labels — numbering plan only, never used as a location. */
export const MX_LADA: Record<string, string> = {
  "33": "Guadalajara",
  "55": "Ciudad de México",
  "56": "Ciudad de México",
  "81": "Monterrey",
  "222": "Puebla",
  "228": "Xalapa",
  "229": "Veracruz",
  "442": "Querétaro",
  "443": "Morelia",
  "444": "San Luis Potosí",
  "449": "Aguascalientes",
  "461": "Celaya",
  "462": "Irapuato",
  "477": "León",
  "614": "Chihuahua",
  "618": "Durango",
  "644": "Ciudad Obregón",
  "656": "Ciudad Juárez",
  "662": "Hermosillo",
  "664": "Tijuana",
  "667": "Culiacán",
  "669": "Mazatlán",
  "686": "Mexicali",
  "744": "Acapulco",
  "777": "Cuernavaca",
  "800": "Número no geográfico",
  "899": "Reynosa",
  "921": "Coatzacoalcos",
};

export function mxAreaLabel(national: string): { areaCode: string; areaLabel: string } | null {
  if (national.length < 10) return null;
  const two = national.slice(0, 2);
  if (two === "33" || two === "55" || two === "56" || two === "81") {
    return { areaCode: two, areaLabel: MX_LADA[two] ?? "LADA" };
  }
  const three = national.slice(0, 3);
  return { areaCode: three, areaLabel: MX_LADA[three] ?? "LADA" };
}

export function operatorOf(mcc: number, net: number): string | null {
  return MNC_OPERATOR[`${mcc}-${net}`] ?? null;
}

export function countryOfMcc(mcc: number): string | null {
  return MCC_COUNTRY[mcc] ?? null;
}
