// The runtime-format allowlist (ADR 0014; synthesis section 6.2). This repository serves runtime files
// only, and they travel as release assets, never as git blobs.
//
//   node scripts/allowlist.mjs --dir _site   every deployed file is .glb .gltf .bin .ktx2 .hdr .json or
//                                            .html, and .html only for the credits page
//   node scripts/allowlist.mjs --git         git holds text sources only: no runtime files, no binaries
//
// Audio formats (.webm, .ogg with Opus, .m4a with AAC) join the list with WO-045.
import { execFileSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const RUNTIME_EXTENSIONS = [".glb", ".gltf", ".bin", ".ktx2", ".hdr", ".json", ".html"];
/** HTML pages the site may carry (each with `<meta name="robots" content="noindex">`). */
export const HTML_PAGES = ["credits.html"];
/** What git may track: workflow, script, data and documentation text. */
const GIT_TEXT = /(^|\/)(\.gitignore|\.node-version|LICENSE)$|\.(md|ya?ml|mjs|js|json|sh|txt)$/;

/** @param {string[]} paths site-relative, "/"-separated @returns {string[]} problems */
export function checkSiteFiles(paths) {
  const problems = [];
  for (const p of paths) {
    const ext = (/\.[^./]+$/.exec(p)?.[0] ?? "").toLowerCase();
    if (!RUNTIME_EXTENSIONS.includes(ext)) problems.push(`${p}: ${ext || "no extension"} is not a runtime format`);
    else if (ext === ".html" && !HTML_PAGES.includes(p)) problems.push(`${p}: only ${HTML_PAGES.join(", ")} may be HTML`);
  }
  return problems;
}

/** @param {string[]} tracked `git ls-files` output @returns {string[]} problems */
export function checkGitFiles(tracked) {
  return tracked.filter((f) => !GIT_TEXT.test(f)).map((f) => `${f}: git holds text sources only; runtime files travel as release assets`);
}

/** Files under `dir` ("/"-separated, sorted), and any symbolic links (a Pages artifact may hold none). */
export async function listFiles(dir) {
  const files = [];
  const links = [];
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    const rel = relative(dir, join(entry.parentPath ?? entry.path, entry.name)).split(sep).join("/");
    if (entry.isSymbolicLink()) links.push(rel);
    else if (entry.isFile()) files.push(rel);
  }
  return { files: files.sort(), links: links.sort() };
}

async function main(argv) {
  let problems;
  let count;
  if (argv[0] === "--dir" && argv[1]) {
    const { files, links } = await listFiles(argv[1]);
    problems = [...checkSiteFiles(files), ...links.map((l) => `${l}: symbolic links are not allowed in a Pages artifact`)];
    count = files.length;
  } else if (argv[0] === "--git") {
    const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
    problems = checkGitFiles(tracked);
    count = tracked.length;
  } else {
    console.log("Usage: node scripts/allowlist.mjs --dir <site folder> | --git");
    process.exitCode = argv.includes("--help") || argv.includes("-h") ? 0 : 2;
    return;
  }
  if (problems.length) {
    console.error(`allowlist: ${problems.length} problems\n  ${problems.join("\n  ")}`);
    process.exitCode = 1;
  } else console.log(`allowlist: ${count} files pass`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main(process.argv.slice(2));
