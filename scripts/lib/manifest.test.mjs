import assert from "node:assert/strict";
import { test } from "node:test";
import { validateManifest } from "./manifest.mjs";

// Protects the copy of the manifest contract: own work (ADR 0016) has no licence URL, every other licence
// needs one, and a private-build file (WO-051) never passes into a jungle-world release.

const own = { title: "EZ-Tree 1.1.0", author: "Kudrat Singh", authorUrl: "https://github.com/kudratsingh", sourceUrl: "https://github.com/kudratsingh/jungle-world", licence: "Own", dateChecked: "2026-10-10", modified: true };
const cc0 = { ...own, title: "Fern 02", author: "A", sourceUrl: "https://polyhaven.com/a/fern_02", licence: "CC0-1.0", licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/" };
const manifest = (licence, extra = {}) => ({
  release: "world-1",
  base: "/jungle-world/files/",
  toolchain: { node: "22" },
  sourceCommit: "a".repeat(40),
  files: [{ id: "tree", name: `tree.${"1".repeat(12)}.glb`, hash: "1".repeat(64), bytes: 10, kind: "model", zone: "clearing", stage: "first-playable", profile: "both", licence, ...extra }],
});

test("own work passes without a licence URL and fails with one", () => {
  assert.deepEqual(validateManifest(manifest(own)), []);
  assert.match(validateManifest(manifest({ ...own, licenceUrl: "https://example.com/terms" })).join(), /licenceUrl must be absent for own work/);
});

test("every other licence still needs its licence URL", () => {
  assert.deepEqual(validateManifest(manifest(cc0)), []);
  const { licenceUrl, ...noUrl } = cc0;
  assert.ok(licenceUrl);
  assert.match(validateManifest(manifest(noUrl)).join(), /licenceUrl must be an https URL/);
});

test("a file carrying deliveryPath never passes into a jungle-world release", () => {
  assert.match(validateManifest(manifest(cc0, { deliveryPath: "private-build" })).join(), /unknown field deliveryPath/);
});
