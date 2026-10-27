# Adapter — HTML folder (canvas export, bundle, or raw) → spec-pack

> **Phase 2 packet.** Read [`spec-pack.md`](spec-pack.md) first. Emits `kind: "html"` — the strictest kind.
> Ported from T4 13/09/2026; since 14/09 it emits **the full set of files the seeder reads** (`content.json` · `sections.json` ·
> `menus.json` · `redirects.json` plus the two contracts), and it has run for real on a 34-page Claude
> Design canvas export (§Claude Design canvas export). No WordPress site has been built along this path yet — that is the next step.

## Three shapes it accepts

**C — Claude Design canvas export:** any page that has `<x-dc>` + `<script type="text/x-dc">`. Read about it
separately in [§Claude Design canvas export](#claude-design-canvas-export) — it is quite unlike the two shapes below, because opening the raw
file shows an empty skeleton.

**A — bundle with `manifest.json`:** `pages/*.html` + `assets/{css,js,images,fonts}`. The manifest declares the
identity, light/dark palette, fonts, `pages[]` with `view`. The manifest states *intent*, the markup states *fact* — when they
disagree, **the DOM wins** and you must ask the requester again, not choose yourself.

**B — raw `.html` folder:** the parser (`scripts/lib/html-bundle.mjs`) infers on its own: `index.html` (or the largest
page) is `front-page`; the largest CSS for `:root` custom properties → palette + fonts; light/dark by the luminance
of the background; each page's view by file name, with DOM signals taking precedence (`input[type=password]` → `page-login`; a form
with textarea + email → `page-contact`; `<article>` → `single`). The file name → view table is at the top of
`html-bundle.mjs` (`FILENAME_VIEW`): `login|signin` → `page-login`, `register|signup` → `page-register`,
`profile|account` → `page-account`, `contact|reach` → `page-contact`, `offline|maintenance` →
`page-maintenance`, `404|error` → `404`… Pages that WordPress core draws itself (login, register) still get a
`page-<name>` so the theme can **name** them — the page keeps its own file, and the theme can still style it.

## Step 1 — parse

```bash
node scripts/ingest/from-html.mjs <folder> --out <spec> [--render | --no-render] [--port N] \
     [--scope website] [--page-floor N] [--single] [--force] [--strict]
```

It detects the shape by itself (has `text/x-dc` → C, has a manifest → A, otherwise → B), writes **all ten files** of the pack
(`page-map.json` · `content.json` · `sections.json` · `menus.json` · `redirects.json` ·
`design-contract.json` · `content-contract.json` · `reference.json` · `provenance.json` ·
`design-spec.md`), copies the pages into `reference/`, copies `assets/`. For A and B, content / sections / menus
are taken from each page's raw DOM (`scripts/lib/html-content.mjs`, the same heuristics as C). When done it runs
`--validate` by itself and prints the result; the pack **is still written** when it has not passed the gate (a 6-page bundle is a valid starting
point to fill in by hand); only `--strict` forces exit 1. `--single` forces raw mode when the folder happens to have
a `manifest.json` that should be ignored. To only print the page-map for a look: `node scripts/parse-html-bundle.mjs [--single]
<dir>`.

The adapter also writes `source-fonts.json`. The static report follows the CSS linked/embedded on the pages: the CSS families declared
for `body`, headings and nav, the `@font-face`/`src` rules, loader URLs, and missing or unreadable stylesheets as
gaps. The Phase 2 gate needs a browser measurement for every page at 1440 and 390 px. Run `--render` to collect it;
without a browser measurement the pack does not pass the gate and must be rebuilt with `--render`. A finding can only be waived
by a closed decision in `DECISIONS.md` that names the exact key.

## Step 2 — fill in what the parser deliberately does not guess (shapes A and B)

- **Dark palette.** Shape B only infers the light palette when the source is light; the `dark` cell becomes `null`. Look for `dark.css`,
  a `.dark` / `[data-theme=dark]` / `@media (prefers-color-scheme: dark)` scope in the main stylesheet. If there is
  none, leave it `null` and set `theme.darkDerived: true` — Phase 6 derives it per
  [`../dark-light-mode.md`](../dark-light-mode.md).
