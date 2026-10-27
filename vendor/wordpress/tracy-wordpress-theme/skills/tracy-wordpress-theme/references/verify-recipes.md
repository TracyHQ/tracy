# Verify — compare WordPress pages with the reference, light AND dark

> **Phase 8 packet (verify).** Read when accepting parity view by view. This is the work the verify subagents run
> in parallel ([`build-subagents.md`](build-subagents.md) §A) at the pilot and the final audit; after the pilot each page group measures itself on its own stand (§Parallel page groups). Prerequisite: seeding done (Phase 7), the stand answers 200
> on every route.

The yardstick of the whole build is **render parity**: the live WordPress page must match the **reference** in layout
structure, token colours, type, spacing — in **both** light and dark — confirmed by side-by-side images **and** a deterministic
computed-style diff. Measure with `getComputedStyle`, not by eye, not by "surely fixed".

Before the first measurement: `node scripts/lessons.mjs scan --spec <spec> --theme <src/<slug>> --source <saved source pages>`
([`lessons.md`](lessons.md)). Exit 1 lists past defects whose trap is in these inputs — handle them before
reading a parity delta they explain; exit 2 means an input could not be read, so nothing was
checked. The scan reads files only; the live-page lessons it names on stderr are checked by the tools below. The scan replaces none of the gates below.

## §0 — What to compare against depends on the input (read first)

```bash
cat <spec>/reference.json      # kind · viewports · modes · pages[]
```

| `kind` | Reference side | How |
|---|---|---|
| `url` (`from-joomla`, `from-url`) | the live page at `pages[].url` (Tracy Base: `http://127.0.0.1:8217/<Joomla path>`) | §0a — measure both sides, diff the numbers. Prefer the snapshot captured in Phase 2 so a changing source does not move the target. |
| `html` (`from-html`) | the file in `<spec>/reference/<page>` | §0a, the reference side is `file://` |
| `image` | (no adapter yet) | compare images + assert numbers against the `design-spec.md` table |
| `none` (`from-brief`) | none | Source comparisons are typed not-applicable against the spec binding; target checks stay live through visual QA, interaction, preflight and sweep. Round runs the sweep and release validates its full evidence, including target failures and unread measurements. |

**Never invent a reference.** A page with no row in `reference.json` is an invalid spec-pack —
go back to Phase 2. A synthetic page (`synthetic: true` — `single.html`, `404.html`, the parent page `/company`) is compared
with the **design system** (tokens, type scale, spacing of `design-contract.json`), not with any
Joomla page; say so in the report.

### §0a — two sides, one snapshot pair per mode

```
R = reference.json
for page in page-map.pages:
    entry = R.pages[page.file]                      # missing ⇒ invalid pack, STOP
    for mode in R.modes:                            # light, dark
        WP:   open http://127.0.0.1:8227<page.path>  set mode (cookie tracy_theme=<mode>)  → image + snapshot W
        REF:  open entry.url                          set the source's mode (§1)            → image + snapshot R
        node scripts/verify-render.mjs W.json R.json [--tolerance 8]   → token/type/spacing delta
        compare the two images side by side                             → structure
    pass when: diff clean within tolerance AND images match in structure in EVERY mode
```

`scripts/verify-render.mjs` is a **pure two-snapshot diff**: it does not open pages, capture, or set
the mode. You generate the snapshots (Playwright/CDP) — one per mode per side → four snapshots per page; diff
W-light↔R-light and W-dark↔R-dark. Exit 1 when there is drift outside tolerance. Stdout is one line (`mismatches=N checked=M`) plus the result file path; save the full delta as evidence with `--out <evidence>/render-<page>-<mode>.json`, or `--json` to print it to stdout.

### What parity means

> Structure + token colours + type + spacing match, confirmed by images and a computed-style diff with tolerance —
> **not** a pixel diff.

