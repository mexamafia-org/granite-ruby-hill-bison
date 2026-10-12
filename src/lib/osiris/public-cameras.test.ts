import assert from "node:assert/strict";
import test from "node:test";
import { PUBLIC_CAMERAS } from "./public-cameras.ts";

test("only lists a published Aguascalientes view, not a police feed", () => {
  assert.equal(PUBLIC_CAMERAS.length, 1);
  const cam = PUBLIC_CAMERAS[0];
  assert.equal(cam.place.includes("Hotel Francia"), true);
  assert.equal(cam.embedUrl.startsWith("https://www.youtube-nocookie.com/"), true);
  assert.equal(JSON.stringify(PUBLIC_CAMERAS).toLowerCase().includes("c5"), false);
});
