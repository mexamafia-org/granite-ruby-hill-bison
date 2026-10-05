import assert from "node:assert/strict";
import test from "node:test";
import { apFromWigle, normalizeBssid } from "./wifi.ts";

test("normalizes a BSSID and rejects a short one", () => {
  assert.equal(normalizeBssid("aa-bb-cc-dd-ee-ff"), "AA:BB:CC:DD:EE:FF");
  assert.equal(normalizeBssid("aabbccddeeff"), "AA:BB:CC:DD:EE:FF");
  assert.equal(normalizeBssid("aa:bb"), null);
});

test("keeps an open network with a published point", () => {
  const ap = apFromWigle({
    netid: "aabbccddeeff",
    ssid: "abierta",
    encryption: "none",
    trilat: 19.43,
    trilong: -99.13,
    lastupdt: "2026-01-02T00:00:00.000Z",
  });
  assert.equal(ap?.bssid, "AA:BB:CC:DD:EE:FF");
  assert.equal(ap?.lat, 19.43);
  assert.equal(ap?.encryption, "none");
});

test("drops a protected network and a missing coordinate", () => {
  assert.equal(apFromWigle({ netid: "aabbccddeeff", encryption: "wpa2", trilat: 19, trilong: -99 }), null);
  assert.equal(apFromWigle({ netid: "aabbccddeeff", encryption: "none", trilat: 0, trilong: 0 }), null);
  assert.equal(apFromWigle({ netid: "aabbccddeeff", encryption: "none" }), null);
});