WordPress legitimately differs from Joomla in: block wrappers (`.wp-block-group`, `.wp-block-columns`) instead of `.container`
/`.moduletable`, `wp-block-*` classes, how fonts load, demo content that is not byte-identical. So compare **tokens**:
header/nav/hero/card/footer/button/link colours within ±8/255 per channel (the `verify-render.mjs` default);
`font-family` (family name, fallback noise dropped), `font-size`, `font-weight`, `line-height` on headings + body;
section padding, card gap within tolerance.

## §1 — Setting the mode, each side its own way (D4, D5)

| Side | Hook | Capture command |
|---|---|---|
| Joomla j6 (source) | `html.t4-dark` **and** `[data-bs-theme=dark]` — both, the template uses both (20 + 27 places in `template.css`) | `node scripts/shoot.mjs http://127.0.0.1:8217 --routes <render-routes.json> --out evidence/source --viewports 1440x900,390x844 --dark-hook 'class:t4-dark+attr:data-bs-theme=dark'` |
| WordPress `tracy-base` | cookie `tracy_theme` — the attribute is removed by the `<head>` script when there is no cookie ([`dark-light-mode.md`](dark-light-mode.md) §3) | `node scripts/shoot.mjs http://127.0.0.1:8227 --routes <routes> --out evidence/wp7 --viewports 1440x900,390x844 --dark-hook cookie:tracy_theme=dark` |

The Joomla command **was run** 13/09: 172 images, 43 routes × 1440/390 × light/dark, 0 errors
(`~/TracyHQ/quickstart-builds/tracy-base-wp7-1.0.0/evidence/source/index.json`); mean-gray home 1440
light 242 / dark 15 — the hook works, these are not light images named dark (D5). `shoot.mjs` applies the hook with
`addInitScript` (before the page's scripts), writes `<slug>__<width>__<theme>.png` + `index.json` (status,
final URL, console errors); a non-200 route is **recorded, not skipped**; exit 1 when a route is broken.

Image evidence lives **outside the repo** (`…/evidence/`, 51 MB for the source alone); `tasks/tracy-base-wp7/evidence/`
keeps only small reports (D5).

## §2 — Measurement selectors (the snapshot set per view)

**Logical** targets; map them to real classes by reading the rendered DOM (`scripts/review/probe.mjs <url> light
'<sel>'`), never by guessing. For the Joomla side read `acm-blocks.md` §1.5 (the `.ja-acm.acm-<type>` frame).

| Element | WordPress `tracy-base` | Joomla j6 |
|---|---|---|
| header | `.tracy-header` / `.tracy-header__inner` | `.t4-header` |
| logo / name | `.tracy-logo`, `.tracy-brand` | `.logo img` |
| nav (rest / active) | `.tracy-nav .wp-block-navigation-item > a`, `.current-menu-item > a` | `.t4-megamenu .nav > li > a`, `.active > a` |
| mega open | `.tracy-mega.is-open > .tracy-mega__panel` (opened with `mega-hover.mjs` or a real pointer) | `.t4-megamenu .dropdown-menu` |
| hero | `.acm-hero--split` / `.acm-hero--centered` | `.acm-hero.style-1` / `.style-2` |
| article body | `.tracy-page__body p`, `.tracy-prose p` | `.com-content-article__body p` |
| heading scale | `h1.tracy-display`, `h2.wp-block-heading`, `h3` | `h1`, `h2`, `h3` |
| card | `.tracy-card`, `.wp-block-post-template > li` | `.tracy-card`, `.blog .item` |
| button | `.wp-block-button__link`, `.tracy-btn--primary` | `.btn-primary` |
| link | `.tracy-prose a`, `main a` | `.item-content a` |
| footer | `.tracy-footer`, `.tracy-footer__links a` | `.t4-footer` |
| form | `.wp-block-search__input`, `.wp-block-search__button` | `input.form-control` |

Measure the first **visible** element (skip hidden carousel clones). Open the mega/overlay before measuring inside it.
Forcing it open with a class only answers "what does it look like"; "can the mouse get in" is `mega-hover.mjs` —
[`chrome-and-navigation.md`](chrome-and-navigation.md) §3.

## §3 — Snapshot format

