# jungle-world

Runtime files for the walkable jungle on [kudratsingh.github.io](https://kudratsingh.github.io), served by
GitHub Pages at **https://kudratsingh.github.io/jungle-world/** (same origin as the portfolio; ADR 0014,
decision 11, in `kudratsingh/kudratsingh.github.io`).

This repository holds no assets in git. Its releases (`world-0`, `world-1`, …) carry the content-hashed
runtime files, built and published by the private pipeline `kudratsingh/jungle-assets`; publishing a
release runs the Pages workflow, which deploys the current and the previous release side by side.

## What the site serves

| Path | Content |
|---|---|
| `/jungle-world/files/<name>.<hash>.<ext>` | Runtime files of the current and previous release: `.glb`, `.gltf` + `.bin`, `.ktx2`, `.hdr` |
| `/jungle-world/releases/<tag>.json` | Each release's manifest (ids, hashes, sizes, GPU bytes, licences, toolchain, source commit) |
| `/jungle-world/credits.html`, `credits.json` | Credits for every file of both releases (the page is `noindex`) |

Only those formats can deploy (`scripts/allowlist.mjs`); HTML only for the credits page. Pages gzips
`.glb`, `.gltf`, `.bin` and `.hdr` in transit, serves `.ktx2` as stored (it carries its own
supercompression), answers `Range` with `206` and sends `Access-Control-Allow-Origin: *`; the deploy
workflow checks all of that on the real origin after every deploy (`scripts/smoke.sh`).

## Licences

Every file is CC0 1.0, CC BY 3.0 or CC BY 4.0, or a paid file Kudrat approved by name with the seller's
written permission to serve compressed runtime files on a public website. See
[credits](https://kudratsingh.github.io/jungle-world/credits.html) for each file's title, author, source
and licence, and whether it was modified (optimised and recompressed for the web). Credits are generated
from the release manifests, so they cannot drift from what is served.

## How it changes

- Files arrive only through `kudratsingh/jungle-assets`' release workflow; nobody uploads by hand.
- Code here (the Pages workflow and its scripts) changes by pull request with green CI; `main` is
  protected (pull request and CI required).
- `npm test` runs the tests (Node's test runner, no dependencies); `node scripts/allowlist.mjs --git`
  confirms git holds text sources only.
