// Downloads the assets of the newest two published releases (current and previous, so a page pinned to
// either keeps working; synthesis section 3.11) into <dest>/<tag>/ and writes <dest>/order.json, newest
// first. Uses `gh` with the workflow's GITHUB_TOKEN; this repository is public, so no other token.
//
//   node scripts/download-releases.mjs --dest releases-in [--count 2] [--repo kudratsingh/jungle-world]
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Tags of the newest `count` published releases (no drafts, no pre-releases), newest first. */
export function pickReleases(list, count) {
  return list
    .filter((r) => !r.draft && !r.prerelease && typeof r.published_at === "string" && /^world-\d+$/.test(r.tag_name))
    .sort((a, b) => (a.published_at < b.published_at ? 1 : a.published_at > b.published_at ? -1 : 0))
    .slice(0, count)
    .map((r) => r.tag_name);
}

function option(argv, name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

async function main(argv) {
  const dest = option(argv, "dest", "releases-in");
  const count = Number(option(argv, "count", "2"));
  const repo = option(argv, "repo", process.env.GITHUB_REPOSITORY || "kudratsingh/jungle-world");
  // One page of 100 releases covers years of world releases; only the newest two matter.
  const list = JSON.parse(execFileSync("gh", ["api", `repos/${repo}/releases?per_page=100`], { encoding: "utf8" }));
  const tags = pickReleases(list, count);
  if (tags.length === 0) throw new Error(`no published world-<n> releases in ${repo}`);
  for (const tag of tags) {
    await mkdir(join(dest, tag), { recursive: true });
    execFileSync("gh", ["release", "download", tag, "--repo", repo, "--dir", join(dest, tag)], { stdio: "inherit" });
  }
  await writeFile(join(dest, "order.json"), `${JSON.stringify(tags)}\n`);
  console.log(`downloaded ${tags.join(", ")} into ${dest}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
  });
}
