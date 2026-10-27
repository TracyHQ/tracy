# @tracy/cms-sections — the page sections both CMS themes ship

One source, two targets. Each section under `sections/` is WordPress block markup carrying two
kinds of class: `tracy-*` **role classes** (the contract a seeder and an agent navigate by) and
**Tailwind utilities** for the looks. `tailwind.css` maps the utilities onto the 56 OpenDesign token
names — an inline theme, no preflight, Tailwind's own palette and scale switched off — and
`sections.css` is the hand-written remainder (pseudo-elements, WordPress block overrides).
`scripts/build.mjs` compiles the utilities the sixteen sections actually use, appends the
remainder, and writes the library into both theme packages; `--check` is a gate (`cms-sections`),
so a stale copy in either theme is red.

Tailwind runs here, once, at build time. A customer's site receives plain CSS. A utility with no
token behind it (`p-7`, `text-red-500`, a typo) **stops the build and is named**, which is what
keeps every section on the contract every design system honours.

| Target | Where it lands | How |
|---|---|---|
| WordPress | `tracy-wordpress-theme/src/tracy/patterns/section-<name>.php`, `patterns/landing.php`, `assets/css/sections.css` | markup as-is (a pattern); CSS with `var(--x)` rewritten to the WordPress variable that carries x |
| Joomla | `tracy-joomla-template/src/tpl_tracy/sections/<name>.html`, `sections/landing.html`, `media/css/sections.css` | block comments stripped (block markup is valid HTML); CSS verbatim |
| Anything else | `regions.json`, here in the package | the SHAPE only — see below |

## Landing bands and standalone pages

`ORDER` is the landing order; `STANDALONE` is the sections that are a **page** rather than a band of
the landing page — style guide, contact, team, gallery, listing. The distinction used to be two
names compared inline, in two different places, which is a category written as an exception: the
WordPress composite lists pattern slugs and the Joomla one concatenates markup, so adding a section
to one exclusion and not the other would pour an archive index into the landing page on exactly one
CMS. `test/build.test.mjs` holds both composites to the same list.

## `regions.json` — for the platforms that are not these two

The sections carry `wp-block-*` classes and Tailwind utilities. Joomla takes them as they are
because `tpl_tracy` is built for them; **a T4 template is not** — it is Bootstrap 5, and carrying
these classes across would be wrong twice: once about the framework, once about `CLAUDE.md` rule 4,
which forbids bringing a second reset or Tailwind into a page someone else owns.

What does travel is the decision. `regions.json` is the platform-neutral shape of each section,
derived from the markup by `shapeOf()` on every build, so it cannot drift from what it describes:

```json
"team": {
  "title": "Team", "standalone": true, "root": "section", "measure": "62ch",
  "head": ["eyebrow", "h2", "lead"],
  "body": { "kind": "grid", "cols": { "phone": 1, "tablet": 2, "desktop": 4 },
            "gap": "--space-6",
            "item": { "role": "person", "parts": ["photo", "name", "role", "bio"] } }
}
```

That renders as `.row.row-cols-lg-4` in Bootstrap and as a block grid in WordPress, and both are the
same design. **A field the markup does not state is absent, never guessed** — the bespoke sections
(`hero`, the two CTA bands) declare only `root`, because their arrangement is a per-design-system
choice, and for the hero that choice already lives in `vendor/od-design-system/archetypes.json`
(`split` · `centered` · `cover` · `stack`).

## The utility vocabulary

Mirrors `vendor/tracy/od-design-system/systems/<id>/tailwind-v4.css`, OpenDesign's own mapping of the
same tokens, so a snippet written for their artifacts reads the same here:

| Utility | Token |
|---|---|
| `bg-accent` `text-fg-2` `border-border-soft` | the 16 colours, slug = token name |
| `font-display` `font-body` `font-mono` | the 3 families |
| `text-xs` … `text-4xl`, `leading-body` `leading-tight`, `tracking-display` | type |
| `p-4` `gap-6` `mb-12` (keys 0 1 2 3 4 5 6 8 12) | `--space-*` |
| `py-section-desktop` `px-container-phone` | section rhythm and gutters, per viewport |
| `rounded-md` `rounded-pill`, `shadow-raised` `shadow-ring`, `ease-standard` | shape, depth, motion |
| `max-w-page` | `--container-max` |
| `sm:` `lg:` | 40rem, 64rem — mobile first |

Arbitrary values are allowed when they name a token (`w-[calc(var(--space-4)*4)]`) or a plain
length (`max-w-[62ch]`).

## The fixture page — pixel for pixel what the preview showed

The preview dialog's Home chip is the design system's own `components.html` with the customer's
words poured in. A site built from that choice must render the same pixels, so both themes carry
a `fixture` page kind, and `lib/fixture.mjs` is what makes it possible:

- `fixtureParts(html)` splits a `components.html` into its `<style>` blocks and its body.
- `scopeFixtureCss(css)` fences the stylesheet under `.tracy-fixture { … }` with CSS nesting, so
  every selector is prefixed; `html`, `body` and `:root` become the wrapper itself (`&`), and
  `@font-face` / `@import` / `@keyframes` / `@property` are hoisted out. Each theme build writes
  one such file per design system (`fixtures/<id>.css`, 152 of them).
- `fixtureSnippet(html, id)` is the body inside `<div class="tracy-fixture" data-inspiration="id">`,
  what a seeder writes into the home article or page. `scripts/fixture-body.mjs <id> [--wp]`
  prints it (`--wp` wraps it in a core `html` block).