- **`sections[]`.** Since 14/09 the parser splits `<main>` into sections by heuristic (§Claude Design canvas export, the same
  `detectSectionType`) and writes `content.json`/`sections.json`; check each block of home/landing and
  name it by the pattern that will receive it: `section-hero-*`, `section-features-intro`, `section-pricing-tiers`,
  `section-testimonials`, `section-clients`, `section-statistics`, `section-accordion`,
  `section-cta-capsule`… (list in [`../templates-and-patterns.md`](../templates-and-patterns.md)).
  Skipping this step skips review gate number one ([`../editability-standards.md`](../editability-standards.md)):
  a marketing page becomes a wall of `core/html`. A section that falls back to `core/html` carries the canvas export's
  inline styles as is (colours "baked" for light); the seeder turns literals that match a theme preset into
  `var(--wp--preset--color--…)`, and the rest are counted in `report.inlineColors[].kept` — see
  [`../gotchas.md` §22](../gotchas.md).
- **Page count.** A 6-page bundle is below the floor of 12. Either expand it (blog, single, category, search, 404, contact,
  about…), or run in `scope.mode: website` with `scope.pages` listing exactly the requested pages.
- **`design-spec.md`**: `node scripts/make-design-spec.mjs <spec>/page-map.json --out <spec>/design-spec.md`
  then fill every slot.
- **The two contracts** (`content-contract.json`, `design-contract.json`): the skeleton made by `--init` has `pending`;
  fill them per [`../content-contract.md`](../content-contract.md) and [`../design-contract.md`](../design-contract.md).

## Step 3 — gate

```bash
node scripts/ingest/spec-pack.mjs --validate <spec>
```

## Why this kind compares best

Both sides are real DOM, so Phase 8 measures `getComputedStyle` on the reference page and the WordPress page and diffs
the numbers with `scripts/verify-render.mjs` — there is no eyeball judgement in the loop. Pages in `reference/`
must **open on their own with their CSS intact**; a page that opens blank means an asset path broke during copying, and every
comparison on it is meaningless.

## Claude Design canvas export

### Recognising it

A page is a canvas when it has **both**: a `<x-dc>…</x-dc>` template (markup with `{{ t.hero.h1a }}`,
`<sc-if>`, `<sc-for>`) and `<script type="text/x-dc" data-dc-script data-props="…">`. Opening the raw file shows
an empty skeleton — the text only appears when `support.js` (React from unpkg) renders, or when the
literals in the data script are read directly. **Every page shares one data script**: Northgate's 34 files differ
exactly in `<title>`, `state.page`, `get lang()`, `LANG_HREF`, `PAGE_FILES` and the asset prefix (`./` at the root,
`../` under `RU/`). Count pages by `state.page` + `get lang()`, not by file name. A page in a
locale folder (`RU/Home_ru.html`) pairs with the root page of the same `state.page` → `translations` / `translationOf`;
the default locale is the locale of the pages at the root.

### Two read paths, do BOTH

**1. AST — always runs, no browser needed** (`scripts/lib/canvas-export.mjs`, acorn):

- `parseDataScript`: only accepts `const X = <literal>` (object / array / string / number / boolean /
  template without expressions). Function calls, spreads, identifiers → recorded in `provenance.gaps[unsupported-literals]`,
  **never executed**. Locale dictionaries pair by name: `EN` is `t`, `RES_EN` is `res`…
- `evaluateComponent`: a **pure subset** evaluator that walks the class's `renderVals()`: `const`/`let`,
  `if`, `return`, `.map` with arrows, spread, `=== || ?? ?:`, `this.state`, `this.props` (defaults from
  `data-props`), class methods and getters. There are no globals: `window`, `document`, `setState`,
  `fetch` are *unresolved* and skipped. The only side effect it recognises is `window.location.href =
  …`, which returns `{ $href }` — so `onClick="{{ go('about') }}"` becomes a real `href`, and the menu has targets.
- `bindTemplate`: renders statically with exactly the runtime's mini-language (`{{ path }}`, `===`, `!`, literals;
  `sc-for` with `as`; `sc-if` — an *unresolved* value falls back to `hint-placeholder-val`, just as the
  export declares itself). A binding that cannot be resolved **stays as `{{ … }}` on the page** and is counted in
  `provenance.gaps[unresolved-bindings]` — nothing invented. Result: `reference/static/<file>` for each page.
  Northgate: 34/34 pages fully resolved, 0 holes.

