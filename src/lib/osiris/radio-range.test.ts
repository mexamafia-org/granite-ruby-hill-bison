import assert from "node:assert/strict";
import test from "node:test";
import { gsmTaOuterM, lteTaOuterM, radiusFromEvidence } from "./radio-range.ts";

test("GSM timing advance 0 is the first 550 m bin, not the tower", () => {
  assert.equal(gsmTaOuterM(0), 550);
  assert.equal(gsmTaOuterM(63), 64 * 550);
  assert.equal(gsmTaOuterM(64), null);
  assert.equal(gsmTaOuterM(1.5), null);
});

test("LTE timing advance uses 78.12 m and rejects a missing value", () => {
  assert.equal(lteTaOuterM(0), 78.12);
  assert.equal(lteTaOuterM(-1), null);
});

test("does not invent a radius when neither TA nor a published range exists", () => {
  assert.deepEqual(radiusFromEvidence({ radio: "GSM", ta: null, publishedRangeM: null }), {
    rangeM: null,
    source: "none",
  });
});

test("uses the tighter of a real TA and the published range", () => {
  const r = radiusFromEvidence({ radio: "GSM", ta: 1, publishedRangeM: 800 });
  assert.equal(r.source, "ta");
  assert.equal(r.rangeM, 800);
});

test("does not apply the GSM step to UMTS or NR", () => {
  assert.equal(radiusFromEvidence({ radio: "UMTS", ta: 2, publishedRangeM: null }).rangeM, null);
  assert.equal(radiusFromEvidence({ radio: "NR", ta: 2, publishedRangeM: 400 }).source, "catalog");
});
