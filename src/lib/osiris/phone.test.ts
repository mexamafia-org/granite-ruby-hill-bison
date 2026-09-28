import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePhoneNumber } from "./phone.ts";
import { matchNumberingPlan, numberTypeLabel } from "./phone-plan.ts";
import { lookupTarget } from "./lookup.ts";
import { parseOcidQuery } from "./ocid-query.ts";

describe("libphonenumber numbering plan", () => {
  it("classifies a Mexican national number without turning LADA into a fix", () => {
    const phone = parsePhoneNumber("+52 222 123 4567");
    assert.equal(phone.countryCode, "52");
    assert.equal(phone.country, "México");
    assert.equal(phone.nationalNumber, "2221234567");
    assert.equal(phone.e164, "+522221234567");
    assert.equal(phone.areaCode, "222");
    assert.equal(phone.areaLabel, "Puebla");
    assert.equal(phone.planValid, true);
    assert.equal(phone.planSource, "libphonenumber");
    assert.equal(phone.numberType, "fixed_or_mobile");
    assert.match(phone.formattedNational ?? "", /222/);
    assert.match(numberTypeLabel(phone.numberType!), /fijo o móvil/);
  });

  it("formats CDMX 2-digit LADA from XML availableFormats", () => {
    const phone = parsePhoneNumber("5512345678");
    assert.equal(phone.countryCode, "52");
    assert.equal(phone.areaCode, "55");
    assert.match(phone.formattedNational ?? "", /^55 /);
  });

  it("strips the retired +52 1 mobile token", () => {
    const phone = parsePhoneNumber("5212221234567");
    assert.equal(phone.e164, "+522221234567");
    assert.equal(phone.nationalNumber, "2221234567");
    assert.equal(phone.planValid, true);
  });

  it("strips historic 01 national prefix", () => {
    const phone = parsePhoneNumber("012221234567");
    assert.equal(phone.nationalNumber, "2221234567");
    assert.equal(phone.planValid, true);
  });

  it("labels toll-free and premium from the plan", () => {
    const tf = parsePhoneNumber("8001234567");
    assert.equal(tf.numberType, "tollFree");
    assert.equal(tf.countryCode, "52");
    const pr = parsePhoneNumber("+529001234567");
    assert.equal(pr.numberType, "premiumRate");
  });

  it("resolves a US E.164 against NANP metadata", () => {
    const phone = parsePhoneNumber("+12025550123");
    assert.equal(phone.countryCode, "1");
    assert.equal(phone.country, "Estados Unidos");
    assert.equal(phone.planSource, "libphonenumber");
    assert.equal(phone.areaLabel, null);
  });

  it("identifies Puerto Rico by leading digits, not as a map pin", () => {
    const phone = parsePhoneNumber("+17875550100");
    assert.equal(phone.countryCode, "1");
    assert.equal(phone.country, "Puerto Rico");
  });

  it("does not treat a 10-digit MX number as UK +44", () => {
    const phone = parsePhoneNumber("2221234567");
    assert.equal(phone.countryCode, "52");
    assert.equal(phone.country, "México");
  });

  it("does not invent coordinates from a valid numbering-plan hit", () => {
    const r = lookupTarget("2221234567", {
      kmlFeatures: [],
      phoneEvidence: {},
      liveTelemetry: [],
      catalogTowersByCgi: [],
      selectedTowers: [],
    });
    assert.equal(r.phone.planValid, true);
    assert.equal(r.phone.country, "México");
    assert.equal(r.estimatedPosition, null);
    assert.equal(r.positionKind, "NOT_DETERMINED");
  });

  it("rejects a too-short string as not a plan match", () => {
    const phone = parsePhoneNumber("12345");
    assert.equal(phone.planValid, false);
    assert.equal(phone.numberType, null);
    assert.equal(phone.countryCode, null);
  });

  it("does not parse a national phone as CGI", () => {
    assert.equal(parseOcidQuery("2221234567"), null);
    assert.equal(parseOcidQuery("+52 222 123 4567"), null);
    const cgi = parseOcidQuery("334-2-318-34");
    assert.ok(cgi && cgi.kind === "cell");
    assert.equal(cgi.cell, 34);
  });

  it("exposes 254 territories from the compiled XML", () => {
    const mx = matchNumberingPlan("522221234567");
    assert.ok(mx);
    assert.equal(mx.territory.id, "MX");
    assert.equal(mx.valid, true);
    assert.match(mx.formattedInternational, /\+52/);
  });
});