**2. Render — `--render`** (`scripts/lib/html-render.mjs`, Playwright Chromium, needs
`npx playwright install chromium`; `RENDER_CHROME_PATH` to point at another Chrome): starts a static server on
`127.0.0.1` on a free port (`--port N` to pin it), renders each page at **1440 and 390 × light and dark**
(dark = set `data-theme="dark"` on `<html>` + emulate `prefers-color-scheme`), and writes:

- `reference/rendered/<slug>--1440-light.html` — the filled DOM, with `<script>`/`<x-dc>` removed. It **replaces** the static DOM
  as the content source; a page that cannot be filled (text < 200 characters — network down, runtime broken) reuses the
  static DOM and records `gaps[render-skeleton]`.
- `reference/rendered/<slug>--<vp>-<mode>.jpg` — four images per page (`reference.json.pages[].shots`).
- computed style of `body`, `h1/h2/h3/p`, the first section (band rhythm = the most common `paddingTop` of
  `main > section` or its first child), the first CTA button with a background in the header, the container width
  (the most common `max-width` ≥ 600px) → `design-contract.json` (`tokens` 4 variants, 7 rules, empty
  `pending`). Colours **declared** in the helmet CSS (`a`, `a:hover`, the `html[data-theme="dark"]` remap) win over colours
  **measured** — the first link measured may be a white CTA on a dark band.
- **chrome link probing**: anchors in the header/footer/topbar with `href="#"` are actually clicked; the navigation request
  is `route.abort('aborted')` so the page stays put, and the target URL is recorded. A click that does not navigate
  but reveals new anchors (mega menu) → probe one level further as `children`. Only the first page of each locale is probed
  (the chrome is the same on every page). A panel where every link is a locale's front page is a **language
  switcher**, and does not go into the menu (recorded in `provenance.notes`).

Network: the export loads React from unpkg and fonts from Google — `--render` needs the network; the AST path does not.
Northgate, 34 pages: ~2 min 25 s on the iMac.

### What each output file holds

| File | Content |
|---|---|
| `page-map.json` | `template.name` = slug from the site name (`<title>` before ` — `) · light **and dark** palette from the helmet CSS (`body`, `html[data-theme="dark"] body`, `a`, `a:hover`) · fonts · `locales`, `defaultLocale` · `pages[]`: `file`, `view` (name → view table: Home → `front-page`, News → `home`, Article → `single`, Search → `search`, 404 → `404`, Contact → `page-contact`, Style guide → `page-style-guide`, Newsletter/Email/Form/Slide → `page-<x>`, otherwise `page`), `path` (`/about`, secondary locale `/ru/about`, RU front `/ru`), `locale`, `translations`, `translationOf`, `source.rendered`, `sections[]` = section ids in `sections.json` · a **synthetic** entry `category.html` (`synthetic: true`, stood in for by the News page) when no page is a category |
| `content.json` | `site` (name, tagline from the brand block in the header, `locales`) · `categories` (`news` when there are posts) · `pages[]` as in from-joomla: `contentKind: "sections"` with `{kind:"section", sectionType, moduleId, title, position:"main", html}` for recognised sections, `{kind:"html", blocks}` for unrecognised sections, `contentKind: "blocks"` (html-to-blocks) for pages that are not a section stack (Style guide, Email, Form); secondary-locale pages have `parent: "/ru"`; `404` is a `draft` page · `posts[]`: `single` pages become real posts (body = `<article>` → blocks), listing-page **cards** become `synthetic: true` posts with only an excerpt + image (`gaps[listing-cards]`) · `archives[]`: `home` (News) and `search` · `images[]` (`img/x.png` → `/wp-content/uploads/x.png`) · `assets[]` (PDF) · `unresolvedLinks[]` |
| `sections.json` | `acm: []` · `custom[]`: one instance per section `{id, title, position:"main", scope:"page", sectionType, locale, pages, html, blocks, images, fields{eyebrow,heading,intro,ctas,filters}, items[]}` (items = the largest group of same-shaped siblings: title/text/img/href/meta — see **items and chip strips** below) · plus `footnav-<n>` **only for footer columns without a heading** (h3 + `<li><a>`, n = column index); a column with a heading is already a `footer-<slug>` menu and is not synthesised again — before 14/09 every named column was duplicated into a `tracy-footer-N` post that no template read |
| `menus.json` | `tracy` = header nav (secondary locale `tracy-ru`), `topbar`, `footer-<column slug>`; **a secondary locale takes the menutype of the column with the same index in the default locale + `-<locale>`** (`footer-company-ru`, not `footer-компания-ru` — the theme switches menus by language with `<default menutype>-<lang>`, D11), `title` keeps the translated text; a column that cannot be paired falls back to the slug of the translated heading, with a line in `notes[]`; items `{label, type page/url, url = WP path, page, view, children}`; dead links (`#` that does not navigate, or pointing at a page not in the export) **do not go into the menu** but sit in `gaps[dead-chrome-links]` |
| `redirects.json` | `rules: []`, `categorySlugs: []` — the export has no old paths |
| `design-contract.json` | hook `html[data-theme]` · 4 variants · `tokens` (`--font-body`, `--font-heading`, `--color-bg/text/link/primary/accent`, `--text-base/h1/h2`, `--section-y`, `--container-max`) · rules `body-type`, `heading-1`, `body-colors`, `link-color`, `section-rhythm`, `container-width`, `primary-button` · `pages[].url` = URL on the static server at render time (`provenance.source.serve` records the port; serve the original folder on that port again to remeasure). Without `--render`: read from inline styles, `clamp(a, b vw, c)` is resolved at 1440 / 390 |
| `content-contract.json` | mode `demo`, `language` = default locale · facts `site.name`, `site.tagline` (verified, source `design`), `contact.email/phone/address/hours` from the Contact page (demo), `demo.disclosure` · one surface per page-map page |
| `reference.json` | `kind: html`, viewports `[1440, 390]`, modes light + dark; for each page `path` = render snapshot (or the original file), `static` = the static bind, `shots` = 4 images |
| `provenance.json` | `counts` (pages per locale, sections per type, menus, images, documents, pages rendered) · `notes[]` · **`gaps[]`** — a list of coded content gaps: `listing-cards`, `untyped-sections`, `dead-chrome-links`, `documents`, `unreferenced-images`, `unsupported-literals`, `unresolved-bindings`, `holes-on-page`, `image-slot-placeholders`, `render-skeleton`, `locales` |
| `design-spec.md` | `make-design-spec.mjs`, then fill every slot from measurements (or inline styles); for a source slot that is absent write "not declared in the source" outright |

