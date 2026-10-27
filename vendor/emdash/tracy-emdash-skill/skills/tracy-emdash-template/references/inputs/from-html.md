# `from-html` — design folder → source

> **Packet P1.** This skill's default road, and the road both existing templates took.

## No dedicated script, and that is on purpose

The two sibling skills have `ingest/from-html.mjs` because they must build a **spec-pack** — a set of files with
its own schema. This skill does not use a spec-pack: it reads the folder directly with

```bash
node tools/inventory.mjs <source-folder> <out-dir>
```

`inventory.mjs` recognises two shapes by itself, no declaration needed:

| Shape | Recognised by | `source.kind` |
|---|---|---|
| **Claude Design canvas** | `<x-dc>` + script `text/x-dc`; pages are the `state.page` literal, locale is `get lang()` | `canvas` |
| **Plain HTML** | everything else; page = file, locale = `<html lang>` or the folder name | `html` |

Output: `source-inventory.json` (hashes **every** file) + `assets.json`. An asset reference pointing at a
file that does not exist makes it **exit 1** — a missing image in the source is a `content-gaps.md` entry, not
something to invent around.

## ⚠ What about a bundle with a manifest

`inventory.mjs` **does not read a bundle's `manifest.json`** (the other two kits have `lib/html-bundle.mjs` for
that). On a design bundle it still runs — it just treats every file as plain HTML and ignores the
order/groups the manifest declares. If the manifest carries information worth keeping (page order, section groups, labels),
**read it by hand and record it in `visual-contract.md`** instead of pretending it does not exist.

## After that

`routes.json` → `seed/seed.json` (P2) → runtime (P3). Canvas content is extracted with
`tools/extract.mjs` (AST literals, **no eval**), and the seed is then built with `tools/compile-seed.mjs` from
a `site-model.json` — see [`site-model.md`](../site-model.md).
