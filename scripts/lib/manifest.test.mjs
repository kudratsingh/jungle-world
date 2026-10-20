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

test("only CC0, CC BY 3.0, CC BY 4.0 and Own pass; paid files fail closed; forbidden licences never pass (WO-051)", () => {
  const by4 = { ...cc0, licence: "CC-BY-4.0", licenceUrl: "https://creativecommons.org/licenses/by/4.0/" };
  assert.deepEqual(validateManifest(manifest(by4)), []);
  assert.deepEqual(validateManifest(manifest({ ...by4, licence: "CC-BY-3.0", licenceUrl: "https://creativecommons.org/licenses/by/3.0/" })), []);
  assert.match(validateManifest(manifest({ ...cc0, licence: "LicenseRef-Paid", licenceUrl: "https://www.fab.com/eula" })).join(), /paid files are refused here until the ADR at the first purchase/);
  assert.match(validateManifest(manifest({ ...cc0, licence: "MIT", licenceUrl: "https://opensource.org/license/mit" })).join(), /licence MIT is outside CC0-1\.0, CC-BY-3\.0, CC-BY-4\.0, Own/);
  for (const licence of ["CC-BY-NC-4.0", "CC BY-NC 4.0", "CC_BY_NC_4.0", "Attribution-NonCommercial-4.0", "CC BY-SA 4.0", "CC-BY-ND-4.0", "BBC-RemArc"]) {
    assert.match(validateManifest(manifest({ ...by4, licence })).join(), /is never allowed/, licence);
  }
  assert.match(validateManifest(manifest({ ...by4, licenceUrl: "https://creativecommons.org/licenses/by-nc/4.0/" })).join(), /CC-BY-4\.0 .* is never allowed/);
});

test("own work: author Kudrat Singh, a sourceUrl inside this repository, a tool and version in the title (WO-051)", () => {
  assert.match(validateManifest(manifest({ ...own, author: "Mallory" })).join(), /author must be Kudrat Singh/);
  for (const sourceUrl of ["https://github.com/kudratsingh/jungle-world-evil", "https://github.com/kudratsingh/jungle-world/../jungle-assets", "https://github.com/kudratsingh/jungle-world/%2e%2e/jungle-assets", "https://github.com.evil.com/kudratsingh/jungle-world", "http://github.com/kudratsingh/jungle-world"]) {
    assert.match(validateManifest(manifest({ ...own, sourceUrl })).join(), /sourceUrl must be inside https:\/\/github\.com\/kudratsingh\/jungle-world/, sourceUrl);
  }
  assert.deepEqual(validateManifest(manifest({ ...own, sourceUrl: "https://github.com/kudratsingh/jungle-world/tree/main" })), []);
  assert.match(validateManifest(manifest({ ...own, title: "EZ-Tree" })).join(), /title must end with its tool's name and version/);
});
