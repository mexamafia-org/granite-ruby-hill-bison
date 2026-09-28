import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseOcidQuery } from "./ocid-query.ts";

describe("parseOcidQuery", () => {
  it("parses CGI with dashes", () => {
    const q = parseOcidQuery("334-2-318-34");
    assert.deepEqual(q, { kind: "cell", mcc: 334, net: 2, area: 318, cell: 34 });
  });

  it("parses LAC triplets", () => {
    const q = parseOcidQuery("334-20-535");
    assert.deepEqual(q, { kind: "lac", mcc: 334, net: 20, area: 535 });
  });

  it("rejects short country codes that are not MCC", () => {
    assert.equal(parseOcidQuery("52-10-20-30"), null);
  });
});
