# Gotchas Catalog — JoomlArt Dark Mode

> **Phases 5–8 reference — the dark-mode bug catalog (origin/specialist source).** Many entries have a
> build-time twin in the builder's `gotchas.md` (#N) and a QA-detection twin in the Phase 8b pack
> (`platform-latent-bugs.md` P##, `recurring-defects.md` `[DARK-*]`); see
> per-entry cross-refs. (Entries are grouped thematically — numbers are historical/stable, not
> sequential in file order.)

Every item is a bug actually hit (and fixed) while theming JA templates (T4/T3). Read it before
you start; re-read when something "doesn't show up" or "looks broken". `<DARK>` = your dark hook
(`html.t4-dark` / `html[data-theme="dark"]`).

> **These are PATTERNS, not a checklist of selectors.** Every template differs — class names,
> which colors are hardcoded vs var-driven, how cards are composed all change. The selectors,
> hex values and var names below are **examples** from real templates. Learn to **recognize the
> bug class**, then **probe your template** for its actual selector/value/source-rule and write
> the fix for *that*. Never paste an example selector hoping it exists; it usually won't.

## A. Build / cache / sync

### 1. The framework bundles & minifies CSS+JS — clear cache after EVERY edit
Your edit will NOT appear until the bundle is cleared. `scripts/clear-cache.sh` auto-detects:
- **T4**: `media/t4/optimize/{css,js}/*` + `administrator/cache/t4asset/*` + Joomla `cache/` +
  `administrator/cache/`.
- **T3**: `t3-assets/*` + `cache/*`.
The individual `template.css`/`custom.css` link may not appear in page HTML (the optimizer merges
them into the hashed bundle) — grep the bundle, don't hunt for the `<link>`. Bundle names are
hashed, so after clearing, the next load gets a fresh URL (no stale copy). NOTE: `darkmode.css`
injected via `addCustomTag` is NOT merged — it appears by name as the LAST stylesheet, which is
exactly how you verify the load order is correct: `curl -s <url> | grep -nE 'optimize|darkmode'`
must show the optimize bundle BEFORE `darkmode.css` (gotcha §49). _Twins: builder #1 / design-review P17._

### 2. The stale-cache trap (the #1 time-waster)
A user screenshot — or your own — may show the state from BEFORE you cleared cache. **Never
conclude from a screenshot alone.** After any edit: clear cache → load the page once to force a
rebuild → re-probe the **computed value** with `getComputedStyle`. Only the computed value
proves the rule landed. Most "still broken!" reports trace to a stale cache (yours OR the user's
browser — tell them to hard-refresh).

### 3. DDEV + Mutagen async-sync trap (Mac)
With DDEV's Mutagen file-sync, host edits reach the container **asynchronously**, and aggressive
host-side `rm -rf` / `find -delete` on cache dirs can **halt** the sync
(`halted-on-root-deletion`) — after which host edits silently never arrive. Symptoms: served
bundle `Last-Modified` is old; optimize files look missing on host but `curl` still returns
them. **Prefer clearing cache INSIDE the container** (`ddev exec "…clear-cache…"`), not bulk host
deletes. Recovery: `ddev mutagen reset` / `ddev restart`.

### 39. Bundles are built PER LAYOUT/PAGE — and the first probe after a clear can race
The framework may build a **different bundle per layout** (home vs blog vs article each get their
own hashed file). Warming one page does NOT rebuild the others — each rebuilds on its own first
load, possibly with a **stale custom.css** if the file-sync hadn't finished. Symptom: a fix
verifies on one page and "mysteriously" fails on another, or a probe returns a ghost value that a
second probe (or CDP rule trace) contradicts. Rule: after a clear, load the page you're probing
at least once, and **re-probe before chasing a weird value** — one measurement right after a
cache clear is not evidence. _Twins: builder #1 / design-review P17._

## B. Specificity / scoping — when your override "doesn't win"

### 4. Find the winning rule, then match/beat it (do this EVERY time a rule doesn't apply)
Your `<DARK> .x { color }` may lose to a more specific rule. Don't pile on `!important` blindly —
**grep the served bundle** for the bad value/selector to learn what you're fighting, then write a
selector that ties-or-beats it. The usual winners this session:
- an **ID** rule (`#accordionTour .accordion-item{background:#fcfcfc}`) → add the ID to your selector.
- an **`!important` utility** (`.text-primary{color:…!important}`, `.text-dark`) → you need `!important` too.
- a **deep class chain** (`.view-x.layout-y .tour-item .info-article{…}` = 4 classes) → replicate the chain under `<DARK>`.
- a **pseudo-class state** (`.heading-link:hover{color:var(--color-primary)}`) firing when a parent is `.show`/hovered.
```bash
curl -s "<url>/media/t4/optimize/css/<hash>.css" | grep -oE "[^{}]*<selector>[^{}]*\{[^}]*\}"
```

_Twin: design-review `[DARK-STUCK-LIGHT]` / P1._

### 5. You are fighting variant + hero rules, not just base
Per-home **variant** CSS and `…has-hero …` / `…has-bg …` rules are high-specificity and load late.
Match or exceed their specificity: prefix with `<DARK>` AND replicate the variant's class chain.

### 6. Multi-selector prefix leak
Each comma-separated selector is independent. `<DARK> .a, .b { … }` applies `.b` in **both**
modes. Audit every comma list — one missing prefix is a silent light leak.

### 7. Don't blanket-override `a` OR bare `p/li/span`
- A bare `<DARK> a { color }` leaks onto `.btn` text, on-image titles, breadcrumbs, footer.
- A bare `<DARK> span:not([class*=btn]) { color:var(--dm-text) }` **washes out badges and
  colored-bg cards** (a `.badge.bg-info`/`.card.bg-primary` should keep its own white/dark text).
  Let body text inherit `--dm-text` from `body`; theme prose links with `.t4-content p a`, and
  remap `--body-text-color` for the rest. Reserve element rules for specific fixes.

### 35. The dark scope's EXTRA specificity beats light's single-class color rules
Even a "harmless" `<DARK> a { color }` is `(0,1,2)` — it OUTRANKS every light rule with one
class and fewer elements (`.label{color:#fff}`, `.btn-primary{color:#fff}`, `.carousel-control
{color:#fff}`, an on-overlay title rule). Symptom: accent-red text appears on colored fills,
buttons, photo-overlay headings. If you keep a blanket link rule, budget a **restore set**:
re-assert white-on-fill for labels, semantic buttons, carousel controls, category-title chips,
and any text sitting on a colored overlay. The contrast audit finds these (accent-on-fill ≈1.x). _Twin: design-review `[DARK-STUCK-LIGHT]` / P1._

### 36. When you override a STATE rule, carry EVERY property light's state rule sets
Light's hover might be `{ background:#f5f5f5; color:#262626 }`. If your dark hover only sets
`color`, light's white hover **background still applies** → light-text-on-white-chip, invisible.
Before writing any `:hover`/`:focus`/`.open` override, read the source state rule and override
ALL its visual properties (bg + color + border), not just the one that looked wrong.

### 37. Page/layout classes may live ON `<html>` — compound, not descendant
`layout-*`, `home`, `cat-*`, `view-*` often sit on the `<html>` element itself. Then
`<DARK> .layout-blog .x` (descendant) **never matches anything** — it must be the compound form
`html<DARK_SUFFIX>.layout-blog .x` (no space). Symptom: a whole page-scoped block silently
no-ops while everything else works. Check where these classes live in discovery, and audit every
dark rule that mentions a page-level class.

### 38. Specificity ties break on ELEMENT count — replicate the source's elements
Two rules with equal class counts are decided by element count, then file order. If the source is
`.wrap .article-title h3 a:hover` and yours is `<DARK> .wrap .variant .article-title a:hover`,
the source's extra `h3` can still win. When a tie "mysteriously" loses, count elements and add
the same ones (`h3 a`, not just `a`).

### 38b. `-webkit-text-fill-color` paints the glyphs — a `color` override (even inline `!important`) won't repaint them
Some templates paint link/title text through **`-webkit-text-fill-color`** (which defaults to
`currentColor`, so it silently follows `color` until you fight it). Symptom that looks impossible:
your `<DARK> … { color: var(--dm-accent) !important }` is present, matched, and LAST in the CDP
cascade — yet the rendered text stays the brand colour, and even an **inline** `el.style.color=
'…!important'` or an injected `<style>` fails to change it. Tell-tale: `getComputedStyle(el).color`
reports the OLD value no matter what you do, while a **screenshot** is the only truth. Fix: set
**both** properties in the dark rule —
```css
<DARK> .btn-readmore { color: var(--dm-accent) !important; -webkit-text-fill-color: var(--dm-accent) !important; }
```
Verify by SCREENSHOT (or read `getComputedStyle(el).webkitTextFillColor`, not `.color`). Seen on
JA Athena's `.readmore .btn-readmore`, `mod-articles-category-title:hover`, and category-name link
hovers. (Also: confirm the hover value is SETTLED, not a mid-transition frame — wait ~400ms; see §32/§47.)

### 38c. A `transition` on the property makes flip-and-read probes return the OLD (light) value
The probe recipe "set the hook → read computed → flip back" is **unreliable for any transitioned
property**. Templates commonly ship `transition: border-color .15s ease-in-out, box-shadow .15s`
on `.form-control`. `getComputedStyle` returns the **animated/used** value, so reading in the same
tick after flipping `data-theme` hands you the **pre-flip light value** — a phantom bug.

Symptom that looks impossible (and is the tell): the dark rule is present, matched, and LAST in
the CDP cascade, yet the value stays light — and it does not budge for an injected `!important`
rule **or even an inline `el.style.setProperty(…, 'important')`**. Meanwhile OTHER properties from
the *same declaration block* (background-color, outline) apply fine. A cascade problem cannot be
property-selective within one block — so when only the transitioned property "loses", suspect the
transition, not the cascade.

Fix: read STEADY state — either load the page natively in dark (T4 cookie + server-resolve) or
`waitForTimeout(500+)` after the flip. Confirm with `getComputedStyle(el).transition` before
filing anything. The `scripts/` scanners read steady state and are unaffected; it's ad-hoc
flip-and-read probes (and hover probes, §38b/§47) that get burned.
_Seen on ja_educatsy: `#password` read `#f4f4f4` (light's border) right after the flip; settled it
read `#4a4170` = `--dm-field-border`, i.e. correct all along — several rounds lost chasing it._

## C. The color TOKEN layer (biggest lever, easy to miss)

### 8. Remap the template's vars, not 50 elements
JA/T4 drive most colors through custom properties. Re-point them once under `<DARK>` (see
`css-architecture.md`): `--heading-color`, `--body-text-color`, `--border-color`,
`--body-bg-color`, `--color-light`, `--mainnav-link-color`/`-hover`, Bootstrap `--t4-*`. Keep
`--color-primary` (brand). One remap fixes contact labels, article meta, nav carets, palette
sections, etc. simultaneously. Discover the real names: `grep -oE '\-\-[a-z-]+color[^;]*' bundle`.

### 9. `--body-bg-color` feeds edge-MASKING pseudo bars
Carousels/sliders draw 2px strips with `background:var(--body-bg-color)` to hide a frame's ends
(e.g. testimonial `.owl-stage-outer::before/::after`). On white they vanish; if you forget to
remap `--body-bg-color`, they show as **bright vertical "borders"** on dark. Symptom: a "thick
white border" around a carousel that you can't find as an element border — it's a pseudo bar.
**Audit `::before`/`::after`**, not just elements.

### 10. Section-local var overrides win over your root remap
A module may set `--heading-color:#fff` on its own element (white text over a photo). Your root
remap won't touch it — usually correct. Probe the *element's* computed var, don't assume the root.

## D. Surface vs transparent (the #1 churn source) — see css-architecture §"Surface vs transparent"

### 11. A white-in-light card means one of two opposite things
- **Blends-on-white** (image beside text, author/founder bio, featured side-panel, `margin-top:0`)
  → **transparent** in dark. A dark surface = a mismatched "two-color" box. (The user WILL call
  this out.)
- **Overlaps the photo** (`margin-top` negative) → **opaque `--dm-surface`** + **square top
  corners**. Same `.item-content` class can be both — distinguish by wrapper class, not margin.

### 12. Rounded-corner seam gap (image+content)
An opaque content card with rounded TOP corners overlapping a photo reveals page bg in the corner
notch → invisible on white, a **black gap** on dark. Square the card's top corners + give the
image container `background:var(--dm-surface)`.

### 13. Frosted-white-over-photo panels: keep the frost, darken the TEXT
Destination labels / blog-teaser glass panels are `rgba(255,255,255,.7)`+blur with dark text.
Do NOT repaint them dark (that's an ugly two-tier box). Keep the white frost; reset their text to
dark (`--heading-color`/`--body-text-color` + explicit dark on title/meta), exactly like light.

## E. White / navy-on-dark leaks — probe these specific spots

### 14. Elements that keep a light value the global rules miss
Probe and override each: badges (`#fff`/grey) • Choices.js widgets • native `<select>` •
Bootstrap dropdowns • Joomla switcher track • heavy light borders (cards, form containers,
pagination counter, **sidebar divider**, **header bottom-border** `#e9ecef`) • profile
`.dl-horizontal` values • off-canvas group titles • `.content-info`/`.info-article`/`.item-content`
card panels • accordion items (often an **ID** rule) • map-widget containers (3rd-party; dev-only).

### 15. `.btn`-styled text links keep the brand color → invisible on dark
Article prev/next **pager** links are `.btn` elements, so the content-link rule (which excludes
`.btn`) skips them. Probe the computed color; if it's brand primary on dark bg, lighten it (mirror
light), accent on hover. Note the pager is often **box-less in light** (just text + divider lines)
— don't give it a dark box; keep it transparent and only lift the text.

### 16. input:focus reverts text/bg to the light value
Inputs re-assert a light `color`/`background-color` on `:focus`/autofill. Add
`<DARK> input:focus, textarea:focus { color:var(--dm-text); background:var(--dm-surface-2); }`.

## F. Icons & images (bg-color audits MISS all of these)

### 17. Background-IMAGE *icons* baked into elements (search, folders, carets)
Icons are often a **dark PNG/SVG in `background-image`** (a hero search magnifier; bullet/folder
icons). On a dark field they're invisible. Fix by swapping the image for a **light inline-SVG**
data-URI — AND set `background-repeat:no-repeat` (a swapped image with no `no-repeat` **tiles into
a row of icons**). Scope the swap to the field that actually has the dark icon (other search
inputs may have none — adding one tiles).
```css
<DARK> .hero .mod-finder input.form-control{
  background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg …stroke='%23c2c9d6'…%3E");
  background-repeat:no-repeat;}
```

### 18. Logo with baked-in dark text (`<img>` SVG/PNG)
The logo file has a colourful mark + **dark "wordmark" text** → unreadable on the dark header /
off-canvas. Make a recolored copy (replace the dark text fills with a light color, keep the mark
colours) and swap it ONLY in dark via `<DARK> .logo-img{ content:url('…-dark.svg'); }`. Light
keeps the original. _Twin: design-review P3 `[DARK-LOGO/IMG-NOT-FLIPPED]`._

### 19. Background-IMAGE *sections* (hero/CTA over a photo)
A light photo + light heading = washed out, and bg-color audits never see it. Darken with an
inset overlay on the existing `.mask`/`.bg-overlay-image` layer:
`<DARK> .bg-overlay-image{ background-color:rgba(<page-rgb>,.55); }`. **Scan for
`background-image`, not just bg-color.** If the overlay paints OVER the content (washed title),
lift the content: `<DARK> .bg-overlay-image ~ *{ position:relative; z-index:1; }`.

### 20. Palette / utility bg classes carry LIGHT values
`.bg-light`/`.bg-white`/`palette-gray`/`palette-blue` hold light colors → remap the var they read
(`--color-light`, `--t4-light`) rather than fighting each rule. A standalone **breadcrumb /
masthead bar** built on a palette class stays bright → darken the section, light text on top.
Confirm the class isn't reused with a different intent first. _Twins: builder #58 / #18 · design-review P25._

### 21. Color seam between adjacent sections
An overlaid image section renders slightly lighter than the solid page bg next to it. Smooth the
boundary by fading the section's top/bottom edges to `var(--dm-bg)` with a `::before` gradient.

### 40. Inset box-shadow "frames" — invisible to border scans, and they STACK into fat lines
Templates draw 1px frames with `box-shadow: inset 0 0 0 1px <light>` on containers (mainbody,
sidebar, featured boxes, section headings). Two traps:
- A border scanner never sees them (they're not borders) — **sweep `box-shadow` separately.**
- **Nested frames COINCIDE** at shared edges (the sidebar's ring sits on the content frame's
  ring). On light's white page the doubling is invisible; on dark every line shows, so shared
  edges read as a **2px-thick line** — owners report "borders too thick / inconsistent".
Resolution that keeps light's look: KEEP the outer frame, and make each inner box draw **only
the edges the frame doesn't already cover** with directional inset shadows
(`inset 1px 0 0 0 c` = left edge only; combine for left+bottom). Every component edge ends with
exactly one subtle line. Also drop redundant element borders that coincide with the frame
(e.g. a pager's left border at the frame's left edge). Detect with a coincident-line scan
(`scripts/review/seam-scan.mjs`).

### 41. Normalize ALL divider colors to ONE token — and "strong bar" does not mirror to "bright bar"
Owners immediately notice when dark borders are **inconsistent** (#666 here, #f0f0f0 there,
#e5e5e5 leaking elsewhere) even when each one individually "mirrors" something. Route every
divider/frame/separator through the single `--dm-border` token; reserve at most one
slightly-lighter step for field outlines (see #42) and one for decorative carets.
And: a strong DARK bar in light (`#111` on white) does NOT mirror to a near-white bar on dark —
bright lines on dark read far heavier than dark lines on white. Default such bars to the border
token; only escalate if the design genuinely loses an anchor.

### 42. Field borders need one step ABOVE the divider token
Inputs get an elevated fill (`--dm-surface-2`). The divider token (`--dm-border`) is tuned to be
subtle against the PAGE — against the input fill it's invisible, so fields lose their outline
(forms look like floating text). Give `input/select/textarea` (and outline buttons) a border one
step lighter (e.g. `#4a4a4a` family) so the boundary reads like light's `#ccc`-on-white.

### 43. `border-color: inherit` in the template's :focus rules
Some templates reset focus borders with `border-color: inherit` — in dark that resolves to an
ancestor's (light) text color and the focused field suddenly grows a bright border. Override
focus with an explicit color; never assume the rest-state fix covers focus.

## G. Components — interactive states & menus

### 22. Hover/active makes text the SAME color as its new bg → invisible
Tag pills, category links: rest = accent text on a pill; hover = accent **bg** but the text rule
keeps accent → **accent-on-accent, invisible**. Force `color:#fff !important` on `:hover`. Always
probe the hover state (`browser_hover` or force the class).

### 23. Active class lives on the `<li>`, not the `<a>`
Joomla marks the current item `<li class="active current">`, so `<DARK> .nav-link.active` never
matches. Use `<DARK> .active > .nav-link, <DARK> .current > .nav-link` to carry the accent.

### 24. Mega menu — three separate misses
- Column **headings** (`.mega-col-title`/`.module-title`) are often a hardcoded `#212529` → lift to heading color.
- Descendant **link colors** read `--mainnav-link-color` (scope the remap to the dropdown) — and a `--mainnav-link-active-color`.
- When the menu is **open** (`li.show`/hover), a state rule can paint descendant promo titles AND
  categories the accent → they read as the *same level*. Restore hierarchy: title = heading
  bright, category = muted, keep only the bullet/accent. (Use `!important` if the open-state wins.)
- The **caret** is a CSS triangle `::before`/`::after` whose `border-top-color` = `--mainnav-link-color` → light it.

_Twin: design-review P77._

### 25. Off-canvas — uniform background + arrows
- The drill-down submenu (`.dropdown-menu`) inherits the **megamenu** `--dm-surface-2`, a different
  shade than the panel (`--dm-surface`) → a **two-tone split**. Pin the off-canvas submenu + its
  `.sub-menu-back` to the **panel** color so the child menu matches the parent (in light both are
  one white surface).
- Top-level off-canvas links inherit a near-black `--body-text-color`/`--mainnav-link-color` via a
  4-class `.navbar .nav-link` rule → match that specificity.
- The submenu **arrow** is `.btn-toggle` (a light circle `#f2f4f6` + a FontAwesome chevron
  `#adb5bd`) → make the chevron light, drop the circle.

_Twins: design-review P40 / P12._

## H. Toggle / PHP plumbing

### 26. Prefer inline SVG icons over icon fonts
Icon-font versions differ (FA6 vs bundled FA4). Inline `<svg>` sun/moon avoids glyph-mismatch
bugs. If you must use the font, match the version Joomla actually loads.

### 27. (T4) template.js is bundled to the FOOTER → pre-paint via index.php
With JS-optimize ON, `js/template.js` loads at body-end, so a pre-paint resolver there flashes.
Inject the resolver into `<head>` via `$this->addCustomTag('<script>…</script>')` in the template
`index.php` (it renders inside `getBuffer('head')` and the optimizer leaves raw custom tags alone).

### 28. Standalone docs are separate full HTML documents
`offline.php`, `error.php`, `error-t4.php` don't go through the normal head — each needs its **own**
pre-paint `<script>` AND a guarded `<link>` to **`darkmode.css`** (NOT custom.css, which is now a
stub). Easy to forget — own review item. Full detail + the "moving dark out of custom.css breaks
them" trap: **gotcha §52**. _Twins: builder #6 · design-review P81._

### 29. CRLF header files (T3, and any header PHP you edit)
Some `header_style-N.php` use CRLF — the Edit tool's `\n` won't match. Detect with `file <path>`;
edit via Python with `newline=""`, or normalize to LF once. (T4's static button goes in a `.html`
layout override, which avoids editing CRLF header PHP; T3 still edits the header variants.)

### 30. Expanding search overlay must be opaque
A header search that expands `position:absolute` over the nav with a translucent bg lets menu text
bleed through → broken in **both** modes. Make expanding overlays opaque.

### 44. Owners prefer a TWO-BUTTON switch over a single state-flip button — and placement matters
A lone icon button that flips state reads as "what does this do?". A **segmented sun|moon
switch** (two buttons, active one gets a chip, clicking the other side switches) shows the
current mode and the alternative at once. Markup: one shared block, delegated document-level
click on `[data-set-theme]`. Placement that survived owner review: the **topbar/utility bar,
next to the search module** — one consistent location on every page/layout (and such bars are
often `position:fixed` on mobile, so it stays reachable). Avoid per-header in-flow placements:
they differ per layout and collapse badly on mobile.

### 45. Toggle placement traps: relative grid columns + mobile pointer interception
- **Grid columns are `position:relative`** (Bootstrap `.col-*`): an absolutely-positioned toggle
  inside a column pins to the COLUMN, not the header. Put the control outside the column, or make
  the intended ancestor the positioned one.
- On mobile the header collapses to block layout — a flex wrapper around the toggle can stretch
  **full-width over the hamburger** and intercept its clicks (Playwright: "element intercepts
  pointer events"). Always TEST CLICKING the off-canvas/hamburger button at mobile width after
  adding the toggle.
- **Surface-aware active chip**: the active-segment chip color depends on the surface — a dark
  chip works on the light topbar but vanishes on an always-dark panel (off-canvas); invert the
  chip per surface.

## I. Discipline — avoid false positives & churn

### 31. By-design components — probe BOTH modes; if light==dark, DON'T touch
Real examples that are correct as-is (changing them makes dark *differ* from light):
- **blue prices** on tour cards (`#0d6efd` in both modes);
- **brand-color buttons** — white text on the orange/accent fill (~2.8 contrast) is the brand's
  own choice, identical in light;
- Bootstrap **colored badges/cards** (`.badge.bg-success` etc.) keep their built-in text color;
- a **hero nav that's white-by-design** even on a light page.
These will be "flagged" by a naive reviewer or contrast audit — verify against light and leave them.

### 32. Verify-before-fix — mirror light, every state
Before changing anything: probe **light vs dark with the same selector**, for **rest, hover, AND
active**. If light already shows the "wrong" value, it's by design → don't change it.

### 33. Reproduce the exact failure before claiming "fixed"
Don't announce a fix from a plausible edit. Reproduce the failing **computed value** first, make
the change, clear cache, re-probe, confirm the value changed. Premature "fixed, all good" on a
stale cache is the fastest way to lose the user's trust.

### 34. Authorized light-mode fixes are the exception
Genuinely-broken controls (cramped padding, off-center icon): fix **dark-scoped by default**;
touch light **only** when the user explicitly asks — and call it out.

### 46. Visual (screenshot-compare) reviewers produce MANY false positives — gate every finding
Agents reading full-page screenshots at thumbnail scale will flag demo placeholder images as
"white leaks", correctly-subtle borders as "missing dividers", readable text as "dark-on-dark",
and identical-in-light components as bugs. In one full sweep, ~20 of ~25 visual findings died at
the probe gate; the real bugs were found by the *computed-value* scanners. Treatment: give visual
reviewers the by-design list (especially placeholder images), require them to describe the LIGHT
side of every finding, and verify each finding yourself with a light-vs-dark probe before
touching CSS. Never fix from a screenshot description alone.

### 47. Interactive-state audits must DRILL INTO open menus (two-level hover)
Dropdown/megamenu items only exist in a hoverable state while the parent is open. A scanner that
hovers visible elements on the closed page never reaches them — which is exactly where
hover-background leaks hide (see #36). Open each dropdown/megamenu (hover or `.open` class),
then hover the items INSIDE; same for off-canvas drilldowns. `scripts/review/hover-scan.mjs` does the
light-vs-dark same-state comparison; make sure menus are open when it runs. _Twin: design-review P2._

## J. Playwright operational notes

- Set the theme deterministically: toggle via the page, or set the hook directly
  (`html.t4-dark` class / `data-theme` attr) before measuring. `colorScheme:'dark'` works only
  after the pre-paint resolver (prefers-color-scheme fallback) is installed.
- Inspect interactive state (focus, open dropdown, off-canvas, hover/active) by driving it
  (`.focus()`, `.click()`, `browser_hover`) or forcing the class, then read computed style.
- **First match is often a hidden owl-carousel clone** → filter to visible elements
  (`getBoundingClientRect().width>0 && offsetParent`) before trusting a probe.
- For a "gap/seam", `getComputedStyle` says little — use **`elementFromPoint`** down the seam, or
  screenshot a zoomed strip; the truth is in rendered pixels, not the box model.
- Disable AOS for static shots (`[data-aos]{opacity:1!important;transform:none!important}`) so
  scroll-in content isn't invisible. Prefer full/viewport screenshots; kill hung probes:
  `pkill -9 -f node`.
- **When a CSSOM walk over `document.styleSheets` returns nothing** (it can, silently — minified
  bundles, huge rule counts), don't trust it: use the CDP route for the authoritative cascade:
  `CSS.getMatchedStylesForNode` (Playwright: `context.newCDPSession(page)` → `DOM.enable`,
  `CSS.enable`, `DOM.querySelector`, `CSS.getMatchedStylesForNode`; `CSS.forcePseudoState` for
  hover/focus). The LAST matched rule wins — this settles "which rule actually paints this".
- Local dev TLS is usually self-signed → `ignoreHTTPSErrors: true` in every context; and pages
  with third-party embeds never reach `networkidle` → use `waitUntil: 'load'`.

## K. Delivery architecture pitfalls — read before scaffolding

These bit us across ja_trip / ja_impact / ja_morgan; ja_vega got them right. They are the SHARED
plumbing (separate file, load order, static button, standalone docs, OS-follow) and apply to both
frameworks. **The persistence + pre-paint layer, though, is framework-specific: on T4 it is the
mandatory cookie + server-resolve standard (`references/darkmode/gui-config-delivery.md`); on T3 it is
localStorage (`references/darkmode/css-architecture.md` §"Delivery architecture").** Where a gotcha below
shows `localStorage`, that is the T3 form — the T4 equivalent uses the cookie `ja_<name>-theme`.
Verify with `scripts/review/toggle-test.mjs`.

### 48. Dark rules in `custom.css` collide with the owner's file — use a separate `darkmode.css`
`custom.css` is the SITE OWNER's file: on T4 the admin **"Edit Custom CSS"** screen reads/writes it
(`plugins/system/t4/admin/src/Action.php`), on T3 it's the owner's tweak slot loaded by `head.php`.
Putting the dark theme there means owner edits clobber it (or vice-versa) and the two concerns
tangle. **Always** put dark in its own `css/darkmode.css`; leave `custom.css` a clean stub. _Twins: builder #4 · design-review `[DARK-DELIVERY-NONSTANDARD]`._

### 49. `darkmode.css` must load AFTER `template.css` — `registerAndUseStyle` can load it BEFORE
The dark rules only beat the template on **specificity**; any equal-specificity tie is decided by
**source order**, so darkmode.css loading first = light leaks. `WebAssetManager::registerAndUseStyle`
(called in index.php before T4 renders) can place darkmode.css ahead of the template bundle — vega's
one weak spot (it survives only because every rule carries the `[data-theme]` scope). **Robust fix
(T4):** inject the stylesheet with `$this->addCustomTag('<link …darkmode.css?'.filemtime().'>')` —
custom tags render LAST in `<head>` (after the optimize bundle). **T3:** `addStyleSheet` right after
the custom.css block in `head.php`. Confirm order: `curl -s URL | grep -nE 'optimize|darkmode'`. _Twin: builder `css-tokenizing.md` §3e._

### 50. Build the toggle button as STATIC markup, not in JS
A JS-created button flashes in after load, can miss a header variant, and races the click wiring.
Put `<button class="…-theme-toggle">` (inline sun+moon SVG) directly in a **layout override**
(T4: `html/layouts/t4/block/<mainnav|header>.html`; T3: every `tpls/blocks/header/header*.php`).
JS only **delegates** the click. For split headers (separate mobile bar) ship two copies and let
Bootstrap `d-lg-none` / `d-none d-lg-inline-flex` pick per breakpoint — no JS host-detection. On a
navy/topbar surface force the icon white. Verify ONE visible toggle at desktop AND at mobile width. _Twin: builder #42._

### 51. The JS needs an OS `matchMedia('change')` listener
Pre-paint resolves the OS preference once; without a live `matchMedia('change')` handler the page
won't follow a runtime OS light↔dark switch. Add it, and gate it on "no explicit choice stored"
so it never overrides the user's click — T4: `if (getCookie()) return;` (and only follow the OS when
`window.jaResortTheme.def === 'auto'`); T3: `if (localStorage.getItem(KEY)) return;`.

### 52. Standalone docs (offline.php / error.php / error-t4.php) need their OWN wiring
They bypass the main layout, so they don't get index.php/head.php's pre-paint or asset loads. Each
needs its own pre-paint `<script>` AND its own `<link>` to **darkmode.css**. CRITICAL: moving dark
OUT of custom.css **breaks** any standalone doc that previously loaded it via custom.css — update
their `<link>` from custom.css to darkmode.css (and switch any old `t4-dark`-class pre-paint to the
`data-theme` form). Test a 404 in dark → body must be dark (T4: set the `ja_<name>-theme=dark`
cookie and reload — the standalone doc must resolve it server-side; T3: `localStorage['<name>-theme']='dark'`).
**On T4 the standalone docs must repeat the SAME server-side resolution as index.php** (honor the
admin lock/default + cookie + OS), not just read a cookie. _Twins: builder #6 · design-review P81._

### 53. Don't restyle the toggle to a "chip" — match the template's OWN header, and PRESERVE an existing button
The toggle button must look like it belongs to *this* header — not a generic grey pill. Two traps:
- **The grey chip (`background: rgba(127,140,160,.12)`) is NOT a default.** It exists in ja_vega
  ONLY because that toggle sits over a HERO PHOTO, where a bare icon would vanish on light patches —
  the faint chip backs it. On a **solid header** (trip, impact, morgan) the correct look is
  **`background: transparent`** with `color: inherit` (icon follows the header text colour), or the
  template's own header-item treatment (e.g. impact's full-height **square cell** with faint
  vertical dividers beside the "Donate now" CTA). A grey chip on a solid header reads as unbalanced
  and foreign — owners notice immediately.
- **When you MOVE an existing dark mode (e.g. into darkmode.css), preserve the button's existing
  styling — don't swap it for the scaffold's example.** "Move the CSS" means relocate it, not
  redesign it. If the template already had a toggle (square cell, transparent round, etc.), keep
  that exact look; only the *file location / class plumbing* changes. Copy the original button rules
  over verbatim (adapt only the icon selectors to the static markup).

Decide per surface (extends gotcha on icon colour): solid header → transparent button, icon =
header text colour, subtle hover wash; hero-over-photo / navy bar → light icon, and a faint chip
ONLY if the icon needs backing. Verify with a header screenshot in BOTH modes, not just the probe.

### 54. `?theme=dark|light` must win for ONE load, before paint, and never be saved
Tracy's Design inspiration preview frames the template's demo from another origin and asks for a
theme with `?theme=light|dark`. It cannot reach the site's cookie, and an iframe's `color-scheme`
does NOT change the framed page's `prefers-color-scheme` (measured) — so a template that resolves
first paint from cookie → GUI default → OS only shows whatever the visitor's OS says, and the
preview's Light/Dark buttons do nothing (nine released templates shipped exactly this, 29/09/2026).
The rule, on every surface that resolves a theme (`index.php`, standalone docs, `darkmode.js`):
the address wins over the cookie, the GUI default and the OS; it is applied at first paint by the
server-side resolver; `darkmode.js` does not let an OS `change` take it back; and it is NEVER
written — only a click on the toggle writes the cookie. All three hooks move together
(`data-theme`, `data-bs-theme`, `html.t4-dark`). Copy the blocks in `dark-light-mode-standard.md`
§1/§3/§4; `scripts/review/dark-toggle.mjs` fails a template that misses any part of it.

## L. Build-time twins documented in the builder (back-port stubs)

These dark-mode bugs were first catalogued in the **builder** (`references/gotchas.md`)
and the Phase 8b review pack. They apply to dark mode too — full fix recipes live there; one-liners here so
they're not missed when working only from this skill:

- **`<pre>`/`<code>` article code blocks stay near-white in dark** → illegible. Ship an always-dark
  `<pre>` rule scoped to single-article prose. _Builder #67 · design-review P60 `[ARTICLE-CODE-BLOCK-UNREADABLE-DARK]`._
- **`figure figcaption` rendered as a dark caption bar** (the T4 legacy stylesheet) → unexpected dark
  strip under images. _Builder #62._
- **Heading font/weight/line-height read from `etc/site/default.json`** (NOT `etc/theme/`) — the blank's
  defaults silently win; set them in the SITE params. _Builder #57._
- **T4 palette wrappers (`.t4-palette-gray`/`.t4-palette-light`) hardcode light hex** → remap the var,
  don't fight each rule (see §20). _Builder #58._
