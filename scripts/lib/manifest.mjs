// Copy of kudratsingh/jungle-assets pipeline/lib/manifest.mjs: the release manifest contract, checked
// again here before a release's files are deployed. Change both (and the portfolio's
// src/lib/world/manifest.ts) together.

/** A calendar date in YYYY-MM-DD that exists. */
export function isDate(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Largest runtime file, in bytes (decimal 20 MB keeps Cloudflare's 25 MiB per-file limit open). */
export const MAX_FILE_BYTES = 20_000_000;
/** Hex characters of the SHA-256 embedded in a served file name: `<base>.<hash12>.<ext>`. */
export const NAME_HASH_LENGTH = 12;
export const KINDS = ["model", "buffer", "texture", "environment"];
export const STAGES = ["first-playable", "complete"];
export const PROFILES = ["both", "high", "low"];
/** Where the portfolio expects the files: the runtime site's files folder, same origin. */
export const DEFAULT_BASE = "/jungle-world/files/";

const NAME = /^[a-z0-9][a-z0-9_-]*\.([0-9a-f]{12})\.(glb|gltf|bin|ktx2|hdr)$/;
const ID = /^[a-z0-9][a-z0-9-]*$/;
const ZONE = /^[a-z][a-z0-9-]*$/;
const RELEASE = /^world-\d+$/;

const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v) => typeof v === "string" && v.trim() !== "";
const isHttpsUrl = (v) => {
  try {
    return typeof v === "string" && new URL(v).protocol === "https:";
  } catch {
    return false;
  }
};

/** The served name of a file: its logical base name, the first 12 hex of its SHA-256, its extension. */
export function hashedName(base, sha256hex, ext) {
  return `${base}.${sha256hex.slice(0, NAME_HASH_LENGTH)}${ext.startsWith(".") ? ext : `.${ext}`}`;
}

/** @returns {string[]} problems; empty when the manifest is valid. */
export function validateManifest(m) {
  if (!isObject(m)) return ["manifest: must be an object"];
  const problems = [];
  const allowed = new Set(["release", "base", "toolchain", "sourceCommit", "files"]);
  for (const key of Object.keys(m)) if (!allowed.has(key)) problems.push(`manifest: unknown field ${key}`);
  if (!RELEASE.test(String(m.release))) problems.push("manifest.release must look like world-<n>");
  if (typeof m.base !== "string" || !m.base.startsWith("/") || !m.base.endsWith("/")) problems.push("manifest.base must start and end with /");
  if (!isObject(m.toolchain) || Object.keys(m.toolchain).length === 0 || !Object.values(m.toolchain).every(isText)) {
    problems.push("manifest.toolchain must map tool names to versions");
  }
  if (!/^[0-9a-f]{40}$/.test(String(m.sourceCommit))) problems.push("manifest.sourceCommit must be a 40-hex commit");
  if (!Array.isArray(m.files)) return [...problems, "manifest.files must be an array"];
  const ids = new Set();
  const names = new Set();
  m.files.forEach((f, i) => {
    const at = `manifest.files[${i}]${isObject(f) && isText(f.id) ? ` (${f.id})` : ""}`;
    if (!isObject(f)) return problems.push(`${at}: must be an object`);
    const fields = new Set(["id", "name", "hash", "bytes", "gpuBytes", "kind", "zone", "stage", "profile", "licence"]);
    for (const key of Object.keys(f)) if (!fields.has(key)) problems.push(`${at}: unknown field ${key}`);
    if (!ID.test(String(f.id))) problems.push(`${at}: id must match ${ID}`);
    else if (ids.has(f.id)) problems.push(`${at}: duplicate id`);
    else ids.add(f.id);
    if (!/^[0-9a-f]{64}$/.test(String(f.hash))) problems.push(`${at}: hash must be a 64-hex SHA-256`);
    const name = NAME.exec(String(f.name));
    if (!name) problems.push(`${at}: name must be <base>.<12 hex>.<glb|gltf|bin|ktx2|hdr>`);
    else if (typeof f.hash === "string" && name[1] !== f.hash.slice(0, NAME_HASH_LENGTH)) problems.push(`${at}: name does not embed its hash`);
    if (names.has(f.name)) problems.push(`${at}: duplicate name`);
    names.add(f.name);
    if (!Number.isInteger(f.bytes) || f.bytes <= 0) problems.push(`${at}: bytes must be a positive integer`);
    else if (f.bytes > MAX_FILE_BYTES) problems.push(`${at}: ${f.bytes} bytes is over the ${MAX_FILE_BYTES}-byte file limit`);
    if (f.gpuBytes !== undefined && (!Number.isInteger(f.gpuBytes) || f.gpuBytes < 0)) problems.push(`${at}: gpuBytes must be a non-negative integer`);
    if (!KINDS.includes(f.kind)) problems.push(`${at}: kind must be one of ${KINDS.join(", ")}`);
    if (!ZONE.test(String(f.zone))) problems.push(`${at}: zone must be a lowercase slug`);
    if (!STAGES.includes(f.stage)) problems.push(`${at}: stage must be one of ${STAGES.join(", ")}`);
    if (!PROFILES.includes(f.profile)) problems.push(`${at}: profile must be one of ${PROFILES.join(", ")}`);
    const l = f.licence;
    if (!isObject(l)) return problems.push(`${at}: licence block is required`);
    for (const key of Object.keys(l)) {
      if (!["title", "author", "authorUrl", "sourceUrl", "licence", "licenceUrl", "dateChecked", "modified"].includes(key)) problems.push(`${at}: licence has unknown field ${key}`);
    }
    for (const key of ["title", "author", "licence"]) if (!isText(l[key])) problems.push(`${at}: licence.${key} is required`);
    for (const key of ["authorUrl", "sourceUrl", "licenceUrl"]) if (!isHttpsUrl(l[key])) problems.push(`${at}: licence.${key} must be an https URL`);
    if (!isDate(l.dateChecked)) problems.push(`${at}: licence.dateChecked must be a YYYY-MM-DD date`);
    if (typeof l.modified !== "boolean") problems.push(`${at}: licence.modified must be true or false`);
  });
  return problems;
}