```json
{ ".tracy-header": { "color": "#1d1d1f", "backgroundColor": "#ffffff", "fontFamily": "SF Pro Text", "fontSize": "17px", "borderColor": "#e5e5e7", "paddingTop": "16px" },
  ".wp-block-button__link": { "color": "#ffffff", "backgroundColor": "#0071e3", "borderColor": "#0071e3", "fontSize": "15px" },
  "h2": { "color": "#1d1d1f", "fontFamily": "SF Pro Display", "fontSize": "40px", "fontWeight": "600", "lineHeight": "42px" } }
```

Keys are **logical** selectors (the same on both sides even though the real classes differ), values are computed styles with colours
normalised to hex. Generate them with one `getComputedStyle` pass (borrow `probe.mjs`'s `read()` function), written out as JSON.

## §4 — Design contract and content contract at the same time

In the same page visit, evaluate `captureDesign` (`scripts/design-probe.mjs`) with the request from
`design-contract.mjs request`, collect the observations, then `design-contract.mjs audit` ([`design-contract.md`](design-contract.md)
§Full acceptance); read the text/links/images into `observed-content.json`, then `content-contract.mjs audit`
([`content-contract.md`](content-contract.md) §Phase 8/8b). The three gates — verify-render, design audit, content
audit — are independent and must all be green; each command writes its full report to `--out` — read it back with `head`/`grep` on that file. `port-checks.mjs` does not cover these three gates; it covers `verify.mjs` (`verify.json`), `port-audit`, the Fast Gate and the group verdict ([`tools.md`](tools.md)).

## §5 — Checklist per view (both modes, every box)

- [ ] Header / logo — background, height, logo readable on the dark background.
- [ ] Nav + mega — rest, current, **open**; columns/width; child link colour; `mega-hover.mjs --items '.tracy-mega'` PASS at 1440 and 1024.
- [ ] Hero — background (colour **and** background image), heading colour/size.
- [ ] List cards — background, border/shadow, title/excerpt/meta colours, gap.
- [ ] Single — type scale, link colour, quote, inline images, meta line.
- [ ] Forms — search, login (`wp-login.php`): input background/border/text, focus ring, button.
- [ ] Footer — background, columns, links, bottom line.
- [ ] 404 / search — full chrome (not standalone like Joomla), same theme.
- [ ] No horizontal overflow at 390; no tofu; no 404 images (shoot's `index.json`).

Plus the six dark scanners ([`dark-light-mode.md`](dark-light-mode.md) §4) on **every** page after each fix round.

## §6 — `http-parity.mjs` (since 14/09)

```
node scripts/http-parity.mjs --source <source url> --target <port url> --routes <page-map.json|list> \
  [--map redirects.json] [--pairs pairs.json] [--accept parity-accepted.json] [--media-map media.json] \
  [--render source|target|both] [--runs elements|leaf] [--min-words 4] [--out http-parity.json]
```

The standard is **containment**: every text run of the source (headings, and every run ≥ `--min-words`, outside chrome) must be
on the port page; images are compared by basename, or through `--media-map` (below). Chrome is header, nav, footer and the
theme/T4 chrome selectors (`lib/parity-extract.mjs` `CHROME`); a sidebar is content on both sides, whether it is an
`<aside>` or a `<div>` — dropping `aside` read a block theme's sidebar as missing against a T4 `div.sidebar-r`
("Search", "Latest News", "Popular Tags" on JA Vega /featured-articles, #27 item 8). Three flags decide whether the result is right or falsely pretty:

- `--map` for a **renamed** route on the same site (the old path must 301); `--pairs` for a source that is a **file**
  (`/About.html` ↔ `/about`) — compares the pair, demands no redirect.
- `--render source` when the source writes its text with script (a canvas export): a bare fetch sees only the skeleton.
- `--runs leaf` when the source is a design-tool export: the text sits in `div > span`, and the default mode
  (`p/li/td…`) **does not see it** — the Northgate run lost a whole 4-row pricing table while parity still said "ok" 5/17.
  For a real CMS site `elements` is enough and less noisy.

Every remaining delta must be named in `parity-accepted.json` (`{match, routes, reason}` with a G-number) —
a gate is green on recorded exceptions, not on silence.

- `--source-snapshot <spec dir>` (since 14/09) replaces `--render source` when `from-html` has written
  `spec/reference/rendered/<slug>--1440-light.html`: it reads `reference.json` `pages[].path`, compares the mtime
  (or the hash, if recorded) with `pages[].static` — a newer static file re-renders that route and notes
  `snapshot stale`; no file → render and note `no snapshot`. The browser opens only when a route needs it.
  Measured on wp-tracy-business, 17 routes: 21 s → 1 s, report identical route by route.
- `--cache <dir>` keeps the verdict keyed by sha256(source HTML) + sha256(target HTML) + `TOOL_VERSION` + options;
  a hit writes `cached: true` and the totals `cached N/M`. `--no-cache` at release.

Added 26/09 (issue #7, gotchas 42–44):

- **Expected status.** A pair's `status` wins; otherwise the `--routes` page-map entry declares it
  (`status`, or 404 for `view: "404"`); otherwise 200. A declared status other than 200 passes only when
  **both** sides give exactly it (a live source serving a page there fails), and the text is still
  compared. A static export's error page answers 200 whatever it holds, so a declared **4xx** is checked
  on the target alone, noted `static file: 404 checked on the target` — only when `--source-snapshot`
  points at a from-html spec whose `reference.json` (kind `html`) lists that page with its `static` file.
  A route ending in `.html` without that provenance is a live route and must give the status itself; a
  declared 3xx is never met by a file.
  `--source-snapshot` keeps no status, so such a live route is rendered and noted `declared 404: rendered
  live`. So `--routes page-map.json` alone judges the 404 page
  correctly: JA Vega `/404` went from `FAIL 404/404 runs 2/2` to `ok`.
- **`--media-map <seed-out>/media.json`.** WordPress renames an upload whose file name is taken
  (`features/item-5.jpg` → `item-5-7.jpg`). With the seeder's map, a source image whose path ends with
  a key is present when the target shows that key's URL (or a `-WxH` size of it), and is reported by
  its **source path** when not. An image the map does not name is still compared by basename. JA Vega,
  31 routes: `missingImages` 120 → 72. 55 renamed uploads cleared; 6 missing images that a shared
  basename had hidden are now reported (`others/item-1.jpg` on six service pages). The map's hash is
  part of the cache key.
- **Inputs are checked first.** A file named by `--routes`, `--accept`, `--pairs`, `--map`, `--media-map`
  or `--source-snapshot` that is missing or not JSON, or a flag with no value, exits 2 naming the flag
  before anything is fetched. A route list must be `/paths`; `--routes /` is the root route.

## §6b — `review/functional.mjs`

`review/functional.mjs <site> --routes <page-map.json|/a,/b>` measures **every** page of the page-map,
synthetic ones included (the 404 page, a post standing in for the single view). A page declared 404
must answer exactly 404 and is still read for `lang`, `h1`, `alt`, labels, forms and links. A same-page
`#fragment` href (skip link, `#` menu item) is not a link: resolved, it is the page's own URL, which on
the 404 page answers 404. JA Vega: 29 → 31 pages, `/404` 0 findings. A `--routes` file that is missing
exits 2.

**The drawer** (#41 M6-18). Counting links and buttons says nothing about whether a visitor can close the menu:
JA Vega's header drawer opened on a tap, but its "Close the menu" button sat under the open panel (`z-index` 80
over the button's) — the centre of the button hit `#jv-header-menu`, a tap did nothing, only Escape closed it.
functional now opens and closes the drawer the way a phone does: a 390 px context with a touch screen, one pass in
light and one in dark (`--dark-hook`, e.g. `attr:data-theme=dark`; the pass checks the hook's mark is on the
document, and a route whose two passes draw the same colours did not switch), on the first route that answers or
on `--drawer-routes /a,/b`. Each pass taps the open button's centre (`page.touchscreen.tap` — never `force`,
`element.click()` or Escape), waits for the panel, reads `aria-expanded` (`"true"`, or a button with
`aria-haspopup="dialog"` whose panel is `aria-modal`), hit-tests the close button's centre
(`document.elementFromPoint` must land in the button), taps there, waits for the panel to go, and reads
`aria-expanded` `"false"` and focus back on the open button. Findings, each with its route and mode:
`drawer-missing`, `drawer-ambiguous`, `drawer-open-covered`, `drawer-open-failed`, `drawer-aria-expanded`,
`drawer-close-missing`, `drawer-close-offscreen`, `drawer-close-covered` (with the element drawn there),
`drawer-close-failed`, `drawer-focus`, `drawer-mode`, `drawer-error`. `report.drawer.examined` counts the passes,
drawers, taps, drawers closed by a tap and the modes tapped in, and the MD report prints them.

`--drawer auto` (default) looks for core/navigation's overlay (`.wp-block-navigation__responsive-container-open`,
its container, the close button inside it) and records a site without one; `--drawer core` requires it; a port's
own drawer is named with `--drawer-open <sel> --drawer-panel <sel> --drawer-close <sel>` (all three, each matching
one element), which requires it too; `--drawer none` skips the check. A required drawer that no pass could tap is a
finding, never a pass on 0 examined.

## §7 — `verify.mjs` and `review/scan.mjs` (since 14/09)

```
node scripts/verify.mjs --source <source url> --target <port url> --spec <spec dir> --pairs pairs.json \
  --accept parity-accepted.json --config review.config.json --evidence <dir> [--theme <theme dir>] \
  [--fast|--full|--both] [--dark-hook attr:data-theme=dark] [--no-cache] [--timeout 20] [--concurrency 4]
```

Phase 8 in one command, three child tools in the order `http-parity` (snapshot) → `review/scan` → `shoot`:

- `--fast`: `plan()` picks from `page-map.json` (default locale) home + the **first page of each `view`**
  + single + 404 — 12/17 routes on wp-tracy-business — at 1440, light+dark. Red prints the delta per
  route and does **not** run full. `--full` = the matrix as before (every pair × 2 viewports × 2 themes, scan every
  route answering 200; `--scan-routes <file>` to narrow the scanners). `--both` (default) = fast then full.
- Each phase is a child process with `--timeout` (minutes), output teed into `evidence/verify.log`;
  `evidence/verify.json` is rewritten after each phase (phase, seconds, exit, summary, failing). A route whose pair says
  `status: 404` is judged correct when shoot sees 404.
- Measured 14/09 on wp-tracy-business, cold cache: fast 17 s, full 27 s (parity 1 s · scan 32 checks 4 s
  thanks to the fast run's cache · 68 images 22 s) — the same 17/17 parity, the same 25/26 scanners, the same 68 images.

`review/scan.mjs <url> --routes … --config … [--tools leak,contrast,editability --theme <dir>]` runs
the scanners as **functions** of the standalone scripts on one browser (`lib/browser.mjs`: one Chromium, N contexts,
results in route order whichever page finishes first), prints exactly the `<tool> <route> {…}` lines of the old log, writes
`--out` JSON; exit 1 on a `fail`, 0 when only `needs-review`. 13 pages × 2 tools: 35 s → 12 s, 26 lines
identical byte for byte. The standalone scripts stay as they are for debugging one page.

## Operating notes

- A page with a third-party embed never reaches `networkidle` → `waitUntil: 'load'`.
- Turn animations off before a static measurement: `[data-aos]{opacity:1!important;transform:none!important}` (the scanners
  already do).
- Measure after transitions settle — flipping the theme and reading at once returns mid-transition values (`border-color`).
- To confirm a fix reached the page: reload → re-measure the **computed value**, don't look at the image. WordPress has no
  optimize cache like T4, but a cache plugin (if any) does — the theme defines `DONOTCACHEPAGE` when
  previewing `?style=` (the pack README), not when verifying.
