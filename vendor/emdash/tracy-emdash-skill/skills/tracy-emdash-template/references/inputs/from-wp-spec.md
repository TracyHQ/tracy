# `from-wp-spec` — the WordPress kit's spec-pack → `site-model.json`

⚠ **This is a BRIDGE, not a ROAD** (ADR 0016 §2a). Read [`references/site-model.md`](../site-model.md)
first. The clean road is a Joomla adapter that emits `site-model.json` directly, before any
WordPress-isation step runs; this bridge exists because the WordPress kit **has already** taken apart a real Joomla site
(Tracy Base) and its output is already in git.

## What it reads, what it cannot get

```
node scripts/ingest/from-wp-spec.mjs <spec-dir> <out-dir>
```

`<spec-dir>` is the spec-pack folder emitted by `from-joomla.mjs` — that script lives in the sibling repo
`JoomlArt-Products/tracy-wordpress-theme` (in TCH: `vendor/wordpress/tracy-wordpress-theme/`)
(`tasks/tracy-base-wp7/spec/` in TCH): `page-map.json`, `content.json`, `sections.json`,
`menus.json`, `redirects.json`.

| Takes | Skips |
|---|---|
| pages, posts, categories, ACM instances (each type becomes a type), menus, redirects | design tokens (`design-contract.json`) — no place in `site-model.json` v1 yet |
| images referenced in fields/body — registered into `media[]` | images not listed anywhere in the spec |

## What this bridge strips

The spec-pack was partly WordPress-ised before it got here: `content.json.posts[].content` is block
markup (`<!-- wp:paragraph -->`), images point to `/wp-content/uploads/…`, classes carry the `wp-block-*` prefix.
`from-wp-spec.mjs` strips all three before writing into the contract — the contract must not carry the vocabulary of another
CMS (ADR 0016 §2). One leftover measured at the time of writing: Tracy Base's 404 page still had an `<img>`
pointing to uploads inside `body`, not `featuredImage` — the banned-word gate caught it in one second.

## Three decisions of the bridge, worth knowing before trusting the numbers

1. **Each ACM kind (`type`) becomes its own contract `type`**, with fields inferred from the real keys present in
   the instances' `fields`/`items` — not from the XML schema (this bridge does not read `acm/*.xml`).
2. **Joomla's `heading` (a group label with no target) is recorded exactly as it is** — `path: ''`,
   `kind: 'heading'` — and the **compiler**, not the adapter, decides what EmDash sees (`compile-seed.mjs`
   turns it into `url: '#'`, the "opens children rather than a destination" convention). The adapter does not invent links.
3. **Routes come from `page-map.json.pages[]` + `content.json.archives[]` + each post's path**,
   not from `reference.json` — this bridge needs no render to compare against, unlike the main pipeline.

## Acceptance — Tracy Base, 15/09/2026

Source: `tasks/tracy-base-wp7/spec/` (TCH), 40 pages, 82 original Joomla articles → 20 types · 129 records ·
3 menus · 28 media in the contract. `validate.mjs` clean. The generated seed through EmDash's own
`validateSeed`: **`valid: true`, 0 errors, 0 warnings**.