Section type detection (`detectSectionType`, in order): a token in `id`/`class` (`sec-services`) →
structure (≥ 2 inputs → `form`; the first section with an `h1` → `hero`; ≥ 3 repeated rows starting with consecutive ordinals
from 1 — `01`, `1.`, `Step 1` — with no heading of their own → `services`, numbered cards, meta = ordinal (when read by
heading, "How we run a project" became `projects` and the ordinal landed in the title cell — full-2 15/09); ≥ 3 short
numbers with captions → `stats`;
h2 + ≤ 1 p + link, little text → `cta`) → keywords in the section's **highest heading** (EN + RU: services ·
projects · news · team · contact · faq · gallery · slide) → ≥ 4 images with little text → `gallery` → has a heading
and paragraphs → `text` → otherwise `null` = `kind: "html"`. Breadcrumb rows (short, containing `/`, with links, no
heading) are **dropped** from the content — the theme draws its own breadcrumb.

**Items and chip strips** (`sectionItems`, fixed 14/09 after the first Northgate → WP render). Items are the largest group of
≥ 2 **same-shaped** sibling elements in the section. The shape of a **card** (has an image or a
heading, and has text) is *tag + whether it has an image + heading level* — so a first card `<article><div>…</div><div>…</div>`
and the two following cards `<article><div>…</div><a>…</a>` (text wrapped in a link) are still **one** group of three; elements
that are not cards are still compared by tag + list of child tags as before. A **chip strip** — 2–6 short labels (≤ 2 words),
no image, no heading, no `<p>` (All · Factories · Infrastructure · M&E of Selected projects) —
is **never** items even when it is the largest group: it is written to `fields.filters[]` in DOM order, and items are
the card group after it. With no card group, `items: []` and `filters` is still written. This applies to every section type
(`services`/`news` with a tab strip in front as well). The first run did not have this rule: `home-en-3` carried 4 chips
as items, the intro was the first card's text, and the three project cards were lost.

