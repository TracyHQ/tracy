# Adapter — live site URL → spec-pack

> **Phase 2 packet.** Read [`spec-pack.md`](spec-pack.md) first. `reference.json` emits `kind: "html"` because Phase 8 compares against the captured snapshot; `provenance.json` records adapter `from-url` and source kind `url`. Ported from T4; as of
> 13/09/2026 **proven only by tests**; the Tracy Base run used `from-joomla` (which also emits `kind: url`), not
> this script.

## Rights first, technique second

Recreating a site's design as a theme is a **question of rights**, not of technique. Use it for your own
site, a site you were hired to rebuild, or your own past work. For a third-party site where the requester has not said they have
the rights, say so **once**, clearly, and let them decide. Scraped assets are almost never redistributable (§5).

## Crawl and packaging

`from-url` downloads each page's HTML with size and time limits, follows same-origin redirects by itself, then
stores the snapshot under `reference/capture/` as a manifest bundle. The manifest keeps the route pathname, final URL and status; query variants of the same route are recorded in crawl
failures because a WordPress route does not distinguish queries. `<base>` points to the final URL so relative assets keep
resolving. Then the adapter calls the same
`buildSpecPack` as `from-html`, so the pack has `content.json`, `sections.json`, `menus.json`,
`redirects.json` and the contracts for the seeder to read. The original URL stays in provenance to record the capture source;
Phase 8 compares against the stored snapshot. Changes on the live site after the capture only show up after a new capture.
The capture step does not execute JavaScript.

## Step 1 — crawl and inventory

```bash
node scripts/ingest/from-url.mjs <start-url> --out <spec> [--max-pages 30] [--allow-cross-origin] [--render] [--port N] [--force]
```

Follows same-origin links, breadth-first; each page records the requested URL, status, redirect chain, final URL,
`<title>` and section outline. The query is kept only in metadata; URLs with the same pathname produce only one page and
later variants are recorded as `query variant of <path>`. Redirect rules also use only the pathname. Route `/` is `front-page`; if the crawl has no root, the largest page is used.
Capture does not run JavaScript; use `--render` to measure styles in a browser or to measure client-rendered pages after
`networkidle`. `template.name` is inferred from the hostname
(correct it to the real theme slug), and the page-map carries `templateParts` instead of `positions`.

URL uses the same DOM report `source-fonts.json` as `from-html`: families declared in CSS by role, `@font-face`
and its source, loader URLs, plus gaps for missing/unreadable stylesheets. The Phase 2 gate needs a browser measurement for
every captured page at 1440 and 390 px, so `--render` must be run; without a measurement, the gate states that it must be
rerun with `--render`. A finding can only be waived by a closed decision in `DECISIONS.md` that names the exact key.

Then map page → WordPress view using the `FILENAME_VIEW` table in `scripts/lib/html-bundle.mjs`; ambiguous pages:
ask the requester **before** passing the gate.

## Step 2 — palette and type from **computed** style

Read `getComputedStyle`, not the stylesheet: modern sites resolve tokens through custom properties, media queries,
`color-scheme`; the value declared in the file is often not the value on screen. Without `--render`,
the script **deliberately leaves the palette `null`**. `--render` turns on in-browser measurement; check the computed palette in both
light and dark with the steps below.

- `body_bg` ← `background-color` of `body`; `text` ← `color` of `body`.
- `primary` ← the dominant accent colour: the main CTA background and the body link colour; if they differ, take the CTA and note it.
- `secondary` ← the secondary colour (secondary button, badge, active nav).
- font ← `font-family` of `body` and `h1`/`h2`, taking the first family.

**Dark:** if the site has a toggle, switch it on and measure the four cells again; if it only has `prefers-color-scheme`, emulate it and measure; if it has
nothing, `dark: null` + `darkDerived: true`. Measuring right after the toggle returns **a value mid-transition**
(`border-color` is the usual victim) — wait for it to settle before recording numbers.

## Step 3 — section shapes

On each page, walk the direct children of `<main>` and name them by shape: banner → `section-hero-*`, icon
grid → `section-features-intro`, quote → `section-testimonials`, people photos → `section-team-*`, logo strip →
`section-clients`, price cards → `section-pricing-tiers`, row of numbers → `section-statistics`, collapsible Q&A →
`section-accordion`, banner + button → `section-cta-capsule`, row of social icons → `section-social-links`.
Record them in `pages[].sections[]`.

## Step 4 — `reference.json` and the moving target

The HTML snapshot in `reference/capture/` is the source Phase 8 compares against, so a live site that changes after
capture does not move the baseline between builds. Use `--render` to measure/capture the style snapshot in a browser; the original URL
is only metadata and can be opened by hand when investigating a difference. Record the capture time in `provenance.json`.

## Step 5 — assets and licence

Download images/fonts into `assets/` and record each one's source URL in `provenance.json`. Treat them as
**placeholders, not deliverables**: images, icon sets and commercial webfonts on someone else's site may not be
redistributed in the theme. Before Phase 10 replace everything you did not make yourself; the logo is **replaced**, not retraced.

## Checklist

- [ ] The rights question was raised if it is a third-party site.
- [ ] The crawl stayed on the same origin; the page list was confirmed with the requester.
- [ ] Palette read from **computed** style, after transitions settled.
- [ ] Dark via toggle / emulation, or `darkDerived: true`.
- [ ] Each page has a snapshot + image, with the time in `provenance.json`.
- [ ] Each scraped asset has a source URL and a must-replace flag.
- [ ] Validator green.
