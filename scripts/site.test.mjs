import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { checkGitFiles, checkSiteFiles, listFiles } from "./allowlist.mjs";
import { assembleSite } from "./assemble-site.mjs";
import { pickReleases, waitForNewest } from "./download-releases.mjs";

const root = await mkdtemp(join(tmpdir(), "jungle-world-test-"));
after(() => rm(root, { recursive: true, force: true }));
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

const licence = (title, licenceId = "CC0-1.0") => ({
  title,
  author: "Someone",
  authorUrl: "https://example.org/someone",
  sourceUrl: `https://example.org/${title.toLowerCase().replace(/\W+/g, "-")}`,
  licence: licenceId,
  licenceUrl: licenceId === "CC0-1.0" ? "https://creativecommons.org/publicdomain/zero/1.0/" : "https://creativecommons.org/licenses/by/4.0/",
  dateChecked: "2026-10-10",
  modified: true,
});

/** Writes a release folder: fake runtime files whose manifest entries carry their real size and hash. */
async function release(dir, tag, files, { extra } = {}) {
  await mkdir(join(dir, tag), { recursive: true });
  const entries = [];
  for (const [base, ext, content, lic] of files) {
    const bytes = Buffer.from(content);
    const hash = sha256(bytes);
    const name = `${base}.${hash.slice(0, 12)}.${ext}`;
    await writeFile(join(dir, tag, name), bytes);
    entries.push({ id: base.replace(/_/g, "-"), name, hash, bytes: bytes.byteLength, kind: ext === "glb" ? "model" : "texture", zone: "clearing", stage: "first-playable", profile: "both", licence: lic });
  }
  const manifest = { release: tag, base: "/jungle-world/files/", toolchain: { "ktx-software": "4.4.2" }, sourceCommit: "a".repeat(40), files: entries };
  await writeFile(join(dir, tag, "world-manifest.json"), JSON.stringify(manifest));
  await writeFile(join(dir, tag, "credits.json"), "{}");
  await writeFile(join(dir, tag, "credits.html"), "<!doctype html>");
  if (extra) await writeFile(join(dir, tag, extra), "x");
  return manifest;
}

test("the newest two published world releases are picked, newest first", () => {
  const list = [
    { tag_name: "world-0", published_at: "2026-10-10T10:00:00Z", draft: false, prerelease: false },
    { tag_name: "world-2", published_at: "2026-10-12T10:00:00Z", draft: false, prerelease: false },
    { tag_name: "world-3", published_at: null, draft: true, prerelease: false },
    { tag_name: "world-1", published_at: "2026-10-11T10:00:00Z", draft: false, prerelease: false },
    { tag_name: "lab-1", published_at: "2026-10-13T10:00:00Z", draft: false, prerelease: false },
    { tag_name: "world-4", published_at: "2026-10-14T10:00:00Z", draft: false, prerelease: true },
  ];
  assert.deepEqual(pickReleases(list, 2), ["world-2", "world-1"]);
  assert.deepEqual(pickReleases(list.slice(0, 1), 2), ["world-0"]);
});

test("two releases are laid out side by side with manifests and credits for both", async () => {
  const dir = join(root, "two");
  const fern = ["fern_02", "glb", "fern bytes", licence("Fern 02")];
  await release(dir, "world-0", [fern, ["floor", "ktx2", "floor v0", licence("Forest Floor")]]);
  await release(dir, "world-1", [fern, ["floor", "ktx2", "floor v1", licence("Forest Floor")], ["toucan", "glb", "toucan", licence("Toucan", "CC-BY-4.0")]]);
  await writeFile(join(dir, "order.json"), JSON.stringify(["world-1", "world-0"]));
  const out = join(root, "two-site");
  const summary = await assembleSite({ releasesDir: dir, outDir: out });
  assert.deepEqual(summary, { releases: ["world-1", "world-0"], files: 4 }); // the shared fern is served once
  assert.deepEqual((await readdir(join(out, "releases"))).sort(), ["world-0.json", "world-1.json"]);
  assert.equal((await readdir(join(out, "files"))).length, 4);
  const credits = JSON.parse(await readFile(join(out, "credits.json"), "utf8"));
  assert.deepEqual(credits.releases, ["world-1", "world-0"]);
  const toucan = credits.sources.find((s) => s.title === "Toucan");
  assert.equal(toucan.attributionRequired, true);
  assert.equal(credits.sources.find((s) => s.title === "Forest Floor").files.length, 2);
  const html = await readFile(join(out, "credits.html"), "utf8");
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /CC BY 4\.0/);
  const { files, links } = await listFiles(out);
  assert.deepEqual(checkSiteFiles(files), []);
  assert.deepEqual(links, []);
  // the manifest copy is byte for byte
  assert.equal(await readFile(join(out, "releases", "world-0.json"), "utf8"), await readFile(join(dir, "world-0", "world-manifest.json"), "utf8"));
});