A fixture page loads **no** stylesheet of the theme, of WordPress's block library or of its
global styles: only `fixtures/<id>.css` and the theme's `fixture-page.css`. The other direction
was tried first — an `all: revert` fence — and rejected: it also reverts SVG presentation
attributes, so icons lost their colour.

`dev/parity.sh <id> <url>` renders the vendored `components.html` and the site page at the same
viewport and counts differing pixels with ImageMagick's `compare`. Zero is the bar, and zero is
what brutalism, airbnb and apple measure on both stands.

## The artifact page — the engine's landing, form and typography

The preview's Landing, Form and Typography chips are not files in the vendor library: the host
builds them at runtime with the brand engine (`@tracy/od-brand-engine`) and Tracy's typography
renderer. `lib/artifacts.mjs` calls the same engine at build time, from the same vendored
version, so a theme carries exactly what the preview drew:

- `buildArtifactDocs(system)` returns the three complete documents (`landing`, `form`,
  `typography`) for one design system; `buildArtifactDocsFor(id)` reads the system from the
  vendor library first.
- Each theme build fences every document's stylesheet under `.tracy-artifact` with
  `scopeFixtureCss` and writes `artifacts/<kind>/<id>.css` — 456 files per theme.
- `artifactSnippet(html, id, kind)` is the body inside `<div class="tracy-artifact"
  data-inspiration="id" data-artifact="kind">`; `scripts/artifact-body.mjs <id> <kind> [--wp|--doc]`
  prints it, or with `--doc` the whole reference document.

An `artifact` page follows the fixture's rules: no theme or WordPress stylesheet, only its own
`artifacts/<kind>/<id>.css` and `fixture-page.css`. `dev/parity.sh <id> <url> [out] --artifact
<kind>` measures it against the reference document; the landing of brutalism, airbnb and apple
measures zero on both stands.

The theme carries the **CSS** of the artifacts; the **HTML** is content in the CMS, written by a
seeder. Today's body is the engine's own copy; pouring the customer's words in is the seeder's
job, with the same slot plan the preview uses.

## The sections

In the order the design library's landing artifact shows them (`vendor/tracy/od-brand-engine/src/engine/artifacts/landing.ts`,
modules 2 to 11), then the pages. **The table is generated** from the `<!-- tracy:section {…} -->` marker
on line 2 of each `sections/<name>.html` (title, kind, class, what it holds) by `scripts/build.mjs`, and
`--check` is red when it drifts — the same is true of `regions.json`, which carries the same fields
beside the shape:

<!-- sections:begin -->
| Section | Class | What it holds |
|---|---|---|
| `hero` | `.tracy-hero` | eyebrow · headline · lead · two buttons · note · image |
| `social-proof` | `.tracy-social-proof` | rating line · "trusted by" · logo names |
| `problem` | `.tracy-problem` | section head · three cards |
| `pillars` | `.tracy-pillars` | section head · three numbered pillars |
| `how-it-works` | `.tracy-how` | section head · three steps |
| `cta-inline` | `.tracy-cta-inline` | calm call to action band |
| `features` | `.tracy-features` | section head · three zig-zag rows (text + image) |
| `proof` | `.tracy-stats + .tracy-testimonials` | four stats on an accent band · three quotes |
| `faq` | `.tracy-faq` | section head · four <details> |
| `pricing` | `.tracy-plans` | section head · three plan cards, middle one hot |
| `cta-final` | `.tracy-cta-final` | the page's loudest call to action |
| `styleguide` | `.tracy-guide` | type scale · colour roles · buttons · spacing · radii, all from the live tokens |
| `contact` | `.tracy-contact` | copy + a form (markup only; no endpoint is wired yet) |
| `team` | `.tracy-team` | section head · people grid: photo · name · role · bio |
| `gallery` | `.tracy-gallery` | section head · shot grid: media · caption |
| `listing` | `.tracy-listing` | section head · entries: title · meta · excerpt · pagination |
<!-- sections:end -->

`landing` is the composite: every section except the two pages. On WordPress it is a pattern of
patterns; on Joomla it is the concatenated markup without the hero, because `home.php` draws the
hero from the article's attribs.

Email, newsletter, poster and deck of the design library are not web pages and are not here.

## Why block markup as the source

An agent seeding a customer's site should meet the same section names, classes and order on both
platforms. WordPress needs block markup to keep the sections editable in the Site Editor; Joomla
needs plain HTML in an article body. Block markup is plain HTML plus comments, so one source
serves both, and the CSS never has to know which platform it is on.

Rules for a new section: start with a block comment; core blocks only (`group`, `heading`,
`paragraph`, `buttons`, `list`, `quote`, `details`, `image`, `table`, `html` — not `columns`,
whose flex rules fight a grid); the section and every part a seeder must find carry a `tracy-*`
class, looks are utilities; `summary` and `cite` stay class-free (a class there breaks the core
block) and are styled in `sections.css`; no inline styles; image paths under
`/wp-content/themes/tracy/assets/img/` (the build rewrites them for Joomla); English only. Add the
name to `ORDER` in `scripts/build.mjs` and a title to `TITLES`.

```
pnpm --filter @tracy/cms-sections build     # write into both themes
pnpm --filter @tracy/cms-sections check     # exit 1 when either theme is stale
pnpm --filter @tracy/cms-sections test
```

Run the two theme builds afterwards to refresh their zips.
