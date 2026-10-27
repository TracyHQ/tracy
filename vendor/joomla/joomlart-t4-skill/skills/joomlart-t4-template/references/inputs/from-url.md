# Adapter — live website URL → spec-pack

> **Phase 2.** Read `spec-pack.md` first. Emits `kind: "url"` references.

## Scope note — read before crawling

Reproducing a website's design as a commercial Joomla template is a **rights question, not a
technical one**. Use this adapter for sites you own, sites you have been engaged to rebuild, or your
own earlier work. If the target is a third party's site and the user has not stated they hold the
rights, say so once, plainly, and let them decide — then proceed with what they ask.

Scraped **assets** are a separate matter and are almost never redistributable: see §5.

## Why `url` and not `html`

You could save the pages to disk and treat them as an HTML bundle. Don't — a saved page loses
JS-driven state, lazy content, webfont loading and hover behaviour, and you would be diffing the
Joomla build against a degraded copy rather than the real thing. Keeping `kind: "url"` means Phase 8
probes the *live* DOM on the reference side, which is the same rigour as `html`.

The one thing you must guard against is the reference moving under you — see §4.

## Step 1 — Crawl and inventory

```bash
node scripts/ingest/from-url.mjs <start-url> --out <WORKSPACE>/<SLUG>-spec [--max-pages 30] [--same-origin]
```

The script walks same-origin links from the start URL, breadth-first, and records for each page:
final URL, `<title>`, an outline of section-level blocks, and the form/grid signals the view
heuristic needs. It does **not** render JS-heavy pages well on its own — for anything
client-rendered, drive Playwright and capture after `networkidle`.

`--same-origin` (default on) stops the crawl escaping to a CDN or a docs subdomain.

**Then map pages → Joomla views** with the heuristics in `../conversion-contract.md` §4 — filename
and URL-path keywords first, DOM signals overriding them when decisive. The realistic outcome is a
mixed bag; confirm the ambiguous ones with the user before Phase 2 (§4.5 there).

## Step 2 — Palette and type from **computed** styles

Read `getComputedStyle`, not the raw stylesheet. Modern sites resolve tokens through cascading
custom properties, media queries and `color-scheme`; the declared value in the CSS file is often not
the value on screen.

- `body_bg` ← computed `background-color` of `body`
- `text` ← computed `color` of `body`
- `primary` ← the dominant accent: sample the computed `background-color` of the main CTA and the
  `color` of a body link; if they disagree, prefer the CTA and note it
- `secondary` ← supporting brand colour (secondary buttons, badges, active nav)
- fonts ← computed `font-family` of `body` and of `h1`/`h2`, first family name only

**Dark mode:** if the site has a theme toggle, flip it and re-probe all four slots. If it only has
`@media (prefers-color-scheme: dark)`, emulate the dark preference and re-probe. If neither exists,
set `theme.palette.dark` to `null` and record in `design-spec.md` that dark is derived in Phase 6.

> Probing right after a toggle returns **stale values for transitioned properties** (border-color is
> the usual victim). Wait for transitions to settle, or read the steady state, before writing a
> number into `design-spec.md`.

## Step 3 — Section shapes

For each page, walk the top-level children of `<main>` (or the body's section-level blocks) and
classify each into an ACM block by content shape — banner → `hero`, icon grid → `features-intro`,
quotes carousel → `testimonials`, people photos → `teams`, logo strip → `clients`, price cards →
`pricing`, counter row → `statistics`, collapsible Q&A → `accordion`, image grid → `gallery`,
full-width banner+button → `cta`, social icon row → `social`. Emit them as `sections[].kind = "acm"`
and the union into top-level `acm[]`. Full rules: `../conversion-contract.md` §4.4.

## Step 4 — `reference.json` and the moving-target problem

```jsonc
{
  "kind": "url",
  "viewports": [1440, 768, 390],
  "modes": ["light", "dark"],
  "pages": [
    { "page": "index.html", "url": "https://example.com/" },
    { "page": "blog.html",  "url": "https://example.com/blog" }
  ]
}
```

A live reference can change mid-build, and then Phase 8 reports diffs you did not cause. Guard
against it: **capture a probe snapshot per page during Phase 2** and store it beside the reference
(`reference/<page>.snapshot.json`, the same shape `scripts/verify-render.mjs` consumes). Phase 8
diffs against the snapshot by default and re-fetches the live URL only to investigate a
disagreement. Record the capture timestamp in `provenance.json`.

## Step 5 — Assets and licensing

Download referenced images/fonts into `assets/` and record each one's source URL in
`provenance.json`. Then treat them as **placeholders, not deliverables**: photography, icon sets and
licensed webfonts on someone else's site are not licensed for redistribution in your template.
Before Phase 10, replace anything you did not author with a licence-safe equivalent
(`gotchas.md` #11). The brand logo in particular must be replaced, not recoloured.

## Manual verification checklist

- [ ] Rights question raised if the target is a third party's site.
- [ ] Crawl stayed same-origin; the page list was confirmed with the user.
- [ ] Palette read from **computed** styles, and after transitions settled.
- [ ] Dark obtained by toggling / emulating `prefers-color-scheme`, or explicitly marked derived.
- [ ] A probe snapshot exists per page, with a timestamp in `provenance.json`.
- [ ] Every scraped asset has a source URL recorded and is flagged for replacement.
- [ ] The validator passes.
