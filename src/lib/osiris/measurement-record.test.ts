import assert from "node:assert/strict";
import test from "node:test";
import { buildMeasurementRecord } from "./measurement-record.ts";

const AT = "2026-10-04T01:21:00.000Z";

test("keeps the registration clock and does not invent a radio time", () => {
  const record = buildMeasurementRecord(
    { id: "interaction-334-2-1-9", origin: "interaction", phoneDigits: null, cells: [{ mcc: 334, net: 2, area: 1, cell: 9 }] },
    AT,
  );
  assert.ok(record);
  assert.equal(record.registeredAt, AT);
  assert.equal(record.measuredAt, null);
  assert.equal(record.phoneDigits, null);
  assert.equal("lat" in record, false);
});

test("does not attach a phone the sample did not carry", () => {
  const record = buildMeasurementRecord({ id: "s", phoneDigits: "123", cells: [] }, AT);
  assert.equal(record?.phoneDigits, null);
});

test("keeps a real phone and a real measurement time", () => {
  const record = buildMeasurementRecord(
    {
      id: "voip-1",
      origin: "voip",
      phoneDigits: "+52 222 123 4567",
      cells: [{ mcc: 334, net: 20, area: 100, cell: 5, measuredAt: "2026-10-03T18:00:00.000Z" }],
    },
    AT,
  );
  assert.equal(record?.phoneDigits, "522221234567");
  assert.equal(record?.measuredAt, "2026-10-03T18:00:00.000Z");
});

test("rejects a record when the registration clock is not a time", () => {
  assert.equal(buildMeasurementRecord({ id: "s" }, "ayer"), null);
});
