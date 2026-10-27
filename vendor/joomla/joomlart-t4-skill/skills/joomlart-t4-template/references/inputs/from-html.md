# Adapter — HTML bundle or raw HTML folder → spec-pack

> **Phase 2.** Read `spec-pack.md` first. Emits `kind: "html"` references — the strictest kind.

This is the original input path and the best-tested one. Two shapes are accepted.

## Shape A — a canonical bundle (has `manifest.json`)

```
bundle/
  manifest.json
  pages/      index.html · blog.html · single.html · contact.html · login.html ·
              register.html · profile.html · search.html · tag.html · 404.html ·
              offline.html · <extra>.html …
  assets/     css/ · js/ · images/ · fonts/
```

The `manifest.json` schema — template identity, the light **and** dark palette, fonts, the
`pages[]` array with `view`/`layout`/`style`/`sections[]`, `acm[]`, `positions[]` — is documented in
full, field by field, in **`../conversion-contract.md` §1–§3**. Read that; it is not duplicated here.

> The manifest declares *intent*; the markup declares *fact*. **When they disagree, the DOM wins**
> and you confirm the discrepancy with the user rather than silently picking one.

## Shape B — a raw folder of HTML (no manifest)

A directory of `*.html` plus stylesheets, with no manifest. The parser infers everything: it picks
`index.html` (or the largest page) as home, reads the largest CSS file for `:root` custom properties
to extract the palette and fonts, decides light-vs-dark primary from the background's relative
luminance, and infers each page's Joomla view from its filename with DOM signals overriding.
Heuristics in full: `../conversion-contract.md` §4.

## Step 1 — Parse

```bash
node scripts/ingest/from-html.mjs <bundle-or-folder> --out <WORKSPACE>/<SLUG>-spec
```

It auto-detects the shape (manifest present → Shape A, else Shape B), writes `page-map.json`,
copies the pages into `reference/`, copies `assets/`, and writes `reference.json` with
`kind: "html"` plus `provenance.json`.

Force raw mode on a folder that happens to contain a `manifest.json` you want ignored with
`--single`.

## Step 2 — Fill the gaps the parser cannot

The parser is deliberately conservative. **You** must complete these before validating:

- **Dark palette.** Shape B only derives a light palette when the source is light-primary; the dark
  slot comes back `null`. Look for `dark.css`, a `.dark` / `[data-theme=dark]` / `html.t4-dark` /
  `[data-bs-theme=dark]` scope inside the main stylesheet, or a documented palette. If none exists,
  leave `dark: null` and state in `design-spec.md` that dark is derived in Phase 6 per
  `../dark-light-mode-standard.md`.
- **`sections[]`.** The parser does not decompose pages into ACM sections. Walk each home/landing
  page's section stack and classify each region (`../conversion-contract.md` §4.4). This is what
  makes the template admin-editable rather than a wall of static markup — skipping it fails the #1
  review gate (`../editability-standards.md`).
- **Page count.** A thin bundle (say 6 pages) is under the coverage floor. Extend to the 18–24-page
  baseline per `../page-coverage-matrix.md` tier F and `../catalog.md` — the extra pages are yours
  to select, and **varying the selection between builds is required, not optional**.
- **`design-spec.md`.** Generate with `scripts/make-design-spec.mjs`, then resolve every `TODO`.

## Step 3 — Validate

```bash
node scripts/ingest/spec-pack.mjs --validate <WORKSPACE>/<SLUG>-spec
```

## Why this kind verifies best

Both sides are real DOM, so Phase 8 can probe `getComputedStyle` on the reference page and the
Joomla page and diff them numerically with `scripts/verify-render.mjs` — no visual judgement in the
loop. Keep the reference pages renderable: they must open standalone in a browser with their CSS
intact. If a page in `reference/` renders unstyled, the relative asset paths broke during the copy
and every parity check on it is meaningless.

## Manual verification checklist

- [ ] Each file in `reference/` opens in a browser **with styling applied**.
- [ ] Manifest-vs-DOM conflicts were surfaced to the user, not silently resolved.
- [ ] Dark palette extracted or explicitly marked derived.
- [ ] Home/landing pages have a populated `sections[]` with ACM kinds.
- [ ] Page count meets the floor; the selection was varied deliberately.
- [ ] The validator passes.
