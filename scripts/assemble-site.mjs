// Lays out the Pages site from downloaded releases (synthesis section 3.11):
//
//   files/<name>.<hash>.<ext>   every runtime file of the current and the previous release, side by side
//   releases/<tag>.json         each release's manifest, byte for byte
//   credits.json, credits.html  credits for both releases (the page is noindex)
//
// Every file is checked against its manifest (size and SHA-256) before it is copied, and a release asset
// that its manifest does not list stops the build. Files are copied, never linked.
//
//   node scripts/assemble-site.mjs --releases releases-in --out _site
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { creditsFromManifests, creditsHtml } from "./lib/credits.mjs";
import { validateManifest } from "./lib/manifest.mjs";

const RELEASE_EXTRAS = new Set(["world-manifest.json", "credits.json", "credits.html"]);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/**
 * @param {{ releasesDir: string, outDir: string }} o  releasesDir holds order.json (tags, newest first)
 *   and one folder of release assets per tag.
 */
export async function assembleSite({ releasesDir, outDir }) {
  const order = JSON.parse(await readFile(join(releasesDir, "order.json"), "utf8"));
  if (!Array.isArray(order) || order.length === 0) throw new Error("order.json lists no releases");
  await rm(outDir, { recursive: true, force: true });
  await mkdir(join(outDir, "files"), { recursive: true });
  await mkdir(join(outDir, "releases"), { recursive: true });

  const manifests = [];
  const served = new Map();
  for (const tag of order) {
    const dir = join(releasesDir, tag);
    const raw = await readFile(join(dir, "world-manifest.json"));
    const manifest = JSON.parse(raw.toString("utf8"));
    const problems = validateManifest(manifest);
    if (manifest.release !== tag) problems.push(`manifest.release is ${manifest.release}, not ${tag}`);
    if (problems.length) throw new Error(`${tag}: invalid manifest:\n  ${problems.join("\n  ")}`);

    const listed = new Set(manifest.files.map((f) => f.name));
    for (const name of await readdir(dir)) {
      if (!listed.has(name) && !RELEASE_EXTRAS.has(name)) throw new Error(`${tag}: release asset ${name} is not in its manifest`);
    }
    for (const f of manifest.files) {
      const bytes = await readFile(join(dir, f.name)).catch(() => null);
      if (!bytes) throw new Error(`${tag}: ${f.name} is missing from the release`);
      if (bytes.byteLength !== f.bytes) throw new Error(`${tag}: ${f.name} is ${bytes.byteLength} bytes, manifest says ${f.bytes}`);
      if (sha256(bytes) !== f.hash) throw new Error(`${tag}: ${f.name} does not match its manifest SHA-256`);
      if (served.has(f.name)) {
        if (served.get(f.name) !== f.hash) throw new Error(`${f.name} differs between releases`);
        continue; // the same file in both releases is served once
      }
      await copyFile(join(dir, f.name), join(outDir, "files", f.name));
      served.set(f.name, f.hash);
    }
    await writeFile(join(outDir, "releases", `${tag}.json`), raw);
    manifests.push(manifest);
  }
  const credits = creditsFromManifests(manifests);
  await writeFile(join(outDir, "credits.json"), `${JSON.stringify(credits, null, 2)}\n`);
  await writeFile(join(outDir, "credits.html"), creditsHtml(credits));
  return { releases: order, files: served.size };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const get = (name, fallback) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback);
  assembleSite({ releasesDir: get("releases", "releases-in"), outDir: get("out", "_site") })
    .then(({ releases, files }) => console.log(`site: ${files} files from ${releases.join(", ")}; credits cover ${releases.length === 1 ? "that release" : "both releases"}`))
    .catch((error) => {
      console.error(`error: ${error.message}`);
      process.exitCode = 1;
    });
}
