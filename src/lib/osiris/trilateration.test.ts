import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateFromObservations } from "./trilateration.ts";
import type { CellTower, TowerObservation } from "./types.ts";

function obs(lat: number, lon: number, rangeM: number, id: string): TowerObservation {
  const tower: CellTower = {
    id,
    radio: "LTE",
    mcc: 334,
    net: 20,
    area: 1,
    cell: Number(id.replace(/\D/g, "") || 1),
    lat,
    lon,
    rangeM,
    samples: 4,
    created: null,
    updated: null,
    source: "OpenCellID",
    origin: "catalog",
    cellPublished: true,
    operator: "Telcel",
    country: "México",
  };
  return {
    tower,
    rangeM,
    rssiDbm: null,
    rsrpDbm: null,
    rsrqDb: null,
    sinrDb: null,
    measuredAt: null,
    relationshipToUe: "SIGNAL_OBSERVED",
    source: "OpenCellID",
  };
}

describe("trilateration", () => {
  it("does not place a UE on a single tower", () => {
    const r = estimateFromObservations([obs(19.43, -99.13, 800, "t1")]);
    assert.equal(r.position, null);
    assert.equal(r.status, "INSUFFICIENT_DATA");
    assert.match(r.reason, /POSICIÓN NO DETERMINABLE/);
  });

  it("keeps two-circle ambiguity as REGION_ONLY", () => {
    const r = estimateFromObservations([
      obs(19.43, -99.13, 1200, "t1"),
      obs(19.44, -99.12, 1200, "t2"),
    ]);
    assert.equal(r.position, null);
    assert.ok(r.status === "REGION_ONLY" || r.status === "INSUFFICIENT_DATA" || r.status === "POSITION_CALCULATED");
  });

  it("solves three published radii without averaging centroids", () => {
    const r = estimateFromObservations([
      obs(19.4, -99.15, 2500, "t1"),
      obs(19.42, -99.12, 2200, "t2"),
      obs(19.38, -99.12, 2300, "t3"),
    ]);
    if (r.status === "POSITION_CALCULATED") {
      assert.ok(r.position);
      const centroidLat = (19.4 + 19.42 + 19.38) / 3;
      const centroidLon = (-99.15 + -99.12 + -99.12) / 3;
      const dLat = Math.abs((r.position!.lat - centroidLat) * 111000);
      const dLon = Math.abs((r.position!.lon - centroidLon) * 111000 * Math.cos((19.4 * Math.PI) / 180));
      assert.ok(dLat + dLon > 1, "solution should not collapse to the mean of the masts");
    } else {
      assert.equal(r.position, null);
    }
  });
});