test("a tampered file, an unlisted asset or a missing release stops the build", async () => {
  const dir = join(root, "bad");
  const m = await release(dir, "world-0", [["fern_02", "glb", "fern bytes", licence("Fern 02")]]);
  await writeFile(join(dir, "order.json"), JSON.stringify(["world-0"]));
  await writeFile(join(dir, "world-0", m.files[0].name), "fern bytez");
  await assert.rejects(assembleSite({ releasesDir: dir, outDir: join(root, "bad-site") }), /SHA-256/);

  const dir2 = join(root, "extra");
  await release(dir2, "world-0", [["fern_02", "glb", "fern bytes", licence("Fern 02")]], { extra: "notes.png" });
  await writeFile(join(dir2, "order.json"), JSON.stringify(["world-0"]));
  await assert.rejects(assembleSite({ releasesDir: dir2, outDir: join(root, "extra-site") }), /not in its manifest/);

  const dir3 = join(root, "none");
  await mkdir(dir3, { recursive: true });
  await writeFile(join(dir3, "order.json"), "[]");
  await assert.rejects(assembleSite({ releasesDir: dir3, outDir: join(root, "none-site") }), /no releases/);
});

test("the site allowlist takes runtime formats only, and HTML only for credits", () => {
  assert.deepEqual(checkSiteFiles(["files/a.0123456789ab.glb", "files/b.0123456789ab.ktx2", "files/c.0123456789ab.hdr", "files/d.0123456789ab.gltf", "files/d.0123456789ab.bin", "releases/world-0.json", "credits.json", "credits.html"]), []);
  for (const bad of ["files/a.png", "files/b.js", "files/c.blend", "index.html", "files/d"]) assert.equal(checkSiteFiles([bad]).length, 1, bad);
});

test("git holds text sources only", async () => {
  assert.deepEqual(checkGitFiles(["README.md", ".gitignore", ".node-version", ".github/workflows/pages.yml", "scripts/smoke.sh", "package.json"]), []);
  assert.equal(checkGitFiles(["files/fern.glb", "x.ktx2", "y.png", "z.blend"]).length, 4);
  const linkDir = join(root, "links");
  await mkdir(linkDir, { recursive: true });
  await writeFile(join(linkDir, "credits.json"), "{}");
  await symlink(join(linkDir, "credits.json"), join(linkDir, "credits2.json"));
  assert.deepEqual((await listFiles(linkDir)).links, ["credits2.json"]);
});

test("the build waits for the dispatched release to be the newest, and fails if it never is", async () => {
  const older = { tag_name: "world-0", published_at: "2026-10-10T10:00:00Z", draft: false, prerelease: false };
  const newer = { tag_name: "world-1", published_at: "2026-10-11T10:00:00Z", draft: false, prerelease: false };
  const lists = [[older], [older], [older, newer]];
  const sleeps = [];
  const tags = await waitForNewest({ list: async () => lists.shift() ?? [older, newer], count: 2, expect: "world-1", sleep: async (ms) => void sleeps.push(ms) });
  assert.deepEqual(tags, ["world-1", "world-0"]);
  assert.equal(sleeps.length, 2);
  await assert.rejects(waitForNewest({ list: async () => [older], count: 2, expect: "world-1", attempts: 2, sleep: async () => {} }), /newest published release is world-0, not world-1/);
  assert.deepEqual(await waitForNewest({ list: async () => [older], count: 2 }), ["world-0"]);
});

/** A valid one-file release, then `mutate(manifest)` rewrites its manifest before assembly. */
async function assembleMutated(name, mutate) {
  const dir = join(root, name);
  const manifest = await release(dir, "world-0", [["fern_02", "glb", "fern bytes", licence("Fern 02")]]);
  mutate(manifest);
  await writeFile(join(dir, "world-0", "world-manifest.json"), JSON.stringify(manifest));
  await writeFile(join(dir, "order.json"), JSON.stringify(["world-0"]));
  return assembleSite({ releasesDir: dir, outDir: join(root, `${name}-site`) });
}

test("manifests with unsafe or wrong file names are rejected before anything is copied", async () => {
  const cases = [
    ["traversal", "../escape.aaaaaaaaaaaa.glb", /name must be/],
    ["unhashed", "fern_02.glb", /name must be/],
    ["wrong-hash", "fern_02.ffffffffffff.glb", /does not embed its hash/],
    ["json-name", "notes.aaaaaaaaaaaa.json", /name must be/],
    ["html-name", "page.aaaaaaaaaaaa.html", /name must be/],
  ];
  for (const [label, name, pattern] of cases) {
    await assert.rejects(
      assembleMutated(label, (m) => {
        m.files[0].name = name;
        if (label !== "wrong-hash") m.files[0].hash = "a".repeat(64);
      }),
      pattern,
      label,
    );
  }
});

test("a manifest for another release, or with unknown fields, is rejected", async () => {
  await assert.rejects(assembleMutated("other-release", (m) => (m.release = "world-9")), /manifest\.release is world-9, not world-0/);
  await assert.rejects(assembleMutated("unknown-top", (m) => (m.extra = true)), /unknown field extra/);
  await assert.rejects(assembleMutated("unknown-file", (m) => (m.files[0].url = "/x")), /unknown field url/);
  await assert.rejects(assembleMutated("unknown-licence", (m) => (m.files[0].licence.note = "x")), /licence has unknown field note/);
});

test("assembly refuses a forbidden or a paid file (WO-051: the runtime site fails closed)", async () => {
  await assert.rejects(
    assembleMutated("nc-file", (m) => Object.assign(m.files[0].licence, { licence: "CC-BY-NC-4.0", licenceUrl: "https://creativecommons.org/licenses/by-nc/4.0/" })),
    /is never allowed/,
  );
  await assert.rejects(
    assembleMutated("paid-file", (m) => Object.assign(m.files[0].licence, { licence: "LicenseRef-Paid", licenceUrl: "https://www.fab.com/eula" })),
    /paid files are refused here/,
  );
});
