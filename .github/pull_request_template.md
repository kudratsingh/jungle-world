## Work order

WO-NNN (in kudratsingh/kudratsingh.github.io: `docs/work-orders/WO-NNN-slug.md`)

## What was built

-

## Deviations from the spec, and why

- None

## Evidence

```
npm test                              →
node scripts/allowlist.mjs --git      →
```

## Open questions

- None

## Checklist

- [ ] No binaries or runtime files in git (they arrive as release assets from kudratsingh/jungle-assets)
- [ ] Every deployed page is noindex; only runtime formats are deployed
- [ ] Tests added or updated; `npm test` and CI green
- [ ] Commits are conventional and end with the `Co-Authored-By` trailer