**One source `<section>` holding several blocks = several sections** (`splitBlocks`, fixed 14/09 after the
Northgate → WP measurement). The canvas merges two or three section-looking blocks into one `<section>` (or one child of
`<main>`), each block with its own `h2`: Services has "How the work runs" + "Indicative pricing", Investor
relations has "Dividends" + "Investor calendar" + "Corporate governance", Slides has "Ready-made decks" +
"House rules" + an aside "Brand assets". Read as one section, `fields`/`items` describe only the first block and **the
pricing table drops off the site entirely**. Split rule: each `h1`/`h2` **not inside an item** opens a block; an `<aside>` is a
block of its own (a sidebar is not the tail of the heading before it). *Inside an item* = inside an `<article>`,
an `<li>`, or a member of a **card row** (≥ 3 same-shaped siblings — the floor of 3 is deliberate: a
pair is two columns, each column a block; three or more is a card row and the heading inside is the item's name). Split at any
depth: the wrapper chain above the heading is shallow-cloned, the part between this heading and the next is cloned
whole — every text node of the source lands in **exactly one** block (the test measures it by concatenating text). What comes before
the first heading (eyebrow, lead) goes with the first block. The first block keeps the wrapper's `id`/`class` (the author named
it); later blocks keep only tag + `style`, and `detectSectionType` runs again on each block. A section with one
heading, or a second heading inside a card, **does not change** — `html` is byte-for-byte as before. Ids keep counting
continuously within the page (`services-en-5` + `services-en-6`, the old CTA becomes `-7`), so a `patterns.map`
or `parity-accepted.json` that pins ids **must be renumbered** after rerunning the adapter.

**`<br>` is a space.** `textContent` reads `<br>` as empty, so a heading the author broke over two lines
(`for<br>next`) came out as "fornext" in `fields.heading`, the section's `title`, `items[].text` and the page's `h1`.
All text in `html-content.mjs` goes through `textOf()` — `<br>` becomes a space, and an element whose only children are
`<br>` is still a **leaf** (the caption "Projects<br>delivered" is one leaf). The block markup path (`html-to-blocks`)
keeps `<br>`, and `<br/>` and `</br>` restored by the HTML parser become breaks in paragraphs/headings.

### Limits — read before trusting the numbers

- **The pure subset only gets through `renderVals()`**: whatever a handler does beyond `window.location.href` (opening a
  mega menu, switching theme, scrolling) is *unresolved*; the static bind therefore has no mega panels — only `--render`
  can probe `children`. Labels computed in the class (`allProjLabel`) do get through the evaluator, but an
  expression it does not understand leaves that attribute empty and `provenance` does not list each one — compare
  `reference/static/` with `reference/rendered/` when in doubt.
- **WordPress core has no i18n**: a secondary locale is a page tree under `/<locale>`, posts carry a
  `locale` field, and share one `news` category. A multilingual plugin is a decision for a later phase.
- **`page-map.pages[].view` of RU pages** keeps exactly the view of the matching EN page (front-page, single…)
  to describe the template; the seeder only treats `/` as the real front page.
- **Images**: the export keeps most image paths in the data object, not in the markup; images no page
  references sit in `gaps[unreferenced-images]` (Northgate: 14/49, including `hero.png`, `logo-1..5`,
  `map.png` — the EN pages use the `*-ru.png` set). An `<image-slot>` without `src` keeps only its caption.
- **PDF**: `decks/*.pdf` links become `/wp-content/uploads/<file>` and are listed in `content.assets` +
  `gaps[documents]`; the seeder must upload them from `assets/decks/` — the adapter does not embed PDF content.
- **Band rhythm and container** are the *most common* values, not each section's value; a section
  off the rhythm must be measured by hand in Phase 6. `border` and `card padding` are not measured — the slot says so.
- The evaluator has a budget of 200,000 steps; for a loop the subset cannot bound, the adapter stops with a
  message instead of hanging.

Test: `scripts/test/from-html-canvas.test.mjs` on the fixture `scripts/test/fixtures/canvas-min/` (2 EN pages +
1 RU, one shared data script with `COMPUTED = someCall()` to exercise `unsupported`, `support.js` is an offline
replacement for the runtime so the render path runs without the network; `make.mjs` regenerates the three pages).

## Checklist before declaring Phase 2 done

- [ ] Every file in `reference/` opens in the browser **with styles**.
- [ ] Manifest ↔ DOM conflicts were handed to the requester, not decided on your own.
- [ ] Dark palette extracted, or `darkDerived: true`.
- [ ] Home/landing has `sections[]` naming patterns.
- [ ] Page count meets the floor or `scope` is declared correctly.
- [ ] Validator green.
