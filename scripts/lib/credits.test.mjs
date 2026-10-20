import assert from "node:assert/strict";
import { test } from "node:test";
import { creditsFromManifests, creditsHtml } from "./credits.mjs";

const licence = (over = {}) => ({
  title: "Forest Floor",
  author: "eye-candy.xyz",
  authorUrl: "https://polyhaven.com/all?a=eye-candy.xyz",
  sourceUrl: "https://polyhaven.com/a/forest_floor",
  licence: "CC0-1.0",
  licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  dateChecked: "2026-10-10",
  modified: true,
  ...over,
});
const by = licence({ title: "Toucan <b>", author: "A & B", authorUrl: "https://sketchfab.com/ab", sourceUrl: "https://sketchfab.com/3d-models/toucan", licence: "CC-BY-4.0", licenceUrl: "https://creativecommons.org/licenses/by/4.0/" });

test("files from one source become one credit, across releases", () => {
  const credits = creditsFromManifests([
    { release: "world-0", files: [{ id: "a", name: "a.111111111111.ktx2", licence: licence() }, { id: "b", name: "b.222222222222.ktx2", licence: licence() }] },
    { release: "world-1", files: [{ id: "a", name: "a.333333333333.ktx2", licence: licence() }, { id: "t", name: "t.444444444444.glb", licence: by }] },
  ]);
  assert.deepEqual(credits.releases, ["world-0", "world-1"]);
  assert.equal(credits.sources.length, 2);
  const floor = credits.sources.find((s) => s.title === "Forest Floor");
  assert.equal(floor.files.length, 3);
  assert.equal(floor.attributionRequired, false);
  const toucan = credits.sources.find((s) => s.licence === "CC-BY-4.0");
  assert.equal(toucan.attributionRequired, true);
  assert.equal(toucan.licenceName, "CC BY 4.0");
});

test("the page is noindex, escapes text and credits every source", () => {
  const html = creditsHtml(creditsFromManifests([{ release: "world-0", files: [{ id: "t", name: "t.444444444444.glb", licence: by }] }]));
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /Toucan &lt;b&gt;/);
  assert.match(html, /A &amp; B/);
  assert.match(html, /CC BY 4.0/);
  assert.match(html, /modified/);
  assert.ok(!html.includes("<b>"));
});

test("own work is credited as 'Own work by Kudrat Singh, generated with <tool> <version>', linking this public repository, with no licence link (ADR 0016)", () => {
  const own = { title: "EZ-Tree 1.1.0", author: "Kudrat Singh", authorUrl: "https://github.com/kudratsingh", sourceUrl: "https://github.com/kudratsingh/jungle-world", licence: "Own", dateChecked: "2026-10-10", modified: true };
  const credits = creditsFromManifests([{ release: "world-1", files: [{ id: "cecropia-nw", name: "cecropia_nw.111111111111.glb", licence: own }, { id: "t", name: "t.444444444444.glb", licence: by }] }]);
  const entry = credits.sources.find((s) => s.licence === "Own");
  assert.equal(entry.licenceName, "Own work");
  assert.equal(entry.attributionRequired, false);
  assert.equal(entry.licenceUrl, undefined);
  const html = creditsHtml(credits);
  assert.match(html, /Own work by <a href="https:\/\/github\.com\/kudratsingh">Kudrat Singh<\/a>, generated with <a href="https:\/\/github\.com\/kudratsingh\/jungle-world">EZ-Tree 1\.1\.0<\/a>\./);
  assert.ok(!html.includes('href="undefined"'));
  assert.ok(!html.includes("licensed under <a href=\"undefined\""));
  assert.match(html, /CC BY 4\.0/);
});
