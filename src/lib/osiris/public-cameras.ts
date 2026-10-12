/**
 * Freely published views only.
 * Police, C5 and private CCTV are not listed, even if they exist in the city.
 * A camera coordinate is the place of the camera, not a phone.
 */

export interface PublicCamera {
  id: string;
  name: string;
  place: string;
  lat: number;
  lon: number;
  publisher: string;
  /** Current public live of that channel. Empty when the publisher is not transmitting. */
  embedUrl: string;
  watchUrl: string;
}

export const PUBLIC_CAMERAS: PublicCamera[] = [
  {
    id: "contemplamex-francia",
    name: "Centro Histórico",
    place: "Hotel Francia, Avenida Francisco I. Madero 113-A",
    lat: 21.8811491,
    lon: -102.2952011,
    publisher: "ContemplaMex, transmisión pública",
    embedUrl: "https://www.youtube-nocookie.com/embed/live_stream?channel=UCVA3qpOqJro-q92lCD3zzAg",
    watchUrl: "https://www.youtube.com/@ContemplaMex/live",
  },
];
