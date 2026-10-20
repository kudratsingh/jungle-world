// Copy of kudratsingh/jungle-assets pipeline/lib/credits.mjs: credits.json and a noindex credits.html
// built from release manifests, here for the current and the previous release together. Change both.
import { licenceInfo } from "./licences.mjs";

/** Compares strings by code point, so the output never depends on the machine's locale. */
const byCodePoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * One entry per source (same title, author, source URL and licence), with every file of every given
 * release that came from it. Sorted by title, files by release then name.
 * @param {Array<{ release: string, files: Array<{ id: string, name: string, licence: Record<string, any> }> }>} manifests
 */
export function creditsFromManifests(manifests) {
  const sources = new Map();
  for (const m of manifests) {
    for (const f of m.files) {
      const l = f.licence;
      const key = JSON.stringify([l.title, l.author, l.sourceUrl, l.licence]);
      let entry = sources.get(key);
      if (!entry) {
        const info = licenceInfo(l.licence);
        entry = {
          title: l.title,
          author: l.author,
          authorUrl: l.authorUrl,
          sourceUrl: l.sourceUrl,
          licence: l.licence,
          licenceName: info?.name ?? l.licence,
          licenceUrl: l.licenceUrl,
          attributionRequired: info?.attribution ?? true,
          modified: false,
          dateChecked: l.dateChecked,
          files: [],
        };
        sources.set(key, entry);
      }
      entry.modified ||= l.modified === true;
      if (l.dateChecked > entry.dateChecked) entry.dateChecked = l.dateChecked;
      entry.files.push({ release: m.release, id: f.id, name: f.name, modified: l.modified === true });
    }
  }
  const list = [...sources.values()].sort((a, b) => byCodePoint(a.title, b.title) || byCodePoint(a.sourceUrl, b.sourceUrl));
  for (const s of list) s.files.sort((a, b) => byCodePoint(a.release, b.release) || byCodePoint(a.name, b.name));
  return { version: 1, releases: manifests.map((m) => m.release), sources: list };
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** A plain, noindex HTML page for credits.json. */
export function creditsHtml(credits) {
  const items = credits.sources
    .map((s) => {
      const files = s.files.map((f) => `<li><code>${escapeHtml(f.name)}</code> (${escapeHtml(f.release)}${f.modified ? ", modified" : ", unmodified"})</li>`).join("");
      // Own work (ADR 0016; WO-051): "Own work by <author>, generated with <tool> <version>", where an
      // own-work entry's title names its tool and version and its sourceUrl is this public repository;
      // no licence link (own work has none).
      if (s.licence === "Own") {
        return [
          "<li>",
          `<p>Own work by <a href="${escapeHtml(s.authorUrl)}">${escapeHtml(s.author)}</a>, generated with <a href="${escapeHtml(s.sourceUrl)}">${escapeHtml(s.title)}</a>.</p>`,
          `<ul>${files}</ul>`,
          "</li>",
        ].join("");
      }
      return [
        "<li>",
        `<p><a href="${escapeHtml(s.sourceUrl)}">${escapeHtml(s.title)}</a> by <a href="${escapeHtml(s.authorUrl)}">${escapeHtml(s.author)}</a>, `,
        `licensed under <a href="${escapeHtml(s.licenceUrl)}">${escapeHtml(s.licenceName)}</a>${s.modified ? "; modified (optimised and recompressed for the web)" : ""}.`,
        s.attributionRequired ? "" : " No attribution required; credited with thanks.",
        "</p>",
        `<ul>${files}</ul>`,
        "</li>",
      ].join("");
    })
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Credits: jungle world runtime files</title>
<style>
body { font: 16px/1.5 system-ui, sans-serif; margin: 0 auto; max-width: 46rem; padding: 1.5rem 1rem; color: #1a1f1a; background: #fff; }
a { color: inherit; }
code { font-size: 0.9em; overflow-wrap: anywhere; }
li { margin-block: 0.5rem; }
@media (prefers-color-scheme: dark) { body { color: #e8ece8; background: #111511; } }
</style>
</head>
<body>
<main>
<h1>Credits</h1>
<p>Runtime files for the walkable jungle on <a href="https://kudratsingh.github.io/">kudratsingh.github.io</a>, served from this site. Releases covered: ${credits.releases.map(escapeHtml).join(", ")}. Machine-readable: <a href="credits.json">credits.json</a>.</p>
<ul>
${items}
</ul>
</main>
</body>
</html>
`;
}
